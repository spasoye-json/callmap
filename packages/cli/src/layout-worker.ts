import { parentPort, workerData } from 'node:worker_threads';
import { placementOf } from '../page/layout.ts';
import type { Scene } from '../page/scene.ts';

parentPort?.postMessage(await placementOf(workerData as Scene));
