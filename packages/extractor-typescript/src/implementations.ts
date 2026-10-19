import * as ts from 'typescript';
import type { FunctionId } from '@archmap/graph-document';
import { memberOf } from './resolution.ts';

export type MemberContainer = ts.ClassLikeDeclaration | ts.ObjectLiteralExpression;

export interface Member {
  readonly container: MemberContainer;
  readonly name: string;
  readonly id: FunctionId;
}

const isContract = (node: ts.Node): node is ts.ClassLikeDeclaration | ts.InterfaceDeclaration =>
  ts.isClassLike(node) || ts.isInterfaceDeclaration(node);

const heritageTypesOf = (
  checker: ts.TypeChecker,
  start: ts.ClassLikeDeclaration,
): readonly ts.Type[] => {
  const types: ts.Type[] = [];
  const seen = new Set<ts.Node>([start]);
  const pending: (ts.ClassLikeDeclaration | ts.InterfaceDeclaration)[] = [start];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const clause of next.heritageClauses ?? []) {
      for (const expression of clause.types) {
        const type = checker.getTypeAtLocation(expression);
        types.push(type);
        for (const declaration of type.getSymbol()?.declarations ?? []) {
          if (isContract(declaration) && !seen.has(declaration)) {
            seen.add(declaration);
            pending.push(declaration);
          }
        }
      }
    }
  }
  return types;
};

const contractsOf = (checker: ts.TypeChecker, container: MemberContainer): readonly ts.Type[] => {
  if (!ts.isObjectLiteralExpression(container)) return heritageTypesOf(checker, container);
  const contextual = checker.getContextualType(container);
  return contextual === undefined ? [] : [contextual];
};

export const implementationsOf = (
  checker: ts.TypeChecker,
  members: readonly Member[],
): ReadonlyMap<ts.Node, readonly FunctionId[]> => {
  const found = new Map<ts.Node, Set<FunctionId>>();
  for (const { container, name, id } of members) {
    for (const contract of contractsOf(checker, container)) {
      for (const declaration of checker.getPropertyOfType(contract, name)?.declarations ?? []) {
        const member = memberOf(declaration);
        if (member === undefined) continue;
        const known = found.get(member);
        if (known === undefined) found.set(member, new Set([id]));
        else known.add(id);
      }
    }
  }
  return new Map([...found].map(([member, ids]) => [member, [...ids]]));
};
