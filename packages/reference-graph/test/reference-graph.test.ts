import { describe, expect, it } from 'vitest';
import {
  createReferenceGraph,
  emptyReferenceGraph,
  mergeReferenceGraphs,
  ReferenceGraphError,
} from '../src/index.ts';
import type { ReferenceGraphInput } from '../src/index.ts';

const ts = (...paths: readonly string[]) => paths.map((path) => ({ path, language: 'typescript' }));

describe('createReferenceGraph', () => {
  it('knows every file an extractor claimed', () => {
    const graph = createReferenceGraph({ files: ts('a.ts', 'b.ts'), edges: [] });
    expect(graph.knows('a.ts')).toBe(true);
    expect(graph.knows('b.ts')).toBe(true);
  });

  it('does not know a file no extractor claimed', () => {
    const graph = createReferenceGraph({ files: ts('a.ts'), edges: [] });
    expect(graph.knows('invented.ts')).toBe(false);
  });

  it('reports the language of a known file', () => {
    const graph = createReferenceGraph({
      files: [
        { path: 'app/models/order.rb', language: 'ruby' },
        { path: 'src/order.ts', language: 'typescript' },
      ],
      edges: [],
    });
    expect(graph.languageOf('app/models/order.rb')).toBe('ruby');
    expect(graph.languageOf('src/order.ts')).toBe('typescript');
  });

  it('reports no language for an unknown file', () => {
    expect(emptyReferenceGraph().languageOf('a.ts')).toBeUndefined();
  });

  it('holds files in path order whatever order they arrived in', () => {
    const graph = createReferenceGraph({ files: ts('c.ts', 'a.ts', 'b.ts'), edges: [] });
    expect(graph.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('holds edges in a stable order whatever order they arrived in', () => {
    const graph = createReferenceGraph({
      files: ts('a.ts', 'b.ts', 'c.ts'),
      edges: [
        { from: 'c.ts', to: 'a.ts' },
        { from: 'a.ts', to: 'c.ts' },
        { from: 'a.ts', to: 'b.ts' },
      ],
    });
    expect(graph.edges).toEqual([
      { from: 'a.ts', to: 'b.ts' },
      { from: 'a.ts', to: 'c.ts' },
      { from: 'c.ts', to: 'a.ts' },
    ]);
  });

  it('keeps one entry for a file claimed twice by the same extractor', () => {
    const graph = createReferenceGraph({ files: ts('a.ts', 'a.ts'), edges: [] });
    expect(graph.files).toEqual([{ path: 'a.ts', language: 'typescript' }]);
  });

  it('keeps one entry for a reference edge emitted twice', () => {
    const graph = createReferenceGraph({
      files: ts('a.ts', 'b.ts'),
      edges: [
        { from: 'a.ts', to: 'b.ts' },
        { from: 'a.ts', to: 'b.ts' },
      ],
    });
    expect(graph.edges).toHaveLength(1);
  });

  it('refuses a file claimed by two extractors with different languages', () => {
    expect(() =>
      createReferenceGraph({
        files: [
          { path: 'a.ts', language: 'typescript' },
          { path: 'a.ts', language: 'go' },
        ],
        edges: [],
      }),
    ).toThrow(ReferenceGraphError);
  });

  it('refuses an empty file path', () => {
    expect(() => createReferenceGraph({ files: ts(''), edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses an empty language tag', () => {
    expect(() =>
      createReferenceGraph({ files: [{ path: 'a.ts', language: '  ' }], edges: [] }),
    ).toThrow(ReferenceGraphError);
  });

  it('refuses an edge whose source the graph does not list', () => {
    expect(() =>
      createReferenceGraph({ files: ts('b.ts'), edges: [{ from: 'a.ts', to: 'b.ts' }] }),
    ).toThrow(/a.ts/);
  });

  it('refuses an edge whose target the graph does not list', () => {
    expect(() =>
      createReferenceGraph({ files: ts('a.ts'), edges: [{ from: 'a.ts', to: 'b.ts' }] }),
    ).toThrow(/b.ts/);
  });

  it('refuses a reference edge from a file to itself', () => {
    expect(() =>
      createReferenceGraph({ files: ts('a.ts'), edges: [{ from: 'a.ts', to: 'a.ts' }] }),
    ).toThrow(ReferenceGraphError);
  });

  it('accepts a language tag it has never heard of, because the core is language-blind', () => {
    const graph = createReferenceGraph({
      files: [{ path: 'main.zig', language: 'zig' }],
      edges: [],
    });
    expect(graph.languageOf('main.zig')).toBe('zig');
  });
});

describe('references', () => {
  const graph = createReferenceGraph({
    files: ts('a.ts', 'b.ts', 'c.ts'),
    edges: [{ from: 'a.ts', to: 'b.ts' }],
  });

  it('reports a reference in the direction the source text reads', () => {
    expect(graph.references('a.ts', 'b.ts')).toBe(true);
  });

  it('does not report a reference in the direction the source text does not read', () => {
    expect(graph.references('b.ts', 'a.ts')).toBe(false);
  });

  it('reports no reference between two unconnected files', () => {
    expect(graph.references('a.ts', 'c.ts')).toBe(false);
  });

  it('reports no reference for a file it does not know', () => {
    expect(graph.references('a.ts', 'invented.ts')).toBe(false);
  });
});

describe('joins', () => {
  const graph = createReferenceGraph({
    files: ts('caller.ts', 'listener.ts', 'lonely.ts'),
    edges: [{ from: 'caller.ts', to: 'listener.ts' }],
  });

  it('joins a pair in the direction of the reference', () => {
    expect(graph.joins('caller.ts', 'listener.ts')).toBe(true);
  });

  it('joins a pair against the direction of the reference, because a callback inverts it', () => {
    expect(graph.joins('listener.ts', 'caller.ts')).toBe(true);
  });

  it('does not join a pair no reference edge touches', () => {
    expect(graph.joins('caller.ts', 'lonely.ts')).toBe(false);
  });

  it('does not join a file to itself', () => {
    expect(graph.joins('caller.ts', 'caller.ts')).toBe(false);
  });
});

describe('sameLanguage', () => {
  const graph = createReferenceGraph({
    files: [
      { path: 'app/web.ts', language: 'typescript' },
      { path: 'app/api.ts', language: 'typescript' },
      { path: 'server/main.go', language: 'go' },
    ],
    edges: [],
  });

  it('is true for two files of one language', () => {
    expect(graph.sameLanguage('app/web.ts', 'app/api.ts')).toBe(true);
  });

  it('is false across two languages', () => {
    expect(graph.sameLanguage('app/web.ts', 'server/main.go')).toBe(false);
  });

  it('is false when a file is unknown', () => {
    expect(graph.sameLanguage('app/web.ts', 'invented.ts')).toBe(false);
  });
});

describe('mergeReferenceGraphs', () => {
  const typescript = {
    files: ts('app/checkout.ts', 'app/api-client.ts'),
    edges: [{ from: 'app/checkout.ts', to: 'app/api-client.ts' }],
  };
  const ruby = {
    files: [
      { path: 'app/controllers/orders_controller.rb', language: 'ruby' },
      { path: 'app/models/order.rb', language: 'ruby' },
    ],
    edges: [
      {
        from: 'app/controllers/orders_controller.rb',
        to: 'app/models/order.rb',
      },
    ],
  };

  it('holds every file of every extractor that matched the repo', () => {
    const merged = mergeReferenceGraphs(typescript, ruby);
    expect(merged.files).toHaveLength(4);
    expect(merged.knows('app/checkout.ts')).toBe(true);
    expect(merged.knows('app/models/order.rb')).toBe(true);
  });

  it('keeps each extractor language tag', () => {
    const merged = mergeReferenceGraphs(typescript, ruby);
    expect(merged.languageOf('app/checkout.ts')).toBe('typescript');
    expect(merged.languageOf('app/models/order.rb')).toBe('ruby');
  });

  it('holds every reference edge of every extractor', () => {
    const merged = mergeReferenceGraphs(typescript, ruby);
    expect(merged.references('app/checkout.ts', 'app/api-client.ts')).toBe(true);
    expect(merged.references('app/controllers/orders_controller.rb', 'app/models/order.rb')).toBe(
      true,
    );
  });

  it('leaves the two languages unjoined, so nothing invents a cross-language reference', () => {
    const merged = mergeReferenceGraphs(typescript, ruby);
    expect(merged.joins('app/checkout.ts', 'app/controllers/orders_controller.rb')).toBe(false);
  });

  it('refuses an edge one extractor named across a file another extractor claimed in another language', () => {
    expect(() =>
      mergeReferenceGraphs(
        {
          files: [{ path: 'a.ts', language: 'typescript' }],
          edges: [{ from: 'a.ts', to: 'b.rb' }],
        },
        { files: [{ path: 'b.rb', language: 'ruby' }], edges: [] },
      ),
    ).toThrow(/a\.ts.*b\.rb.*typescript.*ruby/);
  });

  it('joins a pair one extractor named across a file another extractor claimed in its language', () => {
    const graph = mergeReferenceGraphs(
      { files: [{ path: 'a.ts', language: 'typescript' }], edges: [{ from: 'a.ts', to: 'b.ts' }] },
      { files: [{ path: 'b.ts', language: 'typescript' }], edges: [] },
    );
    expect(graph.joins('a.ts', 'b.ts')).toBe(true);
  });

  it('refuses an edge across two languages that one input claims both ends of', () => {
    expect(() =>
      createReferenceGraph({
        files: [
          { path: 'a.ts', language: 'typescript' },
          { path: 'b.rb', language: 'ruby' },
        ],
        edges: [{ from: 'b.rb', to: 'a.ts' }],
      }),
    ).toThrow(ReferenceGraphError);
  });

  it('refuses that same edge from one extractor alone, which claims no such file', () => {
    expect(() =>
      createReferenceGraph({
        files: [{ path: 'a.ts', language: 'typescript' }],
        edges: [{ from: 'a.ts', to: 'b.rb' }],
      }),
    ).toThrow(ReferenceGraphError);
  });

  it('merges nothing into the empty graph', () => {
    expect(mergeReferenceGraphs().files).toEqual([]);
  });

  it('refuses two extractors that claim one file with different languages', () => {
    expect(() =>
      mergeReferenceGraphs(
        { files: [{ path: 'shared.rb', language: 'ruby' }], edges: [] },
        { files: [{ path: 'shared.rb', language: 'typescript' }], edges: [] },
      ),
    ).toThrow(ReferenceGraphError);
  });

  it('is order-independent', () => {
    const left = mergeReferenceGraphs(typescript, ruby);
    const right = mergeReferenceGraphs(ruby, typescript);
    expect(left.files).toEqual(right.files);
    expect(left.edges).toEqual(right.edges);
  });
});

describe('emptyReferenceGraph', () => {
  it('knows no file, so every claim about the code is rejected against it', () => {
    const graph = emptyReferenceGraph();
    expect(graph.files).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.knows('anything.ts')).toBe(false);
  });
});

describe('an extractor whose output cannot form a graph', () => {
  /**
   * An extractor is a separate process (ADR-0009), so its output is data arriving over a contract
   * rather than a value the compiler checked. A shape the contract does not allow is refused as a
   * `ReferenceGraphError`, which is what that error exists for, and never escapes as a `TypeError`
   * from the middle of indexing.
   */
  const refuse = (input: unknown) => () => createReferenceGraph(input as ReferenceGraphInput);

  it('refuses output that is not an object', () => {
    expect(refuse('files and edges')).toThrow(ReferenceGraphError);
  });

  it('refuses output of null', () => {
    expect(refuse(null)).toThrow(ReferenceGraphError);
  });

  it('refuses output of undefined', () => {
    expect(refuse(undefined)).toThrow(ReferenceGraphError);
  });

  it('refuses output that is an array', () => {
    expect(refuse([])).toThrow(ReferenceGraphError);
  });

  it('refuses output that names no files', () => {
    expect(refuse({ edges: [] })).toThrow(ReferenceGraphError);
  });

  it('names the missing field when it refuses output that names no files', () => {
    expect(refuse({ edges: [] })).toThrow(/files/);
  });

  it('refuses output that names no edges', () => {
    expect(refuse({ files: ts('a.ts') })).toThrow(ReferenceGraphError);
  });

  it('names the missing field when it refuses output that names no edges', () => {
    expect(refuse({ files: ts('a.ts') })).toThrow(/edges/);
  });

  it('refuses files that are not an array', () => {
    expect(refuse({ files: { 'a.ts': 'typescript' }, edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses edges that are not an array', () => {
    expect(refuse({ files: ts('a.ts'), edges: 'none' })).toThrow(ReferenceGraphError);
  });

  it('refuses a file that is not an object', () => {
    expect(refuse({ files: ['a.ts'], edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses a file of null', () => {
    expect(refuse({ files: [null], edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses a file that names no path', () => {
    expect(refuse({ files: [{ language: 'typescript' }], edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses a file that names no language, because a file belongs to one extractor', () => {
    expect(refuse({ files: [{ path: 'a.ts' }], edges: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses a path that is not a string', () => {
    expect(refuse({ files: [{ path: 12, language: 'typescript' }], edges: [] })).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses a language tag that is not a string', () => {
    expect(refuse({ files: [{ path: 'a.ts', language: 12 }], edges: [] })).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses an edge that is not an object', () => {
    expect(refuse({ files: ts('a.ts', 'b.ts'), edges: ['a.ts -> b.ts'] })).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses an edge of null', () => {
    expect(refuse({ files: ts('a.ts'), edges: [null] })).toThrow(ReferenceGraphError);
  });

  it('refuses an edge that names no source', () => {
    expect(refuse({ files: ts('a.ts'), edges: [{ to: 'a.ts' }] })).toThrow(ReferenceGraphError);
  });

  it('refuses an edge that names no target', () => {
    expect(refuse({ files: ts('a.ts'), edges: [{ from: 'a.ts' }] })).toThrow(ReferenceGraphError);
  });

  it('refuses a source that is not a string', () => {
    expect(refuse({ files: ts('a.ts'), edges: [{ from: 12, to: 'a.ts' }] })).toThrow(
      ReferenceGraphError,
    );
  });

  it('refuses an extra field on a file, so nothing is smuggled through the contract', () => {
    expect(
      refuse({ files: [{ path: 'a.ts', language: 'typescript', rank: 1 }], edges: [] }),
    ).toThrow(ReferenceGraphError);
  });

  it('refuses an extra field on an edge', () => {
    expect(
      refuse({ files: ts('a.ts', 'b.ts'), edges: [{ from: 'a.ts', to: 'b.ts', weight: 2 }] }),
    ).toThrow(ReferenceGraphError);
  });

  it('refuses an extra field on the output itself', () => {
    expect(refuse({ files: ts('a.ts'), edges: [], symbols: [] })).toThrow(ReferenceGraphError);
  });

  it('refuses the malformed output of one extractor in a merge', () => {
    expect(() =>
      mergeReferenceGraphs(
        { files: ts('a.ts'), edges: [] },
        null as unknown as ReferenceGraphInput,
      ),
    ).toThrow(ReferenceGraphError);
  });
});
