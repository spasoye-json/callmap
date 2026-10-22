export const countTextOf = (count: number): string =>
  String(count).replace(/\B(?=(\d{3})+$)/g, ',');

export const countWordsOf = (count: number, one: string, many = one): string =>
  `${String(count)} ${count === 1 ? one : many}`;
