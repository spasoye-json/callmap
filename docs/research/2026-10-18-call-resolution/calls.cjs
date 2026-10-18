const ts = require('typescript');
const path = require('path');
const [, , tsconfig, ...globs] = process.argv;
const root = path.dirname(tsconfig);
const cfg = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const program = ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options });
const checker = program.getTypeChecker();
const inProject = (f) => f.startsWith(root) && !f.includes('node_modules') && !/\.(spec|test)\.tsx?$/.test(f) && !f.endsWith('.d.ts');
const counts = { internal: 0, interface: 0, external: 0, unresolved: 0 };
const samples = { unresolved: [], interface: [] };
let files = 0;
for (const sf of program.getSourceFiles()) {
  if (!inProject(sf.fileName)) continue;
  if (globs.length && !globs.some((g) => sf.fileName.includes(g))) continue;
  files++;
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      let decl;
      try { decl = checker.getResolvedSignature(node)?.declaration; } catch {}
      if (!decl || ts.isJSDocSignature?.(decl)) {
        let sym = checker.getSymbolAtLocation(node.expression.name ?? node.expression);
        if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
        decl = sym?.declarations?.[0];
      }
      const text = node.expression.getText(sf).slice(0, 60);
      const where = `${path.relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      if (!decl) { counts.unresolved++; samples.unresolved.push(`${where} ${text}`); }
      else {
        const df = decl.getSourceFile().fileName;
        if (!inProject(df)) counts.external++;
        else if (ts.isMethodSignature(decl) || ts.isPropertySignature(decl) || (decl.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)) { counts.interface++; samples.interface.push(`${where} ${text}`); }
        else counts.internal++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const project = counts.internal + counts.interface + counts.unresolved;
console.log(JSON.stringify({ files, ...counts, internalResolvedShare: (counts.internal / project).toFixed(3) }));
console.log('unresolved samples:', samples.unresolved.slice(0, 12));
console.log('interface samples:', samples.interface.slice(0, 6));
