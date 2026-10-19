import { relative, sep } from 'node:path';
import * as ts from 'typescript';
import type { FunctionId } from '@callmap/graph-document';

export type CallSite = ts.CallExpression | ts.NewExpression;

export type Resolution =
  | { readonly kind: 'call'; readonly callee: FunctionId }
  | { readonly kind: 'one-of'; readonly callees: readonly FunctionId[] }
  | { readonly kind: 'open-end' }
  | { readonly kind: 'outside' };

export interface ResolverInput {
  readonly repo: string;
  readonly claimed: ReadonlySet<string>;
  readonly checker: ts.TypeChecker;
  readonly idOfCallable: ReadonlyMap<ts.Node, FunctionId>;
  readonly implementations: ReadonlyMap<ts.Node, readonly FunctionId[]>;
}

const OUTSIDE: Resolution = { kind: 'outside' };
const OPEN_END: Resolution = { kind: 'open-end' };

const calleeNameOf = (expression: ts.Expression): ts.Node =>
  ts.isPropertyAccessExpression(expression) ? expression.name : expression;

const isAbstractMember = (node: ts.Node): boolean =>
  (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
  (ts.getModifiers(node) ?? []).some(({ kind }) => kind === ts.SyntaxKind.AbstractKeyword);

export const memberOf = (declaration: ts.Node): ts.Node | undefined => {
  if (ts.isMethodSignature(declaration) || ts.isPropertySignature(declaration)) return declaration;
  if (ts.isFunctionTypeNode(declaration) && ts.isPropertySignature(declaration.parent)) {
    return declaration.parent;
  }
  return isAbstractMember(declaration) ? declaration : undefined;
};

export const resolverOf = ({
  repo,
  claimed,
  checker,
  idOfCallable,
  implementations,
}: ResolverInput): ((site: CallSite) => Resolution) => {
  const symbolOf = (node: ts.Node): ts.Symbol | undefined => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  };

  const declarationOf = (site: CallSite): ts.Node | undefined => {
    const declaration = checker.getResolvedSignature(site)?.declaration;
    if (declaration !== undefined && !ts.isJSDocSignature(declaration)) return declaration;
    return symbolOf(calleeNameOf(site.expression))?.declarations?.[0];
  };

  const isClaimed = (node: ts.Node): boolean => {
    const path = relative(repo, node.getSourceFile().fileName).split(sep).join('/');
    return claimed.has(path);
  };

  const implementationOf = (declaration: ts.Node): FunctionId | undefined => {
    const direct = idOfCallable.get(declaration);
    if (direct !== undefined) return direct;
    const name = ts.getNameOfDeclaration(declaration as ts.Declaration);
    const overloads = name === undefined ? [] : (symbolOf(name)?.declarations ?? []);
    return overloads.map((overload) => idOfCallable.get(overload)).find((id) => id !== undefined);
  };

  return (site) => {
    const declaration = declarationOf(site);
    if (declaration === undefined) return OPEN_END;
    if (!isClaimed(declaration)) return OUTSIDE;
    const member = memberOf(declaration);
    if (member !== undefined) {
      const callees = implementations.get(member) ?? [];
      return callees.length === 0 ? OPEN_END : { kind: 'one-of', callees };
    }
    const callee = implementationOf(declaration);
    if (callee !== undefined) return { kind: 'call', callee };
    return ts.isClassLike(declaration) ? OUTSIDE : OPEN_END;
  };
};
