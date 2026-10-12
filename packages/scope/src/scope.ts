/**
 * Scope globs: what a repo was opened under, so a monorepo is mapped one subtree at a time
 * (ADR-0009, ADR-0011). The host and every extractor read a scope through this one reader.
 *
 * The syntax is the small part of glob a scope needs and no more: `*` for anything inside one path
 * segment, `**` for anything across segments, `?` for one character inside a segment. Everything
 * else in a glob is a literal, so a dot is a dot. A glob matches a whole repo-relative path and
 * never a prefix of one, because a scope of `src/checkout` must not quietly take `src/checkout.ts`.
 */

const ESCAPED = /[.+^${}()|[\]\\]/g;

const segmentPattern = (segment: string): string =>
  segment.replace(ESCAPED, '\\$&').replaceAll('?', '[^/]').replaceAll('*', '[^/]*');

/**
 * A `**` segment stands for any run of segments, including none, so `src/**` takes `src/a.ts` and
 * `src/a/b.ts` alike. As the last segment it takes everything below it; anywhere else it swallows
 * the separator that follows it, so a glob of `src`, `**`, `*.ts` still matches `src/a.ts`.
 */
const globPattern = (glob: string): string =>
  glob
    .split('/')
    .map((segment, index, segments) => {
      const last = index === segments.length - 1;
      if (segment === '**') return last ? '.*' : '(?:[^/]+/)*';
      return last ? segmentPattern(segment) : `${segmentPattern(segment)}/`;
    })
    .join('');

/**
 * Whether a repo-relative path is in scope. An empty scope narrows nothing, so every file of the
 * repo is in it.
 */
export const inScope = (path: string, scope: readonly string[]): boolean =>
  scope.length === 0 || scope.some((glob) => new RegExp(`^${globPattern(glob)}$`).test(path));
