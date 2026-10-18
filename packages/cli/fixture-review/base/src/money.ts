export const round = (amount: number): number => Math.round(amount * 100) / 100;

export const format = (amount: number): string => `${round(amount).toFixed(2)} EUR`;
