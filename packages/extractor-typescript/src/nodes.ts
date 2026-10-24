import * as ts from 'typescript';

export type CallSite = ts.CallExpression | ts.NewExpression;

export const hasModifier = (node: ts.Node, modifier: ts.ModifierSyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(({ kind }) => kind === modifier);

export const isAbstractMember = (node: ts.Node): boolean =>
  (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
  hasModifier(node, ts.SyntaxKind.AbstractKeyword);

export const symbolOf = (checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
};

export const calleeNameOf = (callee: ts.Expression): ts.Node => {
  if (ts.isPropertyAccessExpression(callee)) return callee.name;
  return ts.isElementAccessExpression(callee) ? callee.argumentExpression : callee;
};
