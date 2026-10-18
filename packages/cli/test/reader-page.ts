import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { Core } from 'cytoscape';
import type { ReaderPageData } from '../page/data.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

export interface Opener {
  readonly bin: string;
  readonly marker: string;
}

export const fakeOpener = (): Opener => {
  const bin = mkdtempSync(join(tmpdir(), 'archmap-opener-'));
  const marker = join(bin, 'opened');
  for (const name of ['xdg-open', 'open']) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\n`);
    chmodSync(path, 0o755);
  }
  return { bin, marker };
};

export const runArchmap = (args: readonly string[], opener?: Opener) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env:
      opener === undefined
        ? process.env
        : { ...process.env, PATH: `${opener.bin}${delimiter}${process.env['PATH'] ?? ''}` },
  });

export const pageDataOf = (html: string): ReaderPageData => {
  const block = /<script type="application\/json" id="reader-page-data">([^<]*)<\/script>/.exec(
    html,
  );
  if (block?.[1] === undefined) throw new Error('the page holds no data block');
  return JSON.parse(block[1]) as ReaderPageData;
};

const inertContext = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : inertContext()),
    apply: () => inertContext(),
    set: () => true,
  });

export interface LoadedPage {
  readonly window: JSDOM['window'];
  readonly graph: Core;
}

export const loadReaderPage = (html: string): LoadedPage => {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse: (window) => {
      window.HTMLCanvasElement.prototype.getContext = (() => inertContext()) as never;
    },
  });
  const { readerPage } = dom.window as unknown as { readerPage?: { graph: Core } };
  if (readerPage === undefined) throw new Error('the page script did not start');
  return { window: dom.window, graph: readerPage.graph };
};
