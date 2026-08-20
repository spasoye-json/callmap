/**
 * Reading what an extractor sent.
 *
 * An extractor is a separate process (ADR-0009), so everything it emits arrives as data over a
 * contract rather than as a value the compiler checked. These are the readers the contract is
 * spelled out with: a shape they do not allow is refused as a `ReferenceGraphError`, which is what
 * that error is for, rather than escaping as a `TypeError` from the middle of indexing.
 */

/** Thrown when an extractor's output cannot form a graph. */
export class ReferenceGraphError extends Error {
  override readonly name = 'ReferenceGraphError';
}

export type Fields = Record<string, unknown>;

export const requireNonEmpty = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReferenceGraphError(`${what} must be a non-empty string`);
  }
  return value;
};

export const requireFields = (value: unknown, what: string, allowed: readonly string[]): Fields => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ReferenceGraphError(`${what} must be an object`);
  }
  const fields = value as Fields;
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) {
      throw new ReferenceGraphError(`${what} carries '${key}', which the contract does not allow`);
    }
  }
  return fields;
};

export const requireArray = (fields: Fields, key: string, what: string): readonly unknown[] => {
  if (!Object.hasOwn(fields, key)) {
    throw new ReferenceGraphError(`${what} must name its '${key}'`);
  }
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new ReferenceGraphError(`the '${key}' ${what} names must be an array`);
  }
  return value as readonly unknown[];
};
