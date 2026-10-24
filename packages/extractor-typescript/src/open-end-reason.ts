import * as ts from 'typescript';
import type { OpenEndReason } from '@callmap/graph-document';
import { hasModifier, isAbstractMember, symbolOf } from './nodes.ts';
import type { CallSite } from './nodes.ts';

const innerOf = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression) ||
  ts.isNonNullExpression(expression) ||
  ts.isAsExpression(expression) ||
  ts.isSatisfiesExpression(expression) ||
  ts.isTypeAssertionExpression(expression)
    ? innerOf(expression.expression)
    : expression;

const calleeOf = (site: CallSite): ts.Expression => innerOf(site.expression);

const rootOf = (expression: ts.Expression): ts.Expression => {
  const inner = innerOf(expression);
  return ts.isPropertyAccessExpression(inner) ||
    ts.isElementAccessExpression(inner) ||
    ts.isCallExpression(inner) ||
    ts.isNewExpression(inner)
    ? rootOf(inner.expression)
    : inner;
};

const nameOf = (callee: ts.Expression): ts.Node => {
  if (ts.isPropertyAccessExpression(callee)) return callee.name;
  return ts.isElementAccessExpression(callee) ? callee.argumentExpression : callee;
};

const isLiteralKey = (key: ts.Expression): boolean =>
  ts.isStringLiteralLike(key) || ts.isNumericLiteral(key);

const isAny = (type: ts.Type): boolean => (type.flags & ts.TypeFlags.Any) !== 0;

const isDeclared = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.DeclareKeyword);

const isAmbient = (declaration: ts.Node): boolean =>
  declaration.getSourceFile().isDeclarationFile ||
  ts.findAncestor(declaration, isDeclared) !== undefined;

const isFunctionLike = (declaration: ts.Node): boolean =>
  ts.isMethodSignature(declaration) ||
  ts.isMethodDeclaration(declaration) ||
  ts.isFunctionDeclaration(declaration);

const hasNoImplementation = (declaration: ts.Node): boolean =>
  ts.isMethodSignature(declaration) || isAbstractMember(declaration) || isAmbient(declaration);

export const reasonOf = (checker: ts.TypeChecker): ((site: CallSite) => OpenEndReason) => {
  const isFromMissingModule = (callee: ts.Expression): boolean => {
    const root = rootOf(callee);
    const symbol = ts.isIdentifier(root) ? checker.getSymbolAtLocation(root) : undefined;
    if (symbol === undefined || (symbol.flags & ts.SymbolFlags.Alias) === 0) return false;
    return checker.getAliasedSymbol(symbol).declarations === undefined;
  };

  const isDynamicKey = (callee: ts.Expression): boolean =>
    ts.isElementAccessExpression(callee) &&
    !isLiteralKey(callee.argumentExpression) &&
    !isAny(checker.getTypeAtLocation(callee.expression));

  const isFunctionValue = (
    site: CallSite,
    type: ts.Type,
    declarations: readonly ts.Node[],
  ): boolean => {
    if (declarations.some(isFunctionLike)) return false;
    const defined = checker.getNonNullableType(type);
    const signaturesOf = (one: ts.Type): readonly ts.Signature[] =>
      ts.isNewExpression(site) ? one.getConstructSignatures() : one.getCallSignatures();
    const types = defined.isUnion() ? defined.types : [defined];
    return types.every((one) => signaturesOf(one).length > 0);
  };

  return (site) => {
    const callee = calleeOf(site);
    if (isFromMissingModule(callee)) return 'missing-module';
    if (isDynamicKey(callee)) return 'dynamic-key';
    const type = checker.getTypeAtLocation(callee);
    if (isAny(type)) return 'untyped';
    const declarations = symbolOf(checker, nameOf(callee))?.declarations ?? [];
    if (isFunctionValue(site, type, declarations)) return 'function-value';
    return declarations.some(hasNoImplementation) ? 'no-implementation' : 'other';
  };
};
