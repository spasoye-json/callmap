import type { Sources } from './data.ts';

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export const unpackedSourcesOf = async (packed: string): Promise<Sources> => {
  const decompression = new DecompressionStream('gzip');
  const writer = decompression.writable.getWriter();
  void writer.write(bytesOf(packed));
  void writer.close();
  const reader = decompression.readable.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
    text += decoder.decode(chunk.value, { stream: true });
  return JSON.parse(text + decoder.decode()) as Sources;
};
