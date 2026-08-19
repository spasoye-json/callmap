import { expect } from 'vitest';
import { fixtureReferenceGraph } from '@archmap/testing';
import { validateFlowDocument } from '../src/index.ts';
import type { ValidationCode, ValidationError, ValidationResult } from '../src/index.ts';

const graph = fixtureReferenceGraph();

/** Validate against the fixture repo's reference graph. */
export const validate = (value: unknown): ValidationResult =>
  validateFlowDocument(value, { referenceGraph: graph });

export const errorsOf = (result: ValidationResult): readonly ValidationError[] =>
  result.ok ? [] : result.errors;

export const codesOf = (result: ValidationResult): readonly ValidationCode[] =>
  errorsOf(result).map((error) => error.code);

/** Assert one refusal, by code and by the field it is addressed at. */
export const expectRefusal = (value: unknown, code: ValidationCode, path?: string): void => {
  const result = validate(value);
  expect(result.ok, `expected a refusal coded '${code}'`).toBe(false);
  const matching = errorsOf(result).filter((error) => error.code === code);
  expect(
    matching,
    `expected a '${code}' refusal, got ${JSON.stringify(errorsOf(result))}`,
  ).not.toHaveLength(0);
  if (path !== undefined) {
    expect(matching.map((error) => error.path)).toContain(path);
  }
};

export const expectAccepted = (value: unknown): void => {
  const result = validate(value);
  expect(result.ok ? [] : result.errors).toEqual([]);
  expect(result.ok).toBe(true);
};
