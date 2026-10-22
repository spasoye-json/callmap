import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { DATA_BLOCK_ID } from '../page/data.ts';
import type { ReaderPageData, Sources } from '../page/data.ts';
import type { Placement } from '../page/layout.ts';
import { READER_VIEWS } from '../page/reader-views.ts';
import type { Scene } from '../page/scene.ts';
import { assets } from './assets.ts';

const inlineScript = (code: string): string => code.replaceAll('</script', '<\\/script');

const dataBlock = (data: ReaderPageData): string => JSON.stringify(data).replaceAll('<', '\\u003c');

const pageOf = (data: ReaderPageData, script: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callmap review</title>
<style>
${assets.pageStyle()}
</style>
</head>
<body>
<header class="top-bar">
<h1 class="brand"><svg viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="6.5" width="5" height="5" rx="1.2"/><rect x="12" y="1.5" width="5" height="5" rx="1.2"/><rect x="12" y="11.5" width="5" height="5" rx="1.2"/><path d="M6 9H9V4H12M9 9V14H12"/></svg>Callmap</h1>
<nav id="views" class="tabs"></nav>
</header>
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
    const worker = new Worker(assets.layoutWorker, { workerData: scene });
    worker.once('message', resolve);
    worker.once('error', reject);
  });

const placementsOf = async (data: ReaderPageData): Promise<Readonly<Record<string, Placement>>> =>
  Object.fromEntries(
    await Promise.all(
      READER_VIEWS.filter(({ laidOutByCommand }) => laidOutByCommand === true).map(
        async (view): Promise<[string, Placement]> => [
          view.name,
          await placementInWorkerOf(view.sceneOf(data, new Set(), view.firstChoice?.(data))),
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
  const [script, placements] = await Promise.all([assets.pageScript(), placementsOf(data)]);
  return pageOf({ ...data, placements }, script);
};
