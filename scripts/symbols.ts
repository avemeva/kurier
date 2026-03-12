import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.argv[2] || '.';
const dirs = ['apps', 'packages'];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f === 'build' || f === '.git') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) files.push(p);
  }
  return files;
}

const files = dirs.flatMap((d) => walk(join(root, d)));
const program = ts.createProgram(files, {
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: true,
  skipLibCheck: true,
});

for (const sourceFile of program.getSourceFiles()) {
  const rel = relative(root, sourceFile.fileName);
  if (rel.includes('node_modules') || !dirs.some((d) => rel.startsWith(d))) continue;

  const symbols: string[] = [];
  ts.forEachChild(sourceFile, (node) => {
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExport) return;

    let kind = '';
    let name = '';
    if (ts.isTypeAliasDeclaration(node)) {
      kind = 'type';
      name = node.name.text;
    } else if (ts.isInterfaceDeclaration(node)) {
      kind = 'interface';
      name = node.name.text;
    } else if (ts.isClassDeclaration(node) && node.name) {
      kind = 'class';
      name = node.name.text;
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      kind = 'fn';
      name = node.name.text;
    } else if (ts.isVariableStatement(node)) {
      kind = 'const';
      const decls = node.declarationList.declarations;
      name = decls.map((d) => (d.name as ts.Identifier).text).join(', ');
    } else if (ts.isEnumDeclaration(node)) {
      kind = 'enum';
      name = node.name.text;
    }
    if (name) symbols.push(`${kind} ${name}`);
  });

  if (symbols.length > 0) {
    console.log(`\n${rel}`);
    for (const s of symbols) console.log(`  ${s}`);
  }
}
