/**
 * The door from the map into the code (ADR-0006: editor integration is one URL scheme). The UI
 * builds the deep link from a node's anchor and the sidecar hands it to the system opener, so the
 * shell needs no permission to open a custom scheme and the Rust layer stays thin.
 *
 * The link is read back, held to a file inside the repo the request names, and built again, so
 * the opener only ever sees a link the core escaped. The opener runs a program with the link as
 * one argument and never a shell, so no character in a file name can run a command.
 */

import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { EDITOR_SCHEME, editorUrl, readEditorUrl } from '@archmap/canvas-model';
import { Refusal, requireRepo, requireString } from './requests.ts';
import type { Command } from './passes.ts';
import type { OpenInEditorResult } from './editor-protocol.ts';

export type UrlOpener = (url: string) => Promise<void>;

export const systemOpenerCommand = (
  platform: NodeJS.Platform,
  url: string,
): readonly [string, readonly string[]] => {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
};

export const systemUrlOpener: UrlOpener = (url) =>
  new Promise((resolvePromise, reject) => {
    const [command, args] = systemOpenerCommand(process.platform, url);
    const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolvePromise();
    });
  });

/** The link again, built from the file's path inside the repo, refused when it is outside. */
const linkInside = (repo: string, url: string): string => {
  const target = readEditorUrl(url);
  if (target === null) {
    throw new Refusal(
      'malformed-request',
      `'url' must be an editor deep link under ${EDITOR_SCHEME}/ that ends in a line`,
    );
  }
  const file = relative(repo, resolve(target.path));
  if (file === '' || file === '..' || file.startsWith(`..${sep}`) || isAbsolute(file)) {
    throw new Refusal('outside-repo', `${target.path} is not a file inside ${repo}`);
  }
  return editorUrl(repo, { file: file.split(sep).join('/'), line: target.line });
};

export const createEditorCommands = (openUrl: UrlOpener): ReadonlyMap<string, Command> => {
  const openInEditor = async (request: Record<string, unknown>): Promise<OpenInEditorResult> => {
    const url = requireString(request, 'url');
    const link = linkInside(requireRepo(request), url);
    try {
      await openUrl(link);
    } catch (error) {
      throw new Refusal(
        'editor-failed',
        `the system could not open ${link}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { opened: link };
  };
  return new Map<string, Command>([['open-in-editor', openInEditor]]);
};
