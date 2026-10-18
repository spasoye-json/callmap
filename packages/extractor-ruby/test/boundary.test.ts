import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFlowDocument } from '@archmap/flow-document';
import type { FlowDocument } from '@archmap/flow-document';
import { referenceGraphFromDocuments } from '@archmap/reference-graph';
import { extractRuby } from '../src/index.ts';

const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const RECEIPT_JOB = 'shop/app/jobs/receipt_job.rb';
const BILLING_CLIENT = 'shop/app/services/billing_client.rb';
const INVOICES_CONTROLLER = 'billing/app/controllers/invoices_controller.rb';
const INVOICE = 'billing/app/models/invoice.rb';

const referenceGraph = referenceGraphFromDocuments(extractRuby({ repo: FIXTURE }));

/**
 * The receipt job in the shop app asks the billing app for an invoice over HTTP. The two apps boot
 * two loaders, so the step from one to the other is a boundary the Ruby reference graph cannot
 * prove, and only evidence can propose it (ADR-0004, ADR-0009).
 */
const invoiceFlow = (): FlowDocument => ({
  id: 'invoice-an-order',
  name: 'Invoice an order once its receipt is sent',
  entryPoint: { kind: 'event-listener', file: RECEIPT_JOB, line: 2 },
  lanes: [
    { id: 'shop', name: 'Shop app' },
    { id: 'billing', name: 'Billing app' },
  ],
  nodes: [
    {
      id: 'perform',
      kind: 'step',
      label: 'ReceiptJob#perform',
      lane: 'shop',
      file: RECEIPT_JOB,
      line: 2,
    },
    {
      id: 'post-invoice',
      kind: 'side-effect',
      label: 'POST /invoices',
      lane: 'shop',
      file: BILLING_CLIENT,
      line: 5,
    },
    {
      id: 'create-invoice',
      kind: 'step',
      label: 'InvoicesController#create',
      lane: 'billing',
      file: INVOICES_CONTROLLER,
      line: 2,
    },
    {
      id: 'build-invoice',
      kind: 'step',
      label: 'Invoice.for',
      lane: 'billing',
      file: INVOICE,
      line: 2,
    },
  ],
  edges: [
    { kind: 'verified', from: 'perform', to: 'post-invoice' },
    {
      kind: 'inferred',
      from: 'post-invoice',
      to: 'create-invoice',
      boundary: 'http',
      evidence: {
        quote: 'Net::HTTP.post(URI("http://billing.internal/invoices")',
        file: BILLING_CLIENT,
        line: 5,
      },
    },
    { kind: 'verified', from: 'create-invoice', to: 'build-invoice' },
  ],
});

describe('a step between two Rails apps', () => {
  it('is accepted as an inferred edge that carries its evidence', () => {
    const result = validateFlowDocument(invoiceFlow(), { referenceGraph });
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('is refused as a verified edge, because the reference graph does not prove it', () => {
    const flow = invoiceFlow();
    const claimed: FlowDocument = {
      ...flow,
      nodes: flow.nodes.map((node) => ({ ...node, lane: 'shop' })),
      edges: flow.edges.map((edge) =>
        edge.kind === 'inferred' ? { kind: 'verified', from: edge.from, to: edge.to } : edge,
      ),
    };
    const result = validateFlowDocument(claimed, { referenceGraph });
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([
      'unproven-verified-edge',
    ]);
  });
});
