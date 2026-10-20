export const countWordsOf = (count: number, one: string, many = one): string =>
  `${String(count)} ${count === 1 ? one : many}`;
