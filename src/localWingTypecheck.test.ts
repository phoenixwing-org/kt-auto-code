import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { createLocalWingTypecheckHost } from "../scripts/typecheck.mjs";

const fixtures: string[] = [];
afterEach(() => { for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(withDeclaration = true) {
  const root = mkdtempSync(join(tmpdir(), "ktc-local-types-"));
  fixtures.push(root);
  const packageRoot = join(root, "wing", "packages", "code-core");
  mkdirSync(join(packageRoot, "dist", "ui"), { recursive: true });
  writeFileSync(join(packageRoot, "dist", "ui", "index.js"), 'export const origin = "local";\n');
  if (withDeclaration) writeFileSync(join(packageRoot, "dist", "ui", "index.d.ts"), 'export declare const origin: "local";\n');
  const registry = join(root, "node_modules", "@phoenix-wing", "code-core");
  mkdirSync(join(registry, "ui"), { recursive: true });
  writeFileSync(join(registry, "package.json"), JSON.stringify({ name: "@phoenix-wing/code-core", exports: { "./ui": "./ui/index.d.ts" } }));
  writeFileSync(join(registry, "ui", "index.d.ts"), 'export declare const origin: "registry";\n');
  const source = join(root, "consumer.ts");
  writeFileSync(source, 'import { origin } from "@phoenix-wing/code-core/ui"; const onlyLocal: "local" = origin;\n');
  const packages = new Map([["@phoenix-wing/code-core", {
    packageRoot, manifest: { exports: { "./ui": { import: "./dist/ui/index.js", types: "./dist/ui/index.d.ts" } } },
  }]]);
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022, noEmit: true, strict: true, types: [],
  };
  return { root, source, packages, options };
}

describe("controlled local Wing typechecking", () => {
  it("uses the local public declarations instead of consumer Registry declarations", () => {
    const { source, packages, options } = fixture();
    const program = ts.createProgram([source], options, createLocalWingTypecheckHost(options, packages));
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
    expect(program.getSourceFiles().filter((file) => file.fileName.includes("@phoenix-wing")).map((file) => file.fileName)).toEqual([]);
    expect(program.getSourceFiles().some((file) => file.fileName.includes("wing/packages/code-core/dist/ui/index.d.ts"))).toBe(true);
  });

  it("does not silently fall back when a local declaration is missing", () => {
    const { source, packages, options } = fixture(false);
    expect(() => ts.createProgram([source], options, createLocalWingTypecheckHost(options, packages))).toThrow("不回退 Registry 类型");
  });

  it("accepts a real exported JSON fixture with resolveJsonModule", () => {
    const { root, source, packages, options } = fixture();
    const local = packages.get("@phoenix-wing/code-core")!;
    writeFileSync(join(local.packageRoot, "dist", "fixture.json"), '{"origin":"local-fixture"}');
    Object.assign(local.manifest.exports, { "./fixtures/value.json": "./dist/fixture.json" });
    writeFileSync(source, 'import value from "@phoenix-wing/code-core/fixtures/value.json"; const name: string = value.origin;\n');
    const jsonOptions = { ...options, resolveJsonModule: true, allowSyntheticDefaultImports: true };
    const program = ts.createProgram([source], jsonOptions, createLocalWingTypecheckHost(jsonOptions, packages));
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
    expect(program.getSourceFiles().some((file) => file.fileName === join(root, "wing/packages/code-core/dist/fixture.json"))).toBe(true);
  });

  it("keeps Registry mode unchanged and invokes local checks only through the wrapper", () => {
    const { source, options } = fixture();
    const registryProgram = ts.createProgram([source], options);
    expect(ts.getPreEmitDiagnostics(registryProgram).some((diagnostic) => diagnostic.code === 2322)).toBe(true);
    const launcher = readFileSync(new URL("../scripts/develop-local-wing.mjs", import.meta.url), "utf8");
    expect(launcher).toContain('run(pnpm, ["typecheck"], { env: localEnvironment })');
    const checker = readFileSync(new URL("../scripts/typecheck.mjs", import.meta.url), "utf8");
    expect(checker).toContain("localWingBuildContextFromEnvironment({ repoRoot })");
    expect(checker).not.toContain("writeFile");
  });
});
