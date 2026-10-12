#!/usr/bin/env node
/**
 * The sidecar as the shell runs it: one JSON request per line on standard input, one JSON response
 * per line on standard output (ADR-0006). Requests are answered one at a time, so the shell reads
 * each response as the answer to the request it last wrote and needs no request ids.
 */

import { createInterface } from 'node:readline';
import { createSidecar } from './sidecar.ts';
import type { SidecarResponse } from './protocol.ts';

const sidecar = createSidecar();

const answerLine = async (line: string): Promise<SidecarResponse<unknown>> => {
  let request: unknown;
  try {
    request = JSON.parse(line);
  } catch (_error) {
    return { ok: false, error: { code: 'malformed-request', message: 'a request must be JSON' } };
  }
  try {
    return await sidecar.handle(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { code: 'internal-error', message } };
  }
};

let answered: Promise<void> = Promise.resolve();

createInterface({ input: process.stdin }).on('line', (line) => {
  answered = answered.then(async () => {
    process.stdout.write(`${JSON.stringify(await answerLine(line))}\n`);
  });
});
