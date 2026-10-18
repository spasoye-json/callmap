import { EDITORS } from '@archmap/editor-link';
import type { Editor } from '@archmap/editor-link';

export const USAGE =
  'usage: archmap review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--editor vscode|jetbrains]';

export class CliError extends Error {
  override readonly name = 'CliError';
}

export interface ReviewInvocation {
  readonly repo: string;
  readonly base: string | undefined;
  readonly scope: readonly string[];
  readonly tsconfig: string | undefined;
  readonly out: string | undefined;
  readonly open: boolean;
  readonly editor: Editor;
}

const VALUE_FLAGS: readonly string[] = ['--base', '--scope', '--tsconfig', '--out', '--editor'];

const isEditor = (value: string): value is Editor => EDITORS.some((editor) => editor === value);

export const readArguments = (args: readonly string[], cwd: string): ReviewInvocation => {
  const [command, ...rest] = args;
  if (command !== 'review') throw new CliError(USAGE);

  let repo: string | undefined;
  let base: string | undefined;
  const scope: string[] = [];
  let tsconfig: string | undefined;
  let out: string | undefined;
  let open = true;
  let editor: Editor = 'vscode';

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? '';
    if (argument === '--no-open') {
      open = false;
    } else if (VALUE_FLAGS.includes(argument)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`${argument} needs a value after it`);
      }
      if (argument === '--base') base = value;
      else if (argument === '--scope') scope.push(value);
      else if (argument === '--tsconfig') tsconfig = value;
      else if (argument === '--out') out = value;
      else if (isEditor(value)) editor = value;
      else throw new CliError(`--editor needs one of ${EDITORS.join(', ')} after it`);
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new CliError(`${argument} is not a flag archmap review knows`);
    } else if (repo === undefined) {
      repo = argument;
    } else {
      throw new CliError(`'${argument}' follows no flag; only one repo is reviewed at a time`);
    }
  }

  return { repo: repo ?? cwd, base, scope, tsconfig, out, open, editor };
};
