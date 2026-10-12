/**
 * How the sidecar knows an extractor: by the language it claims, the files it reads, and the
 * process it runs as (ADR-0009). A new language is one more registration, and the command surface
 * does not change for it.
 */

import { spawn } from 'node:child_process';

export interface ExtractorRun {
  /** The repo as an absolute path. */
  readonly repo: string;
  readonly scope: readonly string[];
}

export interface ExtractorRegistration {
  /** The tag the extractor stamps on its document, and the name the reader sees on open. */
  readonly language: string;
  /** Whether a repo-relative path names a file this extractor reads. Detection asks this. */
  readonly claims: (path: string) => boolean;
  /**
   * Run the extractor and hand back what it emitted, still unread. The sidecar reads it against
   * the contract, so a registration cannot vouch for its own output.
   */
  readonly extract: (run: ExtractorRun) => Promise<unknown>;
}

/** Thrown when an extractor process exits with a refusal or writes something that is not JSON. */
export class ExtractorFailure extends Error {
  override readonly name = 'ExtractorFailure';
}

/** The arguments every extractor process takes: the repo, then one `--scope` per glob. */
export const extractorArguments = (run: ExtractorRun): readonly string[] => [
  run.repo,
  ...run.scope.flatMap((glob) => ['--scope', glob]),
];

/**
 * Run an extractor as its own process and parse what it wrote to standard output. A non-zero
 * exit is a refusal, and its standard error is the reason the reader sees.
 */
export const runExtractorProcess = (command: string, args: readonly string[]): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      reject(new ExtractorFailure(`${command} could not start: ${error.message}`));
    });
    child.on('close', (status) => {
      const reason = Buffer.concat(stderr).toString('utf8').trim();
      if (status !== 0) {
        reject(new ExtractorFailure(reason === '' ? `${command} exited with ${status}` : reason));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
      } catch (_error) {
        reject(new ExtractorFailure(`${command} wrote something that is not a JSON document`));
      }
    });
  });
