export const countTextOf = (count: number): string =>
  String(count).replace(/\B(?=(\d{3})+$)/g, ',');

export const countWordsOf = (count: number, one: string, many = one): string =>
  `${String(count)} ${count === 1 ? one : many}`;

const countTextWordsOf = (count: number, one: string, many: string): string =>
  `${countTextOf(count)} ${count === 1 ? one : many}`;

export const callsWordsOf = (calls: number): string => countTextWordsOf(calls, 'call', 'calls');

export const functionsAndCallsOf = ({
  functions,
  calls,
}: {
  readonly functions: number;
  readonly calls: number;
}): string => `${countTextWordsOf(functions, 'function', 'functions')} and ${callsWordsOf(calls)}`;
