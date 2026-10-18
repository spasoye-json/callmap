export const addTo = <K, V>(index: Map<K, Set<V>>, key: K, value: V): void => {
  const known = index.get(key);
  if (known === undefined) index.set(key, new Set([value]));
  else known.add(value);
};

export const appendTo = <K, V>(index: Map<K, V[]>, key: K, value: V): void => {
  const known = index.get(key);
  if (known === undefined) index.set(key, [value]);
  else known.push(value);
};
