/**
 * What an AI pass costs. Every pass shows an estimate before it runs and adds what it spent to a
 * monthly total (ADR-0010), so the cost of the map is never a surprise. The total belongs to the
 * person who pays, not to the repo, so the host keeps it outside the map file.
 */

/** A model's price in US dollars per million tokens. */
export interface TokenPrice {
  readonly inputPerMillionTokens: number;
  readonly outputPerMillionTokens: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** The cost a reader sees before a pass, to decide what the pass is worth. */
export interface CostEstimate extends TokenUsage {
  readonly model: string;
  readonly usd: number;
}

/** One calendar month of passes, by `YYYY-MM`. */
export interface MonthlySpend extends TokenUsage {
  readonly month: string;
  readonly passes: number;
  readonly usd: number;
}

/** Every month that saw a pass, keyed by `YYYY-MM`. */
export type SpendRecord = Readonly<Record<string, Omit<MonthlySpend, 'month'>>>;

const MILLION = 1_000_000;

export const costOf = (usage: TokenUsage, price: TokenPrice): number =>
  (usage.inputTokens * price.inputPerMillionTokens +
    usage.outputTokens * price.outputPerMillionTokens) /
  MILLION;

export const estimateOf = (model: string, usage: TokenUsage, price: TokenPrice): CostEstimate => ({
  model,
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  usd: costOf(usage, price),
});

/** The month a pass ran in, read in UTC so the same pass never lands in two months. */
export const monthOf = (date: Date): string =>
  `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const spendIn = (record: SpendRecord, month: string): MonthlySpend => ({
  month,
  ...(record[month] ?? { passes: 0, inputTokens: 0, outputTokens: 0, usd: 0 }),
});

export const addSpend = (
  record: SpendRecord,
  month: string,
  usage: TokenUsage,
  price: TokenPrice,
): SpendRecord => {
  const before = spendIn(record, month);
  return {
    ...record,
    [month]: {
      passes: before.passes + 1,
      inputTokens: before.inputTokens + usage.inputTokens,
      outputTokens: before.outputTokens + usage.outputTokens,
      usd: before.usd + costOf(usage, price),
    },
  };
};

export const serialiseSpend = (record: SpendRecord): string =>
  `${JSON.stringify(record, null, 2)}\n`;

const isMonthEntry = (value: unknown): value is Omit<MonthlySpend, 'month'> => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return ['passes', 'inputTokens', 'outputTokens', 'usd'].every(
    (field) => typeof entry[field] === 'number',
  );
};

/**
 * A record that cannot be read counts as no spend. The total is a convenience for the person who
 * pays, and a broken file must never stop a pass they already chose to pay for.
 */
export const parseSpend = (text: string): SpendRecord => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_error) {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries = Object.entries(value);
  return entries.every(([month, entry]) => /^\d{4}-\d{2}$/.test(month) && isMonthEntry(entry))
    ? Object.fromEntries(entries)
    : {};
};
