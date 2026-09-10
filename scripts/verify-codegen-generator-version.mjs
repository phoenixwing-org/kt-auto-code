import ts from "typescript";
import { runInNewContext } from "node:vm";

/** Read the consumer's actual literal without executing Host code or pretending Registry has a new export. */
export function readCodegenGeneratorVersion(source) {
  const file = ts.createSourceFile("preflightCache.ts", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const declarations = file.statements.flatMap((statement) => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.filter((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === "KTC_CODEGEN_GENERATOR_VERSION") : []);
  const initializer = declarations.length === 1 ? declarations[0].initializer : undefined;
  if (!initializer || !ts.isStringLiteral(initializer) || !/^\d+\.\d+\.\d+$/.test(initializer.text)) {
    throw new Error("[local-wing] Auto Codegen 规则版本必须是唯一明确的 KTC_CODEGEN_GENERATOR_VERSION 字符串常量");
  }
  return initializer.text;
}

/** Inspect the freshly built public export. Never invoke generation or mutate source/cache files. */
export function verifyCodegenGeneratorVersion(runtime, expectedVersion, label = "本地 Wing Codegen dist") {
  const actual = runtime?.KT_CODEGEN_GENERATOR_VERSION;
  if (typeof actual !== "string" || actual !== expectedVersion) {
    throw new Error(`[local-wing] ${label} 生成规则版本不一致：Auto=${expectedVersion}；Wing=${typeof actual === "string" ? actual : "legacy/unversioned（未提供公开版本导出）"}；请同步源码并重新构建，未接受旧 runtime`);
  }
  return Object.freeze({ generatorVersion: actual, runtimeIdentity: `wing.codegen.rules:${actual}` });
}

/** Exercise only the bundled pure renderer, not the extension activation or Host/filesystem code. */
export function verifyCodegenGeneratorBundle(bundle, expectedVersion, label = "Code VSIX Codegen") {
  const file = ts.createSourceFile("extension.js", bundle, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) throw new Error(`${label} contains invalid JavaScript`);
  const names = ["ktCodegenRenderCppParameterLines", "ktCodegenRenderLegacyStart", "ktCodegenRenderLegacyEnd", "ktCodegenRenderLegacyNotes"];
  const functions = new Map(names.map(name => [name, []]));
  const versions = new Map(["KT_CODEGEN_GENERATOR_VERSION", "KTC_CODEGEN_GENERATOR_VERSION"].map(name => [name, []]));
  const inspect = node => {
    if (ts.isFunctionDeclaration(node) && node.name && functions.has(node.name.text)) {
      functions.get(node.name.text).push(node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && versions.has(node.name.text)) {
      versions.get(node.name.text).push(node.initializer);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(file);
  for (const [name, declarations] of versions) {
    if (declarations.length !== 1 || !declarations[0] || !ts.isStringLiteral(declarations[0])
        || declarations[0].text !== expectedVersion) {
      throw new Error(`${label} rules version ${name} must equal ${expectedVersion}; old/unversioned runtime is not accepted`);
    }
  }
  for (const [name, declarations] of functions) {
    if (declarations.length !== 1 || !declarations[0].body) {
      throw new Error(`${label} must include one executable ${name}`);
    }
  }
  const program = [
    `const KT_CODEGEN_GENERATOR_VERSION = ${JSON.stringify(expectedVersion)};`,
    ...names.map(name => functions.get(name)[0].getText(file)),
    `ktCodegenRenderCppParameterLines({ blockKey: "PARAM DECLARATION", start: { linePrefix: "  ", text: "fixture START" }, end: { text: "fixture END" } }, [{ name: "fixture", dataType: "int", paramString: "_fixture", id: 1, author: "", createDate: "", notes: "" }], () => "0").join("\\n");`,
  ].join("\n");
  let output;
  try {
    output = runInNewContext(program, Object.create(null), { timeout: 1000, filename: "codegen-rules-artifact.js" });
  } catch (error) {
    throw new Error(`${label} cannot execute the bundled declaration renderer: ${error.message}`);
  }
  if (typeof output !== "string"
      || !output.includes(`  // @app Kt Auto Code\n  // @codegen-rules-version ${expectedVersion}\n`)
      || /@version\b|\(2024\)/u.test(output)
      || !output.includes("  int _fixture;")) {
    throw new Error(`${label} PARAM DECLARATION must emit @app and @codegen-rules-version ${expectedVersion}, without the old @version/year`);
  }
  return Object.freeze({ generatorVersion: expectedVersion, declarationAnnotation: true });
}
