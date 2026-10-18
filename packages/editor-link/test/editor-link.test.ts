import { describe, expect, it } from 'vitest';
import { editorUrl } from '../src/index.ts';

describe('the editor link', () => {
  it('opens the file at the line in the editor', () => {
    expect(editorUrl('/home/me/shop', { file: 'web/src/screens/checkout.ts', line: 3 })).toBe(
      'vscode://file/home/me/shop/web/src/screens/checkout.ts:3',
    );
  });

  it('joins a repo root that ends in a slash without doubling it', () => {
    expect(editorUrl('/home/me/shop/', { file: 'a.ts', line: 1 })).toBe(
      'vscode://file/home/me/shop/a.ts:1',
    );
  });

  it('escapes a space in the path', () => {
    expect(editorUrl('/home/two words', { file: 'app/a b.ts', line: 3 })).toBe(
      'vscode://file/home/two%20words/app/a%20b.ts:3',
    );
  });

  it('escapes a percent sign, a hash, and a question mark, which would end the path', () => {
    expect(editorUrl('/r', { file: 'a%b#c?d.ts', line: 2 })).toBe(
      'vscode://file/r/a%25b%23c%3Fd.ts:2',
    );
  });

  it('escapes a route bracket, which the editor decodes back', () => {
    expect(editorUrl('/r', { file: 'app/order/[id].tsx', line: 352 })).toBe(
      'vscode://file/r/app/order/%5Bid%5D.tsx:352',
    );
  });

  it('escapes every character a shell reads as a command', () => {
    expect(editorUrl('/r', { file: 'a&b|c^d<e>f;g`h$i\'j"k!l(m)n*o.ts', line: 1 })).toBe(
      'vscode://file/r/a%26b%7Cc%5Ed%3Ce%3Ef%3Bg%60h%24i%27j%22k%21l%28m%29n%2Ao.ts:1',
    );
  });

  it('escapes a character outside ASCII as its UTF-8 bytes', () => {
    expect(editorUrl('/r', { file: 'caf\u00e9.ts', line: 1 })).toBe(
      'vscode://file/r/caf%C3%A9.ts:1',
    );
  });

  it('opens a file under a Windows drive root', () => {
    expect(editorUrl('C:\\work\\shop', { file: 'web/a.ts', line: 4 })).toBe(
      'vscode://file/C:/work/shop/web/a.ts:4',
    );
  });

  it('refuses a relative repo root, because it cannot open a file', () => {
    expect(() => editorUrl('shop', { file: 'a.ts', line: 1 })).toThrow(TypeError);
  });
});
