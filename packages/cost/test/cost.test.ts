import { describe, expect, it } from 'vitest';
import {
  addSpend,
  costOf,
  estimateOf,
  monthOf,
  parseSpend,
  serialiseSpend,
  spendIn,
} from '../src/index.ts';
import type { TokenPrice } from '../src/index.ts';

const opusPrice: TokenPrice = { inputPerMillionTokens: 4, outputPerMillionTokens: 20 };

describe('costOf', () => {
  it('prices input and output tokens at their own rates', () => {
    expect(costOf({ inputTokens: 250_000, outputTokens: 50_000 }, opusPrice)).toBeCloseTo(2, 10);
  });
});

describe('estimateOf', () => {
  it('names the model and prices the tokens a pass is expected to use', () => {
    expect(
      estimateOf('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0 }, opusPrice),
    ).toEqual({ model: 'claude-opus-5-5', inputTokens: 1_000_000, outputTokens: 0, usd: 4 });
  });
});

describe('monthOf', () => {
  it('reads the calendar month in UTC, so a total does not move with the time zone', () => {
    expect(monthOf(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(monthOf(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11');
    expect(monthOf(new Date('2027-01-05T12:00:00Z'))).toBe('2027-01');
  });
});

describe('the monthly spend', () => {
  it('is zero for a month with no pass', () => {
    expect(spendIn({}, '2026-10')).toEqual({
      month: '2026-10',
      passes: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
    });
  });

  it('adds each pass to the month it ran in and leaves other months alone', () => {
    let record = addSpend({}, '2026-09', { inputTokens: 10, outputTokens: 5 }, opusPrice);
    record = addSpend(record, '2026-10', { inputTokens: 500_000, outputTokens: 0 }, opusPrice);
    record = addSpend(record, '2026-10', { inputTokens: 0, outputTokens: 100_000 }, opusPrice);
    expect(spendIn(record, '2026-10')).toEqual({
      month: '2026-10',
      passes: 2,
      inputTokens: 500_000,
      outputTokens: 100_000,
      usd: 4,
    });
    expect(spendIn(record, '2026-09').passes).toBe(1);
  });

  it('reads back what it wrote', () => {
    const record = addSpend({}, '2026-10', { inputTokens: 7, outputTokens: 3 }, opusPrice);
    expect(parseSpend(serialiseSpend(record))).toEqual(record);
  });

  it('reads a record it cannot understand as no spend, so a broken file never blocks a pass', () => {
    expect(parseSpend('not json')).toEqual({});
    expect(parseSpend('{"2026-10": {"passes": "two"}}')).toEqual({});
  });
});
