/**
 * How a command reads its request and how it refuses one. Every command module shares these, so
 * every command refuses in the same shape.
 */

import { resolve } from 'node:path';
import { readReferenceGraphDocument, ReferenceGraphError } from '@archmap/reference-graph';
import type { ReferenceGraphDocument } from '@archmap/reference-graph';
import { isDirectory } from './repo.ts';
import type { SidecarErrorCode } from './protocol.ts';

/**
 * A refusal the reader sees. A command throws it, and `handle` turns it into an answer, so every
 * command refuses in the same shape and anything else that throws is not mistaken for one.
 */
export class Refusal extends Error {
  override readonly name = 'Refusal';
  readonly code: SidecarErrorCode;

  constructor(code: SidecarErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const requireString = (request: Record<string, unknown>, field: string): string => {
  const value = request[field];
  if (typeof value !== 'string' || value === '') {
    throw new Refusal('malformed-request', `'${field}' must be a non-empty string`);
  }
  return value;
};

export const requireStrings = (
  request: Record<string, unknown>,
  field: string,
): readonly string[] => {
  const value = request[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item !== '')) {
    throw new Refusal('malformed-request', `'${field}' must be a list of non-empty strings`);
  }
  return value as readonly string[];
};

/** The repo a request names, as an absolute path, refused when it is not a directory. */
export const requireRepo = (request: Record<string, unknown>): string => {
  const repo = resolve(requireString(request, 'repo'));
  if (!isDirectory(repo)) throw new Refusal('repo-not-found', `${repo} is not a directory`);
  return repo;
};

/**
 * The reference graph documents an extract answered with, taken back and read against the
 * contract again, so a command that needs the graph does not run every extractor a second time.
 */
export const requireDocuments = (
  request: Record<string, unknown>,
): readonly ReferenceGraphDocument[] => {
  const value = request['documents'];
  if (!Array.isArray(value)) {
    throw new Refusal('malformed-request', "'documents' must be the list an extract answered with");
  }
  try {
    return value.map((document: unknown) => readReferenceGraphDocument(document));
  } catch (error) {
    if (error instanceof ReferenceGraphError) {
      throw new Refusal('malformed-request', `'documents' holds ${error.message}`);
    }
    throw error;
  }
};
