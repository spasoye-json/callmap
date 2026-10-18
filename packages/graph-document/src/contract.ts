export class GraphDocumentError extends Error {
  override readonly name = 'GraphDocumentError';
}

export type Fields = Record<string, unknown>;

export const requireNonEmpty = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GraphDocumentError(`${what} must be a non-empty string`);
  }
  return value;
};

export const requireLine = (value: unknown, what: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new GraphDocumentError(`${what} must be a line number from 1`);
  }
  return value;
};

export const requireFields = (value: unknown, what: string, allowed: readonly string[]): Fields => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GraphDocumentError(`${what} must be an object`);
  }
  const fields = value as Fields;
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) {
      throw new GraphDocumentError(`${what} carries '${key}', which the contract does not allow`);
    }
  }
  return fields;
};

export const requireArray = (fields: Fields, key: string, what: string): readonly unknown[] => {
  if (!Object.hasOwn(fields, key)) {
    throw new GraphDocumentError(`${what} must name its '${key}'`);
  }
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new GraphDocumentError(`the '${key}' ${what} names must be an array`);
  }
  return value as readonly unknown[];
};

const DRIVE_LETTER = /^[A-Za-z]:/;

export const requirePath = (value: unknown, what: string): string => {
  const path = requireNonEmpty(value, what);
  if (path.includes('\\')) {
    throw new GraphDocumentError(`${what} must read with forward slashes, not '${path}'`);
  }
  if (path.startsWith('/') || DRIVE_LETTER.test(path)) {
    throw new GraphDocumentError(`${what} must be repo-relative, not '${path}'`);
  }
  const segments = path.split('/');
  if (segments.includes('..')) {
    throw new GraphDocumentError(`${what} must stay inside the repo, not '${path}'`);
  }
  if (segments.some((segment) => segment === '' || segment === '.')) {
    throw new GraphDocumentError(`${what} must spell a file one way, not '${path}'`);
  }
  return path;
};
