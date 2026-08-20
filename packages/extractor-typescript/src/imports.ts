/**
 * Reading the module specifiers out of one source file.
 *
 * Only the specifier is read, never what a name means, so this pass needs no type checker and no
 * program: a file that does not compile still gives up its references. Every form the TypeScript
 * compiler resolves as a module reference is read, including a type-only import, which is as
 * static a reference as any other.
 */

import * as ts from 'typescript';

const literalOf = (node: ts.Node | undefined): string | undefined =>
  node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;

/** A `require('x')` call, which is how a JavaScript file that predates modules names one. */
const isRequireCall = (node: ts.CallExpression): boolean =>
  ts.isIdentifier(node.expression) && node.expression.text === 'require';

const specifierOf = (node: ts.Node): string | undefined => {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return literalOf(node.moduleSpecifier);
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return literalOf(node.moduleReference.expression);
  }
  if (ts.isCallExpression(node)) {
    const named =
      node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireCall(node)
        ? node.arguments[0]
        : undefined;
    return literalOf(named);
  }
  return undefined;
};

/**
 * Every module specifier the file names, in the order it names them. A dynamic import can sit
 * anywhere an expression can, so the whole tree is read and not only the statements at the top.
 */
export const moduleSpecifiers = (path: string, text: string): readonly string[] => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const specifiers: string[] = [];

  const read = (node: ts.Node): void => {
    const specifier = specifierOf(node);
    if (specifier !== undefined) specifiers.push(specifier);
    ts.forEachChild(node, read);
  };

  read(source);
  return specifiers;
};
