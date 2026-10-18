export const double = (amount: number): number => amount * 2;

export const doubleAll = (amounts: readonly number[]): number[] =>
  amounts.map((amount) => double(amount));

export const doubleLater = (amount: Promise<number>): Promise<number> =>
  amount.then((value) => double(value));

double(1);
