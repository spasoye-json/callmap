import { createReferenceGraph } from '@archmap/reference-graph';
import type { ReferenceGraph, ReferenceGraphInput } from '@archmap/reference-graph';

/** The Expo screen that starts the checkout flow. */
export const SCREEN_FILE = 'app/screens/checkout.tsx';
/** The client the screen calls the backend through. */
export const ORDERS_CLIENT_FILE = 'app/api/orders-client.ts';
/** The Rails controller that answers the checkout request. */
export const CONTROLLER_FILE = 'app/controllers/orders_controller.rb';
/** The Rails model the controller writes through. */
export const MODEL_FILE = 'app/models/order.rb';
/** The async job that listens for the placed order. */
export const JOB_FILE = 'app/jobs/receipt_job.rb';
/** A Ruby file no other file in the fixture repo references. */
export const UNREFERENCED_FILE = 'app/models/user.rb';

export const MOBILE_LANE = 'mobile';
export const BACKEND_LANE = 'backend';
export const ASYNC_LANE = 'async';

/**
 * The fixture repo as two extractors would emit it: a TypeScript subtree and a Ruby subtree, with
 * no reference edge between them, because an HTTP call and an emitted event leave none behind.
 */
export const fixtureReferenceGraphInput = (): ReferenceGraphInput => ({
  files: [
    { path: SCREEN_FILE, language: 'typescript' },
    { path: ORDERS_CLIENT_FILE, language: 'typescript' },
    { path: CONTROLLER_FILE, language: 'ruby' },
    { path: MODEL_FILE, language: 'ruby' },
    { path: JOB_FILE, language: 'ruby' },
    { path: UNREFERENCED_FILE, language: 'ruby' },
  ],
  edges: [
    { from: SCREEN_FILE, to: ORDERS_CLIENT_FILE },
    { from: CONTROLLER_FILE, to: MODEL_FILE },
  ],
});

export const fixtureReferenceGraph = (): ReferenceGraph =>
  createReferenceGraph(fixtureReferenceGraphInput());

/**
 * The fixture repo's files as the host would hash them. A hash is opaque to the core, so the
 * fixture uses a readable stand-in rather than a real digest.
 */
export const fixtureFileHashes = (): Record<string, string> =>
  Object.fromEntries(
    fixtureReferenceGraphInput().files.map((file) => [file.path, `hash-of-${file.path}`]),
  );
