import { describe, expect, it } from 'vitest';
import {
  candidate,
  checkoutFlow,
  CONTROLLER_FILE,
  fixtureReferenceGraph,
  JOB_FILE,
  SCREEN_FILE,
} from '@archmap/testing';
import {
  candidateOf,
  curate,
  CurationError,
  EMPTY_CURATION,
  parseCuration,
  pendingProposals,
  serialiseCuration,
} from '../src/index.ts';
import type { CurationRecord, ProposedEntryPoint } from '../src/index.ts';

const referenceGraph = fixtureReferenceGraph();

const placeAnOrder: ProposedEntryPoint = {
  id: 'place-an-order',
  name: 'A shopper places an order from the checkout screen',
  entryPoint: { kind: 'screen', file: SCREEN_FILE, line: 12 },
};

const sendReceipt: ProposedEntryPoint = {
  id: 'send-a-receipt',
  name: 'The receipt job mails the shopper a receipt',
  entryPoint: { kind: 'event-listener', file: JOB_FILE, line: 4 },
};

const refundAnOrder: ProposedEntryPoint = {
  id: 'refund-an-order',
  name: 'An admin refunds an order',
  entryPoint: { kind: 'route', file: CONTROLLER_FILE, line: 41 },
};

describe('pendingProposals', () => {
  it('keeps every proposal no earlier curation decided', () => {
    const pending = pendingProposals([placeAnOrder, sendReceipt], {
      flows: [],
      curation: EMPTY_CURATION,
    });
    expect(pending).toEqual({ pending: [placeAnOrder, sendReceipt], alreadyCurated: [] });
  });

  it('holds back a proposal whose id the map already carries as a flow or a rejection', () => {
    const pending = pendingProposals([placeAnOrder, sendReceipt, refundAnOrder], {
      flows: [checkoutFlow(), candidate('refund-an-order')],
      curation: { rejected: [sendReceipt] },
    });
    expect(pending.pending).toEqual([placeAnOrder]);
    expect(pending.alreadyCurated).toEqual([
      { id: 'send-a-receipt', decision: 'rejected' },
      { id: 'refund-an-order', decision: 'accepted' },
    ]);
  });
});

describe('curate', () => {
  it('turns each accepted proposal into a candidate and records each rejected one', () => {
    const curated = curate(
      { accept: [placeAnOrder], reject: [sendReceipt] },
      { flows: [], curation: EMPTY_CURATION },
      { referenceGraph },
    );
    expect(curated).toEqual({
      candidates: [candidateOf(placeAnOrder)],
      curation: { rejected: [sendReceipt] },
    });
  });

  it('keeps the earlier rejections, in id order', () => {
    const curated = curate(
      { accept: [], reject: [placeAnOrder] },
      { flows: [], curation: { rejected: [sendReceipt] } },
      { referenceGraph },
    );
    expect(curated.curation.rejected.map((proposal) => proposal.id)).toEqual([
      'place-an-order',
      'send-a-receipt',
    ]);
  });

  it('refuses a proposal anchored to a file the reference graph does not know', () => {
    const invented = {
      ...placeAnOrder,
      entryPoint: { ...placeAnOrder.entryPoint, file: 'app/screens/invented.tsx' },
    };
    expect(() =>
      curate(
        { accept: [invented], reject: [] },
        { flows: [], curation: EMPTY_CURATION },
        { referenceGraph },
      ),
    ).toThrow(expect.objectContaining({ code: 'proposal-refused' }) as unknown);
  });

  it('refuses one id decided both ways', () => {
    expect(() =>
      curate(
        { accept: [placeAnOrder], reject: [placeAnOrder] },
        { flows: [], curation: EMPTY_CURATION },
        { referenceGraph },
      ),
    ).toThrow(CurationError);
  });

  it('refuses to decide again on an id the map already carries', () => {
    const decideAgain = (map: Parameters<typeof curate>[1]) => () =>
      curate({ accept: [], reject: [refundAnOrder] }, map, { referenceGraph });
    expect(decideAgain({ flows: [candidate()], curation: EMPTY_CURATION })).toThrow(
      expect.objectContaining({ code: 'already-curated' }) as unknown,
    );
    expect(decideAgain({ flows: [], curation: { rejected: [refundAnOrder] } })).toThrow(
      expect.objectContaining({ code: 'already-curated' }) as unknown,
    );
  });
});

describe('the curation record', () => {
  it('reads back what it wrote', () => {
    const record: CurationRecord = { rejected: [sendReceipt, placeAnOrder] };
    expect(parseCuration(serialiseCuration(record))).toEqual({
      rejected: [placeAnOrder, sendReceipt],
    });
  });

  it('is written with sorted rejections, two-space indent, and a trailing newline', () => {
    const text = serialiseCuration({ rejected: [sendReceipt, placeAnOrder] });
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "rejected": [\n    {\n      "id": "place-an-order"');
  });

  it('refuses a record that is not the curation shape', () => {
    expect(() => parseCuration('{"accepted": []}')).toThrow(CurationError);
    expect(() => parseCuration('{"rejected": [{"id": "x"}]}')).toThrow(CurationError);
    expect(() => parseCuration('not json')).toThrow(CurationError);
  });
});
