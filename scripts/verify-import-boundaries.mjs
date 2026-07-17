import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(root, "architecture-boundaries.json"), "utf8"));
const slash = (value) => value.split(path.sep).join("/");
const relative = (value) => slash(path.relative(root, value));
const exclusions = policy.exclude.map((pattern) => new RegExp(pattern, "u"));
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue"]);

function collectFiles(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const rel = relative(absolute);
    if (exclusions.some((pattern) => pattern.test(rel))) continue;
    if (entry.isDirectory()) collectFiles(absolute, result);
    else if (sourceExtensions.has(path.extname(entry.name))) result.push(absolute);
  }
  return result;
}

const files = [...new Set(policy.scanRoots.flatMap((item) => collectFiles(path.join(root, item))))]
  .sort((left, right) => left.localeCompare(right));
const fileSet = new Set(files);

function scriptText(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (!file.endsWith(".vue")) return raw;
  return [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1])
    .join("\n");
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(file), specifier);
  const withoutJs = base.replace(/\.(?:m?js|jsx)$/u, "");
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.vue`,
    `${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}.js`, `${withoutJs}.vue`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js"),
  ];
  return candidates.find((candidate) => fileSet.has(candidate) || fs.existsSync(candidate));
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function analyze(file) {
  const text = scriptText(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = [];
  const globals = [];
  const calls = [];
  const declarations = [];
  const addImport = (node, value) => imports.push({ value, line: lineOf(source, node) });
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      addImport(node, node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      addImport(node, node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
      if (name) calls.push({ value: name, line: lineOf(source, node) });
      if ((expression.kind === ts.SyntaxKind.ImportKeyword || name === "require")
        && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        addImport(node, node.arguments[0].text);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      declarations.push({ value: node.name.text, line: lineOf(source, node) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      declarations.push({ value: node.name.text, line: lineOf(source, node) });
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declarations.push({ value: node.name.text, line: lineOf(source, node) });
    }
    if (ts.isIdentifier(node)) {
      const propertyName = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      const declarationName = ts.isDeclaration(node.parent) && "name" in node.parent && node.parent.name === node;
      if (!propertyName && !declarationName) globals.push({ value: node.text, line: lineOf(source, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, globals, calls, declarations };
}

const analyses = new Map(files.map((file) => [file, analyze(file)]));
const failures = [];
const usedExceptions = new Set();

for (const [index, exception] of policy.exceptions.entries()) {
  for (const field of ["rule", "file", "target", "owner", "expires", "adr"]) {
    if (!exception[field]) failures.push(`exception[${index}] missing ${field}`);
  }
  if (exception.expires < policy.currentDate) failures.push(`expired exception: ${exception.file} ${exception.target}`);
  if (exception.adr && !fs.existsSync(path.join(root, exception.adr))) failures.push(`missing ADR: ${exception.adr}`);
}

function report(rule, file, target, line, detail) {
  const rel = relative(file);
  const index = policy.exceptions.findIndex((exception) =>
    exception.rule === rule && exception.file === rel && exception.target === target);
  if (index >= 0) {
    usedExceptions.add(index);
    return;
  }
  failures.push(`${rel}:${line} [${rule}] ${target}${detail ? ` (${detail})` : ""}`);
}

const forbiddenPureImports = policy.forbiddenPureImports.map((pattern) => new RegExp(pattern, "u"));
for (const entry of policy.pureEntrypoints) {
  const absoluteEntry = path.join(root, entry);
  if (!fileSet.has(absoluteEntry)) {
    failures.push(`missing pure entrypoint: ${entry}`);
    continue;
  }
  const pending = [{ file: absoluteEntry, chain: [entry] }];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current.file)) continue;
    visited.add(current.file);
    const analysis = analyses.get(current.file);
    if (!analysis) continue;
    for (const item of analysis.imports) {
      if (forbiddenPureImports.some((pattern) => pattern.test(item.value))) {
        report("pure-forbidden-import", current.file, item.value, item.line, current.chain.join(" -> "));
      }
      const resolved = resolveRelativeImport(current.file, item.value);
      if (resolved && analyses.has(resolved)) pending.push({ file: resolved, chain: [...current.chain, relative(resolved)] });
    }
    for (const item of analysis.globals) {
      if (policy.forbiddenPureGlobals.includes(item.value)) {
        report("pure-forbidden-global", current.file, item.value, item.line, current.chain.join(" -> "));
      }
    }
  }
}

const inRoots = (file, roots) => roots.some((item) => {
  const base = path.join(root, item);
  return file === base || file.startsWith(`${base}${path.sep}`);
});
const forbiddenViewImports = policy.forbiddenViewImports.map((pattern) => new RegExp(pattern, "u"));
for (const file of files.filter((item) => inRoots(item, policy.viewRoots))) {
  const analysis = analyses.get(file);
  for (const item of analysis.imports) {
    if (forbiddenViewImports.some((pattern) => pattern.test(item.value))) {
      report("view-forbidden-import", file, item.value, item.line, "View must use a host port");
    }
  }
  for (const item of analysis.calls) {
    if (policy.forbiddenViewCalls.includes(item.value)) {
      report("view-direct-write", file, item.value, item.line, "View must dispatch through a controller/host adapter");
    }
  }
}

for (const file of files.filter((item) => inRoots(item, policy.hostRoots))) {
  for (const item of analyses.get(file).declarations) {
    if (policy.hostForbiddenDeclarations.includes(item.value)) {
      report("host-forbidden-declaration", file, item.value, item.line, "shared algorithm belongs in Wing/core");
    }
  }
}

for (const [index, exception] of policy.exceptions.entries()) {
  if (!usedExceptions.has(index)) failures.push(`unused exception: ${exception.file} ${exception.target}`);
}

if (failures.length > 0) throw new Error(`Import boundary verification failed:\n${failures.join("\n")}`);
process.stdout.write(
  `[architecture] ${files.length} source files parsed; ${policy.pureEntrypoints.length} pure graphs and ${policy.viewRoots.length} view roots passed\n`,
);
