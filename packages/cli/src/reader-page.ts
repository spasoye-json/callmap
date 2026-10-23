import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { DATA_BLOCK_ID } from '../page/data.ts';
import type { ReaderPageData, Sources } from '../page/data.ts';
import type { Placement } from '../page/layout.ts';
import { READER_VIEWS } from '../page/reader-views.ts';
import type { Scene } from '../page/scene.ts';
import { openingOf, overLimitOf } from '../page/view.ts';
import type { OverLimit, View } from '../page/view.ts';
import { callsWordsOf, functionsAndCallsOf } from '../page/words.ts';
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

interface FirstScene {
  readonly view: View;
  readonly scene: Scene;
  readonly over: OverLimit | undefined;
}

const firstScenesOf = (data: ReaderPageData): readonly FirstScene[] =>
  READER_VIEWS.filter(({ laidOutByCommand }) => laidOutByCommand === true).map((view) => {
    const scene = view.sceneOf(data, new Set(), view.firstChoice?.(data));
    return { view, scene, over: overLimitOf(view, data, scene) };
  });

const placementsOf = async (
  firstScenes: readonly FirstScene[],
): Promise<Readonly<Record<string, Placement>>> =>
  Object.fromEntries(
    await Promise.all(
      firstScenes
        .filter(({ over }) => over === undefined)
        .map(async ({ view, scene }): Promise<[string, Placement]> => [
          view.name,
          await placementInWorkerOf(scene),
        ]),
    ),
  );

const notesOf = (firstScenes: readonly FirstScene[]): readonly string[] => {
  const overNames = new Set(
    firstScenes.flatMap(({ view, over }) => (over === undefined ? [] : [view.name])),
  );
  const opening = openingOf(READER_VIEWS, ({ name }) => overNames.has(name)).name;
  return firstScenes.flatMap(({ view, over }) =>
    over === undefined
      ? []
      : [
          `The ${view.name} view holds ${functionsAndCallsOf(over)}, over the ${view.name} limit of ${callsWordsOf(over.limit)}. The page opens on the ${opening} view.`,
        ],
  );
};

type PageReview = Omit<ReaderPageData, 'packedSources' | 'placements'> & {
  readonly sources: Sources;
};

const packedSourcesOf = (sources: Sources): string =>
  gzipSync(JSON.stringify(sources), { level: 9 }).toString('base64');

export interface BuiltReaderPage {
  readonly html: string;
  readonly notes: readonly string[];
}

export const readerPageOf = async ({
  sources,
  ...review
}: PageReview): Promise<BuiltReaderPage> => {
  const data: ReaderPageData = {
    ...review,
    packedSources: packedSourcesOf(sources),
    placements: {},
  };
  const firstScenes = firstScenesOf(data);
  const [script, placements] = await Promise.all([assets.pageScript(), placementsOf(firstScenes)]);
  return { html: pageOf({ ...data, placements }, script), notes: notesOf(firstScenes) };
};
