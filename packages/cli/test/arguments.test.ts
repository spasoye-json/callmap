import { describe, expect, it } from 'vitest';
import { readArguments, USAGE } from '../src/arguments.ts';

describe('the arguments of callmap review', () => {
  it('leaves the tests out unless --tests asks for them', () => {
    expect(readArguments(['review'], '/repo').tests).toBe(false);
    expect(readArguments(['review', '--tests'], '/repo').tests).toBe(true);
  });

  it('names --tests in the usage line', () => {
    expect(USAGE).toContain('[--tests]');
  });
});
