export const hundredth = (value: number): number => value / 100;

export const percent = (amount: number, rate: number): number => hundredth(amount * rate * 100);
