/**
 * The deterministic validator that sits in the seam. Every AI output passes through it
 * (ADR-0001), and it rejects anything the reference graph does not back.
 *
 * It reads data only. It never opens a source file and never touches a target repo's filesystem.
 */

import type { ReferenceGraph } from '@archmap/reference-graph';
import {
  BOUNDARIES,
  EDGE_KINDS,
  ENTRY_POINT_FIELDS,
  ENTRY_POINT_KINDS,
  EVIDENCE_FIELDS,
  FLOW_DOCUMENT_FIELDS,
  INFERRED_EDGE_FIELDS,
  LANE_FIELDS,
  NODE_FIELDS,
  NODE_KINDS,
  VERIFIED_EDGE_FIELDS,
} from './flow-document.ts';
import type {
  Boundary,
  EntryPoint,
  EntryPointKind,
  Evidence,
  FlowDocument,
  FlowEdge,
  FlowNode,
  Lane,
  NodeKind,
} from './flow-document.ts';

/** Why a document was rejected. One code per rule, so a caller can react to a specific refusal. */
export type ValidationCode =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-field'
  | 'unknown-field'
  | 'wrong-type'
  | 'empty-string'
  | 'invalid-line'
  | 'unknown-kind'
  | 'unknown-boundary'
  | 'duplicate-id'
  | 'unknown-lane'
  | 'unknown-node'
  | 'self-edge'
  | 'duplicate-edge'
  | 'unknown-file'
  | 'candidate-has-edges'
  | 'boundary-edge-claims-verified'
  | 'inferred-edge-within-lane'
  | 'verified-edge-crosses-language'
  | 'unproven-verified-edge'
  | 'missing-evidence';

/** One refusal, addressed at the field that caused it. */
export interface ValidationError {
  readonly path: string;
  readonly code: ValidationCode;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly document: FlowDocument }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export interface ValidateOptions {
  /** The ground truth every claim about the code is checked against. */
  readonly referenceGraph: ReferenceGraph;
}

/** Thrown by `assertFlowDocument` when a document is refused. */
export class FlowDocumentError extends Error {
  override readonly name = 'FlowDocumentError';
  readonly errors: readonly ValidationError[];

  constructor(errors: readonly ValidationError[]) {
    super(
      `the flow document was rejected:\n${errors
        .map((error) => `  ${error.path === '' ? '(document)' : error.path}: ${error.message}`)
        .join('\n')}`,
    );
    this.errors = errors;
  }
}

type Collect = (path: string, code: ValidationCode, message: string) => void;
type Fields = Record<string, unknown>;

const join = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

/**
 * Whether a value carries this field itself.
 *
 * The seam refuses an unknown field so a producer cannot smuggle a key through it (ADR-0003), and
 * that only holds if a field has to be carried rather than inherited. `Object.keys` finds nothing to
 * refuse on a value that inherits its fields, so reading one with `in` would let a whole document in
 * off a prototype, under the very rule meant to stop it.
 */
const carries = (fields: Fields, key: string): boolean => Object.hasOwn(fields, key);

const quoteList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

const asFields = (collect: Collect, path: string, value: unknown, what: string): Fields | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    collect(path, path === '' ? 'not-an-object' : 'wrong-type', `${what} must be an object`);
    return null;
  }
  return value as Fields;
};

const readArray = (
  collect: Collect,
  path: string,
  fields: Fields,
  key: string,
): readonly unknown[] | null => {
  if (!carries(fields, key)) {
    collect(join(path, key), 'missing-field', `'${key}' is required`);
    return null;
  }
  const value = fields[key];
  if (!Array.isArray(value)) {
    collect(join(path, key), 'wrong-type', `'${key}' must be an array`);
    return null;
  }
  return value as readonly unknown[];
};

const readString = (collect: Collect, path: string, fields: Fields, key: string): string | null => {
  if (!carries(fields, key)) {
    collect(join(path, key), 'missing-field', `'${key}' is required`);
    return null;
  }
  const value = fields[key];
  if (typeof value !== 'string') {
    collect(join(path, key), 'wrong-type', `'${key}' must be a string`);
    return null;
  }
  if (value.trim() === '') {
    collect(join(path, key), 'empty-string', `'${key}' must not be empty`);
    return null;
  }
  return value;
};

const readLine = (collect: Collect, path: string, fields: Fields, key: string): number | null => {
  if (!carries(fields, key)) {
    collect(join(path, key), 'missing-field', `'${key}' is required`);
    return null;
  }
  const value = fields[key];
  if (typeof value !== 'number') {
    collect(join(path, key), 'wrong-type', `'${key}' must be a number`);
    return null;
  }
  if (!Number.isInteger(value) || value < 1) {
    collect(join(path, key), 'invalid-line', `'${key}' must be a whole line number of 1 or more`);
    return null;
  }
  return value;
};

const readChoice = <T extends string>(
  collect: Collect,
  path: string,
  fields: Fields,
  key: string,
  allowed: readonly T[],
  code: ValidationCode,
): T | null => {
  const value = readString(collect, path, fields, key);
  if (value === null) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    collect(join(path, key), code, `'${key}' must be one of ${quoteList(allowed)}`);
    return null;
  }
  return value as T;
};

/**
 * Reject unknown fields at every level, so a producer cannot smuggle extra keys through the seam
 * (ADR-0003).
 */
const rejectUnknownFields = (
  collect: Collect,
  path: string,
  fields: Fields,
  allowed: readonly string[],
): void => {
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) {
      collect(join(path, key), 'unknown-field', `'${key}' is not a field of this level`);
    }
  }
};

const requireKnownFile = (
  collect: Collect,
  path: string,
  file: string,
  graph: ReferenceGraph,
): void => {
  if (!graph.knows(file)) {
    collect(path, 'unknown-file', `the reference graph does not know '${file}'`);
  }
};

const validateEntryPoint = (
  collect: Collect,
  document: Fields,
  graph: ReferenceGraph,
): EntryPoint | null => {
  if (!carries(document, 'entryPoint')) {
    collect('entryPoint', 'missing-field', "'entryPoint' is required");
    return null;
  }
  const fields = asFields(collect, 'entryPoint', document['entryPoint'], 'the entry point');
  if (fields === null) return null;
  rejectUnknownFields(collect, 'entryPoint', fields, ENTRY_POINT_FIELDS);
  const kind = readChoice<EntryPointKind>(
    collect,
    'entryPoint',
    fields,
    'kind',
    ENTRY_POINT_KINDS,
    'unknown-kind',
  );
  const file = readString(collect, 'entryPoint', fields, 'file');
  const line = readLine(collect, 'entryPoint', fields, 'line');
  if (file !== null) requireKnownFile(collect, 'entryPoint.file', file, graph);
  if (kind === null || file === null || line === null) return null;
  return { kind, file, line };
};

const validateLanes = (collect: Collect, document: Fields): readonly Lane[] | null => {
  const raw = readArray(collect, '', document, 'lanes');
  if (raw === null) return null;
  const lanes: Lane[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, position) => {
    const path = `lanes[${position}]`;
    const fields = asFields(collect, path, entry, 'a lane');
    if (fields === null) return;
    rejectUnknownFields(collect, path, fields, LANE_FIELDS);
    const id = readString(collect, path, fields, 'id');
    const name = readString(collect, path, fields, 'name');
    if (id !== null) {
      if (seen.has(id)) {
        collect(join(path, 'id'), 'duplicate-id', `two lanes claim the id '${id}'`);
      }
      seen.add(id);
    }
    if (id !== null && name !== null) lanes.push({ id, name });
  });
  return lanes;
};

/** What the edge rules need to know about a node, whether or not the node itself was well formed. */
interface NodeRecord {
  readonly lane: string | null;
  readonly file: string | null;
}

interface ValidatedNodes {
  readonly nodes: readonly FlowNode[];
  readonly index: ReadonlyMap<string, NodeRecord>;
  /**
   * How many nodes the document carries, well formed or not. The candidate rule is about what a
   * producer wrote, not about what survived reading, so a document with one broken node is a traced
   * flow that is wrong rather than a candidate that overstepped.
   */
  readonly carried: number;
}

const validateNodes = (
  collect: Collect,
  document: Fields,
  laneIds: ReadonlySet<string>,
  graph: ReferenceGraph,
): ValidatedNodes | null => {
  const raw = readArray(collect, '', document, 'nodes');
  if (raw === null) return null;
  const nodes: FlowNode[] = [];
  const index = new Map<string, NodeRecord>();
  raw.forEach((entry, position) => {
    const path = `nodes[${position}]`;
    const fields = asFields(collect, path, entry, 'a node');
    if (fields === null) return;
    rejectUnknownFields(collect, path, fields, NODE_FIELDS);
    const id = readString(collect, path, fields, 'id');
    const kind = readChoice<NodeKind>(collect, path, fields, 'kind', NODE_KINDS, 'unknown-kind');
    const label = readString(collect, path, fields, 'label');
    const lane = readString(collect, path, fields, 'lane');
    const file = readString(collect, path, fields, 'file');
    const line = readLine(collect, path, fields, 'line');
    if (lane !== null && !laneIds.has(lane)) {
      collect(join(path, 'lane'), 'unknown-lane', `no lane is declared with the id '${lane}'`);
    }
    if (file !== null) requireKnownFile(collect, join(path, 'file'), file, graph);
    if (id !== null) {
      /**
       * The node that claimed the id first keeps it. The edge rules read each endpoint's lane and
       * file out of this index, so letting the second node overwrite the first would move every
       * edge already drawn to the first node into whatever lane the second one claimed, and the
       * refusal that came back would name a boundary rule a correct edge never broke.
       */
      if (index.has(id)) {
        collect(join(path, 'id'), 'duplicate-id', `two nodes claim the id '${id}'`);
      } else index.set(id, { lane, file });
    }
    if (id !== null && kind !== null && label !== null && lane !== null && file !== null) {
      if (line !== null) nodes.push({ id, kind, label, lane, file, line });
    }
  });
  return { nodes, index, carried: raw.length };
};

const validateEvidence = (
  collect: Collect,
  path: string,
  edge: Fields,
  graph: ReferenceGraph,
): Evidence | null => {
  const evidencePath = join(path, 'evidence');
  if (!carries(edge, 'evidence')) {
    collect(
      evidencePath,
      'missing-evidence',
      'an inferred edge is proposed, not proven, so it must carry the evidence that proposes it',
    );
    return null;
  }
  const fields = asFields(collect, evidencePath, edge['evidence'], 'evidence');
  if (fields === null) return null;
  rejectUnknownFields(collect, evidencePath, fields, EVIDENCE_FIELDS);
  const quotePath = join(evidencePath, 'quote');
  const rawQuote = fields['quote'];
  let quote: string | null = null;
  if (!carries(fields, 'quote')) {
    collect(quotePath, 'missing-evidence', 'evidence is a quoted match, so a quote is required');
  } else if (typeof rawQuote !== 'string') {
    collect(quotePath, 'wrong-type', "'quote' must be a string");
  } else if (rawQuote.trim() === '') {
    collect(quotePath, 'missing-evidence', 'an empty quote is no evidence');
  } else {
    quote = rawQuote;
  }
  const file = readString(collect, evidencePath, fields, 'file');
  const line = readLine(collect, evidencePath, fields, 'line');
  if (file !== null) requireKnownFile(collect, join(evidencePath, 'file'), file, graph);
  if (quote === null || file === null || line === null) return null;
  return { quote, file, line };
};

const EVERY_EDGE_FIELD: readonly string[] = [
  ...new Set([...VERIFIED_EDGE_FIELDS, ...INFERRED_EDGE_FIELDS]),
];

const validateEdges = (
  collect: Collect,
  document: Fields,
  nodeIndex: ReadonlyMap<string, NodeRecord>,
  graph: ReferenceGraph,
): readonly FlowEdge[] | null => {
  const raw = readArray(collect, '', document, 'edges');
  if (raw === null) return null;
  const edges: FlowEdge[] = [];
  /** The pairs already seen, held per source node, so no id is concatenated into a key. */
  const seen = new Map<string, Set<string>>();
  raw.forEach((entry, position) => {
    const path = `edges[${position}]`;
    const fields = asFields(collect, path, entry, 'an edge');
    if (fields === null) return;
    const kind = readChoice(collect, path, fields, 'kind', EDGE_KINDS, 'unknown-kind');
    rejectUnknownFields(
      collect,
      path,
      fields,
      kind === 'inferred'
        ? INFERRED_EDGE_FIELDS
        : kind === 'verified'
          ? VERIFIED_EDGE_FIELDS
          : EVERY_EDGE_FIELD,
    );
    const from = readString(collect, path, fields, 'from');
    const to = readString(collect, path, fields, 'to');

    const source = from === null ? undefined : nodeIndex.get(from);
    const target = to === null ? undefined : nodeIndex.get(to);
    if (from !== null && source === undefined) {
      collect(join(path, 'from'), 'unknown-node', `no node is declared with the id '${from}'`);
    }
    if (to !== null && target === undefined) {
      collect(join(path, 'to'), 'unknown-node', `no node is declared with the id '${to}'`);
    }
    if (from !== null && to !== null) {
      if (from === to) {
        collect(path, 'self-edge', `an edge runs to the next node, not back to '${from}'`);
      } else {
        const alreadyTo = seen.get(from);
        if (alreadyTo === undefined) seen.set(from, new Set([to]));
        else if (alreadyTo.has(to)) {
          collect(path, 'duplicate-edge', `two edges run from '${from}' to '${to}'`);
        } else alreadyTo.add(to);
      }
    }

    const boundary =
      kind === 'inferred'
        ? readChoice<Boundary>(collect, path, fields, 'boundary', BOUNDARIES, 'unknown-boundary')
        : null;
    const evidence = kind === 'inferred' ? validateEvidence(collect, path, fields, graph) : null;

    const sourceLane = source?.lane ?? null;
    const targetLane = target?.lane ?? null;
    const crossesLane =
      sourceLane === null || targetLane === null ? null : sourceLane !== targetLane;

    if (kind === 'verified' && crossesLane === true) {
      collect(
        join(path, 'kind'),
        'boundary-edge-claims-verified',
        'an edge between two lanes crosses a process boundary, so it is inferred and can never be verified',
      );
    }
    if (kind === 'inferred' && crossesLane === false) {
      collect(
        join(path, 'kind'),
        'inferred-edge-within-lane',
        `an inferred edge crosses a process boundary, so its two nodes cannot both sit in lane '${sourceLane ?? ''}'`,
      );
    }
    if (
      kind === 'verified' &&
      crossesLane === false &&
      source?.file != null &&
      target?.file != null &&
      source.file !== target.file &&
      graph.knows(source.file) &&
      graph.knows(target.file)
    ) {
      if (!graph.sameLanguage(source.file, target.file)) {
        collect(
          join(path, 'kind'),
          'verified-edge-crosses-language',
          `a verified edge never crosses a language, and '${source.file}' and '${target.file}' belong to two`,
        );
      } else if (!graph.joins(source.file, target.file)) {
        collect(
          path,
          'unproven-verified-edge',
          `the reference graph holds no reference edge between '${source.file}' and '${target.file}', in either direction`,
        );
      }
    }

    if (from === null || to === null || kind === null) return;
    if (kind === 'verified') {
      edges.push({ kind, from, to });
      return;
    }
    if (boundary !== null && evidence !== null) {
      edges.push({ kind, from, to, boundary, evidence });
    }
  });
  return edges;
};

/**
 * Validate one flow document against the reference graph.
 *
 * A document is accepted only when every field is known and well typed, every node and every
 * piece of evidence points at a file the reference graph knows, every verified edge is proven by
 * the reference graph, and every inferred edge carries the evidence that proposes it.
 */
export const validateFlowDocument = (
  value: unknown,
  options: ValidateOptions,
): ValidationResult => {
  const errors: ValidationError[] = [];
  const collect: Collect = (path, code, message) => {
    errors.push({ path, code, message });
  };
  const graph = options.referenceGraph;

  const fields = asFields(collect, '', value, 'a flow document');
  if (fields === null) return { ok: false, errors };

  rejectUnknownFields(collect, '', fields, FLOW_DOCUMENT_FIELDS);
  const id = readString(collect, '', fields, 'id');
  const name = readString(collect, '', fields, 'name');
  const entryPoint = validateEntryPoint(collect, fields, graph);
  const lanes = validateLanes(collect, fields);
  const laneIds = new Set((lanes ?? []).map((lane) => lane.id));
  const nodes = validateNodes(collect, fields, laneIds, graph);
  const edges = validateEdges(collect, fields, nodes?.index ?? new Map(), graph);

  if (nodes !== null && edges !== null && nodes.carried === 0 && edges.length > 0) {
    collect(
      'edges',
      'candidate-has-edges',
      'a flow with no nodes is a candidate, and a candidate carries no edges',
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  if (
    id === null ||
    name === null ||
    entryPoint === null ||
    lanes === null ||
    nodes === null ||
    edges === null
  ) {
    return { ok: false, errors };
  }
  return { ok: true, document: { id, name, entryPoint, lanes, nodes: nodes.nodes, edges } };
};

/** Parse JSON text and validate it in one step, so a bad file reads as a rejection, not a throw. */
export const parseFlowDocument = (text: string, options: ValidateOptions): ValidationResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      errors: [
        {
          path: '',
          code: 'invalid-json',
          message: `the flow document is not valid JSON: ${reason}`,
        },
      ],
    };
  }
  return validateFlowDocument(parsed, options);
};

/** Validate and return the document, throwing every refusal at once. */
export const assertFlowDocument = (value: unknown, options: ValidateOptions): FlowDocument => {
  const result = validateFlowDocument(value, options);
  if (!result.ok) throw new FlowDocumentError(result.errors);
  return result.document;
};
