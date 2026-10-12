import { describe, expect, it } from 'vitest';
import { inScope as inTypeScriptScope } from '@archmap/extractor-typescript';
import { inScope } from '../src/index.ts';

/**
 * Every extractor reads one scope the same way, or the same globs would claim different subtrees
 * per language. Each extractor holds its own reader so it can be rewritten alone (ADR-0009), and
 * this table holds the Ruby reader to the TypeScript one.
 */
const CASES: readonly (readonly [string, readonly string[]])[] = [
  ['shop/app/models/order.rb', []],
  ['shop/app/models/order.rb', ['shop/**']],
  ['tools/release.rb', ['shop/**']],
  ['tools/release.rb', ['shop/**', 'tools/**']],
  ['shop/order.rb', ['shop/*.rb']],
  ['shop/app/order.rb', ['shop/*.rb']],
  ['shop/app/models/order.rb', ['**/*.rb']],
  ['order.rb', ['**/*.rb']],
  ['shop/a/b/order_spec.rb', ['shop/**/*_spec.rb']],
  ['shop/order.rb', ['shop/**/*_spec.rb']],
  ['shop/a.rb', ['shop/?.rb']],
  ['shop/ab.rb', ['shop/?.rb']],
  ['shop/app.rb', ['shop/app']],
  ['shop/axrb', ['shop/*.rb']],
];

describe('inScope', () => {
  it.each(CASES)('reads %s under %j as the TypeScript extractor does', (path, scope) => {
    expect(inScope(path, scope)).toBe(inTypeScriptScope(path, scope));
  });

  it('takes a file under a subtree glob and leaves out a file outside every glob', () => {
    expect(inScope('shop/app/models/order.rb', ['shop/**'])).toBe(true);
    expect(inScope('tools/release.rb', ['shop/**'])).toBe(false);
  });
});
