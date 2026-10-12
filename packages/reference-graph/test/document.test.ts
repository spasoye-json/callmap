import { describe, expect, it } from 'vitest';
import {
  readReferenceGraphDocument,
  ReferenceGraphError,
  referenceGraphFromDocuments,
} from '../src/index.ts';
import type { ReferenceEdge, ReferenceGraphDocument } from '../src/index.ts';

const document = (over: Partial<ReferenceGraphDocument> = {}): ReferenceGraphDocument => ({
  language: 'typescript',
  scope: ['src/**'],
  files: ['src/a.ts', 'src/b.ts'],
  edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
  ...over,
});

describe('readReferenceGraphDocument', () => {
  it('reads the document one extractor emitted', () => {
    expect(readReferenceGraphDocument(document())).toEqual(document());
  });

  it('reads the language tag the extractor stamped on the document', () => {
    expect(readReferenceGraphDocument(document({ language: 'ruby' })).language).toBe('ruby');
  });

  it('reads the scope the document was built under', () => {
    const read = readReferenceGraphDocument(document({ scope: ['app/**', 'lib/**'] }));
    expect(read.scope).toEqual(['app/**', 'lib/**']);
  });

  it('reads an empty scope, which is a whole repo no glob narrowed', () => {
    expect(readReferenceGraphDocument(document({ scope: [] })).scope).toEqual([]);
  });
});

describe('a document the contract does not allow', () => {
  const refuse = (value: unknown) => () => readReferenceGraphDocument(value);

  it('refuses a document that is not an object', () => {
    expect(refuse('files and edges')).toThrow(ReferenceGraphError);
  });

  it('refuses a document that names no language tag', () => {
    const { language: _language, ...rest } = document();
    expect(refuse(rest)).toThrow(/language/);
  });

  it('refuses a document that names no scope, because a scope of none is not the same as none', () => {
    const { scope: _scope, ...rest } = document();
    expect(refuse(rest)).toThrow(/scope/);
  });

  it('refuses a document that names no files', () => {
    const { files: _files, ...rest } = document();
    expect(refuse(rest)).toThrow(/files/);
  });

  it('refuses a document that names no edges', () => {
    const { edges: _edges, ...rest } = document();
    expect(refuse(rest)).toThrow(/edges/);
  });

  it('refuses an extra field, so nothing is smuggled through the contract', () => {
    expect(refuse({ ...document(), symbols: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses a scope that is not an array', () => {
    expect(refuse(document({ scope: 'src/**' as unknown as readonly string[] }))).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses an empty scope glob', () => {
    expect(refuse(document({ scope: [''] }))).toThrow(ReferenceGraphError);
  });

  it('refuses a file that is not a path', () => {
    expect(refuse(document({ files: [12 as unknown as string] }))).toThrow(ReferenceGraphError);
  });

  it('refuses an absolute file path, because a document travels between machines', () => {
    expect(refuse(document({ files: ['/home/reader/repo/src/a.ts'] }))).toThrow(/repo-relative/);
  });

  it('refuses a path that climbs out of the repo', () => {
    expect(refuse(document({ files: ['../other-repo/src/a.ts'] }))).toThrow(/inside the repo/);
  });

  it('refuses a path written with Windows separators', () => {
    expect(refuse(document({ files: ['src\\a.ts'] }))).toThrow(/forward slashes/);
  });

  it('refuses a Windows drive path, which is absolute without a leading slash', () => {
    expect(refuse(document({ files: ['C:/repo/src/a.ts'] }))).toThrow(/repo-relative/);
  });

  it('refuses a leading dot segment, so one file is not claimed under two spellings', () => {
    expect(refuse(document({ files: ['./src/a.ts'] }))).toThrow(/one way/);
  });

  it('refuses a dot segment inside a path', () => {
    expect(refuse(document({ files: ['src/./a.ts'] }))).toThrow(/one way/);
  });

  it('refuses a doubled slash, which spells one file a second way', () => {
    expect(refuse(document({ files: ['src//a.ts'] }))).toThrow(/one way/);
  });

  it('refuses a trailing slash, which spells one file a second way', () => {
    expect(refuse(document({ files: ['src/a.ts/'] }))).toThrow(/one way/);
  });

  it('refuses a dot segment at the end of a reference edge', () => {
    expect(refuse(document({ edges: [{ from: 'src/a.ts', to: './src/b.ts' }] }))).toThrow(
      /one way/,
    );
  });

  it('refuses an absolute path at the end of a reference edge', () => {
    expect(refuse(document({ edges: [{ from: 'src/a.ts', to: '/src/b.ts' }] }))).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses an extra field on a reference edge', () => {
    expect(
      refuse(
        document({ edges: [{ from: 'src/a.ts', to: 'src/b.ts', weight: 2 } as ReferenceEdge] }),
      ),
    ).toThrow(ReferenceGraphError);
  });

  it('allows an edge to a file the document does not list, which another extractor may claim', () => {
    const read = readReferenceGraphDocument(
      document({ files: ['src/a.ts'], edges: [{ from: 'src/a.ts', to: 'app/models/order.rb' }] }),
    );
    expect(read.edges).toEqual([{ from: 'src/a.ts', to: 'app/models/order.rb' }]);
  });
});

describe('referenceGraphFromDocuments', () => {
  const typescript = document({
    language: 'typescript',
    scope: ['app/**'],
    files: ['app/checkout.ts', 'app/api-client.ts'],
    edges: [{ from: 'app/checkout.ts', to: 'app/api-client.ts' }],
  });
  const ruby = document({
    language: 'ruby',
    scope: [],
    files: ['app/models/order.rb'],
    edges: [],
  });

  it('stamps every file of a document with that document language tag', () => {
    const graph = referenceGraphFromDocuments(typescript);
    expect(graph.languageOf('app/checkout.ts')).toBe('typescript');
    expect(graph.languageOf('app/api-client.ts')).toBe('typescript');
  });

  it('holds the reference edges the document emitted', () => {
    expect(
      referenceGraphFromDocuments(typescript).references('app/checkout.ts', 'app/api-client.ts'),
    ).toBe(true);
  });

  it('merges the documents of every extractor that matched the repo', () => {
    const graph = referenceGraphFromDocuments(typescript, ruby);
    expect(graph.files).toHaveLength(3);
    expect(graph.languageOf('app/models/order.rb')).toBe('ruby');
  });

  it('leaves two documents in two languages, so nothing verified rides across them', () => {
    const graph = referenceGraphFromDocuments(typescript, ruby);
    expect(graph.sameLanguage('app/checkout.ts', 'app/models/order.rb')).toBe(false);
  });

  it('refuses a document whose edge reaches a file another document claims in another language', () => {
    const client = document({
      language: 'typescript',
      files: ['web/orders-client.ts'],
      edges: [{ from: 'web/orders-client.ts', to: 'app/models/order.rb' }],
    });
    expect(() => referenceGraphFromDocuments(client, ruby)).toThrow(ReferenceGraphError);
  });

  it('refuses an edge to a file no document in the merge claims', () => {
    expect(() =>
      referenceGraphFromDocuments(
        document({ files: ['src/a.ts'], edges: [{ from: 'src/a.ts', to: 'src/gone.ts' }] }),
      ),
    ).toThrow(/gone.ts/);
  });

  it('refuses the malformed document of one extractor in a merge', () => {
    expect(() =>
      referenceGraphFromDocuments(typescript, null as unknown as ReferenceGraphDocument),
    ).toThrow(ReferenceGraphError);
  });

  it('indexes no document at all as the empty graph', () => {
    expect(referenceGraphFromDocuments().files).toEqual([]);
  });

  it('refuses two documents claiming one file under two spellings, rather than merging both', () => {
    expect(() =>
      referenceGraphFromDocuments(
        document({ language: 'typescript', files: ['src/a.ts'], edges: [] }),
        document({ language: 'javascript', files: ['./src/a.ts'], edges: [] }),
      ),
    ).toThrow(/one way/);
  });
});
