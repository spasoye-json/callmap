import { isAbsolute, relative, resolve } from 'node:path';
import * as ts from 'typescript';

/** Thrown when the extractor cannot read what it was pointed at. */
export class ExtractionError extends Error {
  override readonly name = 'ExtractionError';
}

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
  /** The `tsconfig.json` to resolve against, if not the one at the root of the repo. */
  readonly tsconfig?: string;
}

/**
 * The one complaint a config can draw that says nothing about a reference graph: no input file was
 * found. The extractor walks its own scope and hands the resolver that file list, so which files
 * the config would have compiled is not a question it ever asks.
 */
const NO_INPUTS_FOUND = 18003;

/**
 * The compiler options the repo's own `tsconfig.json` sets, which is where path aliases live. The
 * config is read the compiler's own way, so a config that extends another inherits its aliases.
 *
 * A repo with no `tsconfig.json` at its root still has a reference graph, just one with no aliases
 * in it, so a config that is not there at all is not an error. A config that is there and cannot be
 * read is one, whether the extractor found it at the root or was told to read it, because every
 * alias would quietly go missing and the document would read as if the repo held no such reference.
 * That covers a config that is not JSON, which reading it reports, and equally a config that is
 * JSON and extends a base the compiler cannot reach, which only parsing it reports: the aliases the
 * base held are absent from a config that parsed, which is the same alias-free document by a
 * quieter road. `allowJs` is forced on either way, because the extractor claims JavaScript files
 * and the resolver would not otherwise look for one.
 */
export const compilerOptions = (repo: string, tsconfig: string | undefined): ts.CompilerOptions => {
  const path = tsconfig === undefined ? `${repo}/tsconfig.json` : resolve(tsconfig);
  if (tsconfig === undefined && !ts.sys.fileExists(path))
    return { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const read = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
  if (read.error !== undefined || read.config === undefined)
    throw new ExtractionError(`${path} could not be read as a tsconfig`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(path, '..'));
  const failure = parsed.errors.find((error) => error.code !== NO_INPUTS_FOUND);
  if (failure !== undefined)
    throw new ExtractionError(
      `${path} could not be read as a tsconfig: ${ts.flattenDiagnosticMessageText(failure.messageText, ' ')}`,
    );
  return { ...parsed.options, allowJs: true };
};

/** A resolved file as the document names it, or nothing when it lies outside the repo. */
export const repoRelative = (repo: string, resolved: string): string | undefined => {
  const path = relative(repo, resolved).split('\\').join('/');
  return path === '' || path.startsWith('../') || isAbsolute(path) ? undefined : path;
};
