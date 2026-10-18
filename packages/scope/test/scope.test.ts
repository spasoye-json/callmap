import { describe, expect, it } from 'vitest';
import { inScope } from '../src/index.ts';

describe('inScope', () => {
  it('takes every file when no glob narrows the repo', () => {
    expect(inScope('src/deep/checkout.ts', [])).toBe(true);
  });

  it('takes a file under a subtree glob', () => {
    expect(inScope('src/checkout.ts', ['src/**'])).toBe(true);
  });

  it('takes a file deep under a subtree glob', () => {
    expect(inScope('src/screens/checkout.ts', ['src/**'])).toBe(true);
  });

  it('leaves out a file outside every glob', () => {
    expect(inScope('tools/build.ts', ['src/**'])).toBe(false);
  });

  it('takes a file that any one of the globs matches', () => {
    expect(inScope('tools/build.ts', ['src/**', 'tools/**'])).toBe(true);
  });

  it('matches a single star inside one path segment only', () => {
    expect(inScope('src/checkout.ts', ['src/*.ts'])).toBe(true);
    expect(inScope('src/screens/checkout.ts', ['src/*.ts'])).toBe(false);
  });

  it('matches a leading double star across any number of segments', () => {
    expect(inScope('src/screens/checkout.ts', ['**/*.ts'])).toBe(true);
    expect(inScope('checkout.ts', ['**/*.ts'])).toBe(true);
  });

  it('matches a double star in the middle of a glob', () => {
    expect(inScope('src/a/b/checkout.test.ts', ['src/**/*.test.ts'])).toBe(true);
    expect(inScope('src/checkout.test.ts', ['src/**/*.test.ts'])).toBe(true);
    expect(inScope('src/checkout.ts', ['src/**/*.test.ts'])).toBe(false);
  });

  it('matches a question mark against one character inside a segment', () => {
    expect(inScope('src/a.ts', ['src/?.ts'])).toBe(true);
    expect(inScope('src/ab.ts', ['src/?.ts'])).toBe(false);
  });

  it('matches a whole path, not a prefix of one', () => {
    expect(inScope('src/checkout.ts', ['src/checkout'])).toBe(false);
  });

  it('reads a dot in a glob as a dot and not as any character', () => {
    expect(inScope('src/axts', ['src/*.ts'])).toBe(false);
  });

  it('leaves out a file that a negated glob matches, though another glob takes it', () => {
    expect(inScope('src/cart.spec.ts', ['src/**', '!**/*.spec.ts'])).toBe(false);
    expect(inScope('src/cart.ts', ['src/**', '!**/*.spec.ts'])).toBe(true);
  });

  it('takes every file but the negated ones when no glob takes files in', () => {
    expect(inScope('tools/build.ts', ['!**/*.spec.ts'])).toBe(true);
    expect(inScope('src/cart.spec.ts', ['!**/*.spec.ts'])).toBe(false);
  });
});
