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
  const names = ["ktCodegenRenderCppParameterLines", "ktCodegenConstructorEndPrefix", "ktCodegenRenderLegacyStart", "ktCodegenRenderLegacyEnd", "ktCodegenRenderLegacyNotes", "ktCodegenRenderCaaUpdateDialogLines", "ktCodegenDialogParamName"];
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
    `const region = { blockKey: "PARAM DECLARATION", path: "fixture.cpp", sourceFingerprint: "fixture", replaceEndOffset: 0, start: { linePrefix: "  ", text: "fixture START" }, end: { linePrefix: "", text: "fixture END" } };`,
    `const items = [{ name: "fixture", dataType: "int", paramString: "_fixture", id: 1, author: "", createDate: "", notes: "" }];`,
    `const declaration = ktCodegenRenderCppParameterLines(region, items, () => "0").join("\\n");`,
    `const constructors = ["    , tail(0) {}", "\\n// explanation\\n{\\n}", "\\t/* note */ , tail(0) {}"].map(text => {`,
    `  const constructor = { ...region, blockKey: "PARAM CONSTRUCTOR" };`,
    `  const context = { snapshot: { files: [{ path: "fixture.cpp", fingerprint: "fixture", text }] } };`,
    `  const prefix = ktCodegenConstructorEndPrefix(context, constructor);`,
    `  return ktCodegenRenderCppParameterLines(constructor, items, () => "0", prefix).join("\\n");`,
    `});`,
    `const combos = ["int", "double", "CATUnicodeString"].flatMap(dataType => [false, true].map(isParamDlg => {`,
    `  const comboItems = [{ id: 5, paramString: "FinishCalc", notes: "", component: "", componentCount: 0 },`,
    `    { id: 42, paramString: "My_Type", notes: "fixture combo notes", component: "ComboBox", componentCount: 1, dataType, isParamDlg }];`,
    `  return ktCodegenRenderCaaUpdateDialogLines({}, { ...region, blockKey: "UPDATE DIALOG" }, comboItems, () => false).join("\\n");`,
    `}));`,
    `({ declaration, constructors, combos });`,
  ].join("\n");
  let output;
  try {
    output = runInNewContext(program, Object.create(null), { timeout: 1000, filename: "codegen-rules-artifact.js" });
  } catch (error) {
    throw new Error(`${label} cannot execute the bundled rules renderers: ${error.message}`);
  }
  if (typeof output?.declaration !== "string"
      || !output.declaration.includes(`  // @app Kt Auto Code\n  // @codegen-rules-version ${expectedVersion}\n`)
      || /@version\b|\(2024\)/u.test(output.declaration)
      || !output.declaration.includes("  int _fixture;")) {
    throw new Error(`${label} PARAM DECLARATION must emit @app and @codegen-rules-version ${expectedVersion}, without the old @version/year`);
  }
  const prefixes = ["    ", "", "\t"];
  if (!Array.isArray(output.constructors) || output.constructors.length !== prefixes.length
      || output.constructors.some((text, index) => typeof text !== "string"
        || !text.endsWith(`\n${prefixes[index]}// clang-format on\n${prefixes[index]}// fixture END`))) {
    throw new Error(`${label} PARAM CONSTRUCTOR must align clang-format/END with the next semantic source line`);
  }
  const comboNote = "  // 42,My_Type,fixture combo notes";
  if (!Array.isArray(output.combos) || output.combos.length !== 6
      || output.combos.some((text, index) => {
        const assignment = `  ${index % 2 ? "dialogMore->" : ""}_ComboMyType->${index < 2 ? "SetSelect( parameter->My_Type, 0);" : "SetField( parameter->My_Type);"}`;
        return typeof text !== "string" || text.split(comboNote).length !== 2
          || !text.includes(`  // 5,FinishCalc,,NO ACTION,,0\n\n${comboNote}\n${assignment}`);
      })) {
    throw new Error(`${label} UPDATE DIALOG must emit each supported Combo's own notes once before the unchanged assignment`);
  }
  return Object.freeze({ generatorVersion: expectedVersion, declarationAnnotation: true, constructorBoundary: true, comboUpdateNotes: true });
}
