import { describe, expect, it } from 'vitest';
import {
  candidate,
  CONTROLLER_FILE,
  fixtureReferenceGraph,
  ORDERS_CLIENT_FILE,
  SCREEN_FILE,
} from '@archmap/testing';
import { tracePrompt } from '../src/index.ts';

const referenceGraph = fixtureReferenceGraph();

const flow = candidate('place-an-order', 'A shopper places an order from the checkout screen');

const screenSource =
  "import { placeOrder } from '../api/orders-client';\n\nexport const Checkout = () => {};\n";

describe('tracePrompt', () => {
  const prompt = tracePrompt({
    flow,
    referenceGraph,
    sources: [
      { path: SCREEN_FILE, text: screenSource },
      { path: 'app/screens/not-in-the-graph.tsx', text: 'export const Secret = 1;\n' },
    ],
  });

  it('names the flow to trace and the entry point it starts at', () => {
    expect(prompt.prompt).toContain('A shopper places an order from the checkout screen');
    expect(prompt.prompt).toContain(
      `${flow.entryPoint.kind} at ${flow.entryPoint.file}:${String(flow.entryPoint.line)}`,
    );
  });

  it('lists every file the reference graph knows, with its language', () => {
    expect(prompt.prompt).toContain(`${SCREEN_FILE} (typescript)`);
    expect(prompt.prompt).toContain(`${CONTROLLER_FILE} (ruby)`);
  });

  it('lists every reference edge, so the pass knows which hops it may call verified', () => {
    expect(prompt.prompt).toContain(`${SCREEN_FILE} -> ${ORDERS_CLIENT_FILE}`);
  });

  it('numbers every line of a source, so a node can name the line it read', () => {
    expect(prompt.prompt).toContain(`=== ${SCREEN_FILE}\n1| import { placeOrder }`);
  });

  it('sends no source the reference graph does not know', () => {
    expect(prompt.prompt).not.toContain('Secret');
  });

  it('asks for lanes, nodes, and edges only, so the answer cannot rename the flow', () => {
    expect(prompt.outputSchema).toMatchObject({
      type: 'object',
      required: ['lanes', 'nodes', 'edges'],
      additionalProperties: false,
    });
  });

  it('gives the model room to answer and states the output it expects', () => {
    expect(prompt.maxOutputTokens).toBeGreaterThanOrEqual(prompt.expectedOutputTokens);
    expect(prompt.expectedOutputTokens).toBeGreaterThan(0);
  });
});
