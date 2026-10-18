export function total(cents: readonly number[]): number {
  return round(cents.reduce((sum, cent) => sum + cent, 0));
}

export const round = (cents: number): number => Math.round(cents);

export const format = function (cents: number): string {
  return JSON.stringify(round(cents) / 100);
};
