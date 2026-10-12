import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_FILE,
  fixtureReferenceGraph,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
  UNREFERENCED_FILE,
} from '@archmap/testing';
import { discoveryPrompt, readDiscoveryAnswer } from '../src/index.ts';

const referenceGraph = fixtureReferenceGraph();

const screenSource =
  "import { placeOrder } from '../api/orders-client';\n\nexport const Checkout = () => {};\n";

describe('discoveryPrompt', () => {
  const prompt = discoveryPrompt({
    referenceGraph,
    sources: [{ path: SCREEN_FILE, text: screenSource }],
  });

  it('lists every file the reference graph knows, with its language', () => {
    expect(prompt.prompt).toContain(`${SCREEN_FILE} (typescript)`);
    expect(prompt.prompt).toContain(`${CONTROLLER_FILE} (ruby)`);
    expect(prompt.prompt).toContain(`${UNREFERENCED_FILE} (ruby)`);
  });

  it('lists every reference edge', () => {
    expect(prompt.prompt).toContain(`${SCREEN_FILE} -> ${ORDERS_CLIENT_FILE}`);
  });

  it('numbers every line of a source, so a proposal can name the line it read', () => {
    expect(prompt.prompt).toContain(`=== ${SCREEN_FILE}\n1| import { placeOrder }`);
    expect(prompt.prompt).toContain('3| export const Checkout = () => {};');
  });

  it('asks for the answer shape the reader reads', () => {
    expect(prompt.system).toContain('proposedEntryPoints');
    expect(prompt.outputSchema).toMatchObject({
      type: 'object',
      required: ['proposedEntryPoints'],
      additionalProperties: false,
    });
  });

  it('describes in its schema an answer the reader accepts', () => {
    const answer = {
      proposedEntryPoints: [
        {
          id: 'place-an-order',
          name: 'A shopper places an order',
          entryPoint: { kind: 'screen', file: SCREEN_FILE, line: 3 },
        },
      ],
    };
    const schema = prompt.outputSchema as {
      properties: { proposedEntryPoints: { items: { required: string[] } } };
    };
    expect(schema.properties.proposedEntryPoints.items.required).toEqual([
      'id',
      'name',
      'entryPoint',
    ]);
    expect(readDiscoveryAnswer(JSON.stringify(answer), { referenceGraph }).rejections).toEqual([]);
  });

  it('expects more output for a larger repo, and never more than the pass may write', () => {
    const small = discoveryPrompt({ referenceGraph, sources: [] });
    expect(small.expectedOutputTokens).toBeGreaterThan(0);
    expect(small.expectedOutputTokens).toBeLessThanOrEqual(small.maxOutputTokens);
  });
});
