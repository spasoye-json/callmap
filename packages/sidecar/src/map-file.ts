/**
 * The map file: the committed record of the map inside the repo it describes (ADR-0007). It is a
 * directory, so each flow is its own file and a diff shows one flow at a time:
 *
 *     .archmap/
 *       flows/<flow id>.json   one flow document per flow, candidate or traced
 *       curation.json          the proposed entry points a person rejected
 *       flow-anchors.json      the anchor stamps (ADR-0008), written after a trace
 *
 * It holds no absolute path, no reference graph, no key, and no spend: an extractor recomputes the
 * graph, and the key and the spend belong to the person, not the repo. A dot directory is skipped
 * by every extractor, so the map file never enters the reference graph it is checked against.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { EMPTY_CURATION, FLOW_ID, parseCuration, serialiseCuration } from '@archmap/discovery';
import type { CurationRecord } from '@archmap/discovery';
import { parseFlowDocument, validateFlowDocument } from '@archmap/flow-document';
import type { FlowDocument, ValidationCode, ValidationResult } from '@archmap/flow-document';
import type { ReferenceGraph } from '@archmap/reference-graph';
import { parseAnchorStore, serialiseAnchorStore } from '@archmap/staleness';
import type { AnchorStore } from '@archmap/staleness';

export const MAP_DIRECTORY = '.archmap';

/** Every path of the map file, repo-relative, so a later command adds a file beside these. */
export const MAP_FILE_PATHS = {
  flows: `${MAP_DIRECTORY}/flows`,
  curation: `${MAP_DIRECTORY}/curation.json`,
  anchors: `${MAP_DIRECTORY}/flow-anchors.json`,
} as const;

export const flowDocumentPath = (flowId: string): string =>
  `${MAP_FILE_PATHS.flows}/${flowId}.json`;

/** Why a file under `flows/` was refused: a validator code, or a name that is not its flow id. */
export interface MapFileError {
  readonly path: string;
  readonly code: ValidationCode | 'misnamed-file';
  readonly message: string;
}

/** A file under `flows/` that was refused, kept so the picker can say why. */
export interface RefusedFlowFile {
  /** Repo-relative path of the file. */
  readonly file: string;
  readonly errors: readonly MapFileError[];
}

export interface MapFile {
  /** Every flow document the validator accepted, in flow id order. */
  readonly flows: readonly FlowDocument[];
  readonly refused: readonly RefusedFlowFile[];
  readonly curation: CurationRecord;
  /** The anchor stamps, one per flow a trace stamped. Empty before the first trace. */
  readonly anchors: AnchorStore;
}

const readTextIfPresent = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

const flowFilesIn = (repo: string): readonly string[] => {
  try {
    return readdirSync(join(repo, MAP_FILE_PATHS.flows))
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

const nodeFilesOf = (text: string): readonly string[] => {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || !('nodes' in value)) return [];
  const { nodes } = value;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node: unknown) =>
    typeof node === 'object' && node !== null && 'file' in node && typeof node.file === 'string'
      ? [node.file]
      : [],
  );
};

/**
 * The graph as it stands, plus the anchored files that are gone from the repo. A claim about a
 * gone file cannot be proved again, and the stale mark is what says so, so the validator takes it
 * as it was proved when the flow was traced.
 */
const rememberingGone = (graph: ReferenceGraph, gone: ReadonlySet<string>): ReferenceGraph => ({
  ...graph,
  knows: (path) => gone.has(path) || graph.knows(path),
  joins: (a, b) => gone.has(a) || gone.has(b) || graph.joins(a, b),
  sameLanguage: (a, b) => gone.has(a) || gone.has(b) || graph.sameLanguage(a, b),
});

/**
 * Validate one saved flow. A flow refused only because an anchored file is gone from the repo is
 * read anyway: ADR-0008 calls that flow stale, and the stale mark shows it in the picker.
 */
const readSavedFlow = (repo: string, text: string, graph: ReferenceGraph): ValidationResult => {
  const result = parseFlowDocument(text, { referenceGraph: graph });
  if (result.ok || !result.errors.every((error) => error.code === 'unknown-file')) return result;
  const gone = new Set(
    nodeFilesOf(text).filter((file) => !graph.knows(file) && !existsSync(join(repo, file))),
  );
  if (gone.size === 0) return result;
  const remembered = validateFlowDocument(JSON.parse(text), {
    referenceGraph: rememberingGone(graph, gone),
  });
  return remembered.ok ? remembered : result;
};

/**
 * Read the map file of a repo. Every flow document is validated against the reference graph as it
 * stands today. A flow that names a file the graph does not know is refused and listed, not
 * drawn, unless that file is an anchored file gone from the repo, which makes the flow stale.
 */
export const readMapFile = (repo: string, referenceGraph: ReferenceGraph): MapFile => {
  const flows: FlowDocument[] = [];
  const refused: RefusedFlowFile[] = [];
  for (const name of flowFilesIn(repo)) {
    const file = `${MAP_FILE_PATHS.flows}/${name}`;
    const result = readSavedFlow(repo, readFileSync(join(repo, file), 'utf8'), referenceGraph);
    if (!result.ok) {
      refused.push({ file, errors: result.errors });
    } else if (`${result.document.id}.json` !== name) {
      refused.push({
        file,
        errors: [
          {
            path: 'id',
            code: 'misnamed-file',
            message: `flow id ${result.document.id} is saved under ${name}, and a flow is saved under its id`,
          },
        ],
      });
    } else {
      flows.push(result.document);
    }
  }
  const curationText = readTextIfPresent(join(repo, MAP_FILE_PATHS.curation));
  const anchorsText = readTextIfPresent(join(repo, MAP_FILE_PATHS.anchors));
  return {
    flows,
    refused,
    curation: curationText === null ? EMPTY_CURATION : parseCuration(curationText),
    anchors: anchorsText === null ? {} : parseAnchorStore(anchorsText),
  };
};

/** Write through a temporary file, so a reader never finds half a document. */
const writeAtomically = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  writeFileSync(partial, text);
  renameSync(partial, path);
};

/** Save one flow document under its id, replacing the one saved there before. */
export const writeFlowDocument = (repo: string, document: FlowDocument): void => {
  if (!FLOW_ID.test(document.id)) {
    throw new Error(`flow id ${JSON.stringify(document.id)} cannot name a file`);
  }
  writeAtomically(
    join(repo, flowDocumentPath(document.id)),
    `${JSON.stringify(document, null, 2)}\n`,
  );
};

export const writeCuration = (repo: string, record: CurationRecord): void => {
  writeAtomically(join(repo, MAP_FILE_PATHS.curation), serialiseCuration(record));
};

export const writeAnchorStore = (repo: string, store: AnchorStore): void => {
  writeAtomically(join(repo, MAP_FILE_PATHS.anchors), serialiseAnchorStore(store));
};
