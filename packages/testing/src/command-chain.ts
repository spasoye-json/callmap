/**
 * The command chain a test runs to bring a repo copy to a known map: open and extract it as the
 * app does, store a key, curate the checkout, and trace it if asked. The surface is typed by its
 * shape only, so this package stays core and never depends on the sidecar it drives.
 */

import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import { placeAnOrderProposal } from './mixed-flow.ts';

/** The answer of one command, as the sidecar gives it. */
export type CommandAnswer =
  | { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** Whatever answers commands: the sidecar in the same process, in every test that uses this. */
export interface CommandSurface {
  handle(request: unknown): Promise<CommandAnswer>;
}

/** Send one command and give back its result, failing the test on a refusal. */
export const resultOfCommand = async <Result>(
  surface: CommandSurface,
  request: Readonly<Record<string, unknown>>,
): Promise<Result> => {
  const answer = await surface.handle(request);
  if (!answer.ok) {
    throw new Error(
      `${String(request['command'])} refused: ${answer.error.code}, ${answer.error.message}`,
    );
  }
  return answer.result as Result;
};

export const TEST_API_KEY = 'sk-ant-test';

/** Open and extract a repo under the whole-repo scope, and give back its documents. */
export const extractedDocuments = async (
  surface: CommandSurface,
  repo: string,
): Promise<readonly ReferenceGraphDocument[]> => {
  const opened = await resultOfCommand<{ readonly languages: readonly string[] }>(surface, {
    command: 'open',
    repo,
    scope: [],
  });
  const extracted = await resultOfCommand<{
    readonly documents: readonly ReferenceGraphDocument[];
  }>(surface, { command: 'extract', repo, scope: [], languages: opened.languages });
  return extracted.documents;
};

/** Bring a copy of the mixed repo to a map that holds the checkout as a candidate, and a key. */
export const curatePlaceAnOrder = async (
  surface: CommandSurface,
  repo: string,
): Promise<readonly ReferenceGraphDocument[]> => {
  const documents = await extractedDocuments(surface, repo);
  await resultOfCommand(surface, { command: 'set-key', key: TEST_API_KEY });
  await resultOfCommand(surface, {
    command: 'curate',
    repo,
    documents,
    accept: [placeAnOrderProposal()],
    reject: [],
  });
  return documents;
};

/**
 * As `curatePlaceAnOrder`, then trace the checkout. The surface's provider must answer with the
 * checkout's trace.
 */
export const tracePlaceAnOrder = async (
  surface: CommandSurface,
  repo: string,
): Promise<readonly ReferenceGraphDocument[]> => {
  const documents = await curatePlaceAnOrder(surface, repo);
  await resultOfCommand(surface, {
    command: 'trace',
    repo,
    documents,
    flowId: placeAnOrderProposal().id,
  });
  return documents;
};
