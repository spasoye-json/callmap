/**
 * The door from the map into the code (ADR-0006: editor integration is one URL scheme). The UI
 * builds the deep link from a node's anchor and the sidecar hands it to the system opener, so the
 * shell needs no permission to open a custom scheme and the Rust layer stays thin.
 */

import { spawn } from 'node:child_process';
import { Refusal, requireString } from './requests.ts';
import type { Command } from './passes.ts';
import type { OpenInEditorResult } from './trace-protocol.ts';

/** Opens a URL with whatever the system registered for its scheme. */
export type UrlOpener = (url: string) => Promise<void>;

const EDITOR_SCHEME = 'vscode://file/';

const openerCommand = (url: string): readonly [string, readonly string[]] => {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
};

export const systemUrlOpener: UrlOpener = (url) =>
  new Promise((resolve, reject) => {
    const [command, args] = openerCommand(url);
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });

export const createEditorCommands = (openUrl: UrlOpener): ReadonlyMap<string, Command> => {
  const openInEditor = async (request: Record<string, unknown>): Promise<OpenInEditorResult> => {
    const url = requireString(request, 'url');
    if (!url.startsWith(EDITOR_SCHEME)) {
      throw new Refusal(
        'malformed-request',
        `'url' must be an editor deep link under ${EDITOR_SCHEME}`,
      );
    }
    try {
      await openUrl(url);
    } catch (error) {
      throw new Refusal(
        'editor-failed',
        `the system could not open ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { opened: url };
  };
  return new Map<string, Command>([['open-in-editor', openInEditor]]);
};
