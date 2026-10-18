import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import type { Call, FunctionId, GraphDocument, GraphFunction } from '@archmap/graph-document';
import { compilerOptions } from './config.ts';
import type { ExtractOptions } from './config.ts';
import { sourceFilesInScope, TYPESCRIPT } from './walk.ts';

interface NamedFunction {
  readonly callable: ts.Node;
  readonly span: ts.Node;
  readonly name: string;
}

const hasBody = (node: ts.FunctionLikeDeclaration): boolean => node.body !== undefined;

const propertyName = (name: ts.PropertyName, file: ts.SourceFile): string =>
  ts.isComputedPropertyName(name) ? name.getText(file) : name.text;

const boundFunction = (
  initializer: ts.Expression | undefined,
): ts.ArrowFunction | ts.FunctionExpression | undefined =>
  initializer !== undefined &&
  (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ? initializer
    : undefined;

const namedFunctionOf = (node: ts.Node, file: ts.SourceFile): NamedFunction | undefined => {
  if (ts.isFunctionDeclaration(node) && hasBody(node)) {
    return { callable: node, span: node, name: node.name?.text ?? 'default' };
  }
  if (ts.isConstructorDeclaration(node) && hasBody(node)) {
    return { callable: node, span: node, name: 'constructor' };
  }
  if (ts.isMethodDeclaration(node) && hasBody(node) && ts.isClassLike(node.parent)) {
    return { callable: node, span: node, name: propertyName(node.name, file) };
  }
  if (ts.isGetAccessorDeclaration(node) && hasBody(node)) {
    return { callable: node, span: node, name: `get ${propertyName(node.name, file)}` };
  }
  if (ts.isSetAccessorDeclaration(node) && hasBody(node)) {
    return { callable: node, span: node, name: `set ${propertyName(node.name, file)}` };
  }
  const callable =
    ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)
      ? boundFunction(node.initializer)
      : undefined;
  if (callable === undefined) return undefined;
  if (ts.isPropertyDeclaration(node)) {
    return { callable, span: node, name: propertyName(node.name, file) };
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return { callable, span: node, name: node.name.text };
  }
  return undefined;
};

const classNameOf = (node: ts.ClassLikeDeclaration): string => {
  if (node.name !== undefined) return node.name.text;
  const { parent } = node;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? parent.name.text
    : 'default';
};

const lineOf = (file: ts.SourceFile, position: number): number =>
  file.getLineAndCharacterOfPosition(position).line + 1;

type CallSite = ts.CallExpression | ts.NewExpression;

const isCallSite = (node: ts.Node): node is CallSite =>
  ts.isCallExpression(node) || ts.isNewExpression(node);

const lineOfCallSite = (file: ts.SourceFile, site: CallSite): number =>
  lineOf(
    file,
    (ts.isPropertyAccessExpression(site.expression) ? site.expression.name : site).getStart(file),
  );

const sourceHashOf = (text: string): string => createHash('sha256').update(text).digest('hex');

export const extractGraphDocument = (options: ExtractOptions): GraphDocument => {
  const repo = resolve(options.repo);
  const scope = options.scope ?? [];
  const files = sourceFilesInScope(repo, scope);
  const program = ts.createProgram({
    rootNames: files.map((path) => `${repo}/${path}`),
    options: { ...compilerOptions(repo, options.tsconfig), noEmit: true },
  });
  const checker = program.getTypeChecker();

  const functions: GraphFunction[] = [];
  const idOfCallable = new Map<ts.Node, FunctionId>();
  const sites: { readonly caller: FunctionId; readonly site: CallSite; readonly line: number }[] =
    [];

  for (const path of files) {
    const file = program.getSourceFile(`${repo}/${path}`);
    if (file === undefined) continue;
    const seen = new Map<string, number>();

    const visit = (node: ts.Node, qualifier: readonly string[], holder?: FunctionId): void => {
      if (holder !== undefined && isCallSite(node)) {
        sites.push({ caller: holder, site: node, line: lineOfCallSite(file, node) });
      }
      const named = namedFunctionOf(node, file);
      if (named !== undefined) {
        const qualified = [...qualifier, named.name];
        const name = qualified.join('.');
        const count = (seen.get(name) ?? 0) + 1;
        seen.set(name, count);
        const id = count === 1 ? `${path}#${name}` : `${path}#${name}~${count}`;
        idOfCallable.set(named.callable, id);
        functions.push({
          id,
          name,
          file: path,
          firstLine: lineOf(file, named.span.getStart(file)),
          lastLine: lineOf(file, named.span.getEnd()),
          sourceHash: sourceHashOf(named.span.getText(file)),
        });
        ts.forEachChild(node, (child) => {
          visit(child, qualified, id);
        });
        return;
      }
      const inner = ts.isClassLike(node) ? [...qualifier, classNameOf(node)] : qualifier;
      ts.forEachChild(node, (child) => {
        visit(child, inner, holder);
      });
    };

    visit(file, []);
  }

  const calls: Call[] = sites.flatMap(({ caller, site, line }) => {
    const declaration = checker.getResolvedSignature(site)?.declaration;
    const callee = declaration === undefined ? undefined : idOfCallable.get(declaration);
    return callee === undefined ? [] : [{ caller, callee, line }];
  });

  return { language: TYPESCRIPT, scope, files, functions, calls, openEnds: [] };
};
