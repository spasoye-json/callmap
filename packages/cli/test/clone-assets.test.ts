import { describe, expect, it } from 'vitest';
import { goSourceFiles } from '../src/clone-assets.ts';

describe('the source files of the Go extractor', () => {
  it('leave out the Go tests, so a change to a test keeps the key of the binary', () => {
    const names = goSourceFiles().map(({ name }) => name);
    expect(names).toContain('go/written.go');
    expect(names.filter((name) => name.endsWith('_test.go'))).toEqual([]);
  });
});
