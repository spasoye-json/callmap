import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const PAGE = fileURLToPath(new URL('../page/', import.meta.url));
const PARTS = join(PAGE, 'parts');
const ENTRY = '\0reader-page-entry';

const partsWith = (extension: string): readonly string[] =>
  readdirSync(PARTS)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => join(PARTS, name));

const entrySource = (): string => {
  const parts = partsWith('.ts');
  return [
    `import { startReaderPage } from ${JSON.stringify(join(PAGE, 'main.ts'))};`,
    ...parts.map((path, index) => `import part${index} from ${JSON.stringify(path)};`),
    `startReaderPage([${parts.map((_, index) => `part${index}`).join(', ')}]);`,
  ].join('\n');
};

export const pageScript = async (): Promise<string> => {
  const bundle = await rolldown({
    input: ENTRY,
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'reader-page-entry',
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) => (id === ENTRY ? entrySource() : null),
      },
    ],
  });
  try {
    const { output } = await bundle.generate({ format: 'iife', minify: true });
    return output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');
  } finally {
    await bundle.close();
  }
};

export const pageStyle = (): string =>
  [join(PAGE, 'page.css'), join(PAGE, 'drawing.css'), ...partsWith('.css')]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
