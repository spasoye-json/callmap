import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { DATA_BLOCK_ID } from '../page/data.ts';
import type { ReaderPageData, Sources } from '../page/data.ts';
import type { Placement } from '../page/layout.ts';
import { READER_VIEWS } from '../page/reader-views.ts';
import type { Scene } from '../page/scene.ts';

const PAGE = fileURLToPath(new URL('../page/', import.meta.url));
const PARTS = join(PAGE, 'parts');
const ENTRY = '\0reader-page-entry';

const partsWith = (extension: string): readonly string[] =>
  readdirSync(PARTS)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => join(PARTS, name));

const entrySource = (): string => {
  const parts = partsWith('.ts');
  return [
    `import { startReaderPage } from ${JSON.stringify(join(PAGE, 'main.ts'))};`,
    ...parts.map((path, index) => `import part${index} from ${JSON.stringify(path)};`),
    `startReaderPage([${parts.map((_, index) => `part${index}`).join(', ')}]);`,
  ].join('\n');
};

const pageScript = async (): Promise<string> => {
  const bundle = await rolldown({
    input: ENTRY,
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'reader-page-entry',
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) => (id === ENTRY ? entrySource() : null),
      },
    ],
  });
  try {
    const { output } = await bundle.generate({ format: 'iife', minify: true });
    return output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');
  } finally {
    await bundle.close();
  }
};

const pageStyle = (): string =>
  [join(PAGE, 'page.css'), join(PAGE, 'drawing.css'), ...partsWith('.css')]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

const inlineScript = (code: string): string => code.replaceAll('</script', '<\\/script');

const dataBlock = (data: ReaderPageData): string => JSON.stringify(data).replaceAll('<', '\\u003c');

const pageOf = (data: ReaderPageData, script: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callmap review</title>
<style>
${pageStyle()}
</style>
</head>
<body>
<header class="page-header"><h1>Callmap review</h1><div id="views"></div></header>
<div class="reader">
<div id="panels"></div>
<main id="graph" aria-label="Call graph"></main>
</div>
<script type="application/json" id="${DATA_BLOCK_ID}">${dataBlock(data)}</script>
<script>
${inlineScript(script)}
</script>
</body>
</html>
`;

const placementInWorkerOf = (scene: Scene): Promise<Placement> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('layout-worker.ts', import.meta.url), { workerData: scene });
    worker.once('message', resolve);
    worker.once('error', reject);
  });

const placementsOf = async (data: ReaderPageData): Promise<Readonly<Record<string, Placement>>> =>
  Object.fromEntries(
    await Promise.all(
      READER_VIEWS.filter(({ laidOutByCommand }) => laidOutByCommand === true).map(
        async (view): Promise<[string, Placement]> => [
          view.name,
          await placementInWorkerOf(view.sceneOf(data, new Set(), undefined)),
        ],
      ),
    ),
  );

type PageReview = Omit<ReaderPageData, 'packedSources' | 'placements'> & {
  readonly sources: Sources;
};

const packedSourcesOf = (sources: Sources): string =>
  gzipSync(JSON.stringify(sources), { level: 9 }).toString('base64');

export const readerPageOf = async ({ sources, ...review }: PageReview): Promise<string> => {
  const data: ReaderPageData = {
    ...review,
    packedSources: packedSourcesOf(sources),
    placements: {},
  };
  const [script, placements] = await Promise.all([pageScript(), placementsOf(data)]);
  return pageOf({ ...data, placements }, script);
};
