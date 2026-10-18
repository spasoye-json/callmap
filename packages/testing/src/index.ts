/**
 * Test support: one mixed-language repo, held as data, that every package's tests are written
 * against. Nothing here reads a filesystem; a fixture repo is a reference graph and a set of file
 * hashes, never a directory on disk.
 */

export {
  ASYNC_LANE,
  BACKEND_LANE,
  CONTROLLER_FILE,
  fixtureFileHashes,
  fixtureReferenceGraph,
  fixtureReferenceGraphInput,
  JOB_FILE,
  MOBILE_LANE,
  MODEL_FILE,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
  UNREFERENCED_FILE,
} from './repo.ts';
export { candidate, checkoutFlow, clone, inferredEdge, verifiedEdge } from './flows.ts';
export {
  MIXED_CHECKOUT_SCREEN,
  MIXED_ORDER,
  MIXED_ORDERS_CLIENT,
  MIXED_ORDERS_CONTROLLER,
  MIXED_ROUTES,
  placeAnOrderProposal,
  placeAnOrderTraceAnswer,
  placeAnOrderTraced,
} from './mixed-flow.ts';
export {
  curatePlaceAnOrder,
  extractedDocuments,
  resultOfCommand,
  TEST_API_KEY,
  tracePlaceAnOrder,
} from './command-chain.ts';
export type { CommandAnswer, CommandSurface } from './command-chain.ts';
