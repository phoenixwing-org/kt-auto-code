import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KTC_CODEGEN_GENERATOR_VERSION } from "./tools/codegen/preflightCache.js";
// @ts-expect-error Repository verification is intentionally implemented as plain ESM.
import { readCodegenGeneratorVersion, verifyCodegenGeneratorVersion, verifyCodegenGeneratorBundle } from "../scripts/verify-codegen-generator-version.mjs";

describe("local Wing Codegen rules version gate", () => {
  const source = readFileSync(new URL("./tools/codegen/preflightCache.ts", import.meta.url), "utf8");

  it("reads the owning Auto source and requires the actual public Wing export to agree", () => {
    const expected = readCodegenGeneratorVersion(source);
    expect(expected).toBe(KTC_CODEGEN_GENERATOR_VERSION);
    expect(verifyCodegenGeneratorVersion({ KT_CODEGEN_GENERATOR_VERSION: expected }, expected))
      .toEqual({ generatorVersion: "1.0.2", runtimeIdentity: "wing.codegen.rules:1.0.2" });
  });

  it.each([{}, { KT_CODEGEN_GENERATOR_VERSION: "0.3.3" }, { KT_CODEGEN_GENERATOR_VERSION: "1.0.0" }, { KT_CODEGEN_GENERATOR_VERSION: "1.0.1" }])("rejects missing or different runtime capability without a Registry fallback: %j", runtime => {
    expect(() => verifyCodegenGeneratorVersion(runtime, KTC_CODEGEN_GENERATOR_VERSION)).toThrow("生成规则版本不一致");
  });

  it.each(["", "// export const KTC_CODEGEN_GENERATOR_VERSION = \"1.0.0\";", "export const KTC_CODEGEN_GENERATOR_VERSION = runtime.version;", 'export const KTC_CODEGEN_GENERATOR_VERSION = "1.0.0", KTC_CODEGEN_GENERATOR_VERSION = "1.0.1";'])
    ("rejects absent, commented, dynamic or ambiguous consumer versions", invalid => {
      expect(() => readCodegenGeneratorVersion(invalid)).toThrow("唯一明确");
    });

  it("runs against newly built Wing before the extension build and preserves Registry manifests", () => {
    const launcher = readFileSync(new URL("../scripts/develop-local-wing.mjs", import.meta.url), "utf8");
    const verifier = readFileSync(new URL("../scripts/verify-local-wing-marker-runtime.mjs", import.meta.url), "utf8");
    expect(launcher.indexOf("verify-local-wing-marker-runtime.mjs")).toBeGreaterThan(launcher.indexOf('...filters, "run", "build"'));
    expect(launcher.indexOf("verify-local-wing-marker-runtime.mjs")).toBeLessThan(launcher.indexOf('run(pnpm, ["ext:build"]'));
    expect(verifier.indexOf("verifyCodegenGeneratorVersion(runtime")).toBeGreaterThan(verifier.indexOf("await import(runtimeUrl)"));
    expect(verifier).toContain('new URL("../src/tools/codegen/preflightCache.ts", import.meta.url)');
  });

  const bundle = `
    var KT_CODEGEN_GENERATOR_VERSION = "1.0.2";
    var KTC_CODEGEN_GENERATOR_VERSION = "1.0.2";
    function ktCodegenRenderLegacyStart(region) { return [region.start.text]; }
    function ktCodegenRenderLegacyEnd(region) { return [region.end.text]; }
    function ktCodegenRenderLegacyNotes() { return []; }
    function ktCodegenConstructorEndPrefix(context) {
      const text = context.snapshot.files[0].text;
      return text.includes("tail") ? (text.startsWith("\\t") ? "\\t" : "    ") : "";
    }
    function ktCodegenRenderCppParameterLines(region, items, formatDefaultValue, endPrefix) {
      if (region.blockKey === "PARAM CONSTRUCTOR") return ["fixture START", endPrefix + "// clang-format on", endPrefix + "// fixture END"];
      return [...ktCodegenRenderLegacyStart(region),
        "  // @app Kt Auto Code", "  // @codegen-rules-version " + KT_CODEGEN_GENERATOR_VERSION,
        ...ktCodegenRenderLegacyNotes(), "  int " + items[0].paramString + ";", ...ktCodegenRenderLegacyEnd(region)];
    }
    function ktCodegenDialogParamName(item) { return item.paramString.replaceAll("_", ""); }
    function ktCodegenRenderCaaUpdateDialogLines(context, region, items) {
      const prefix = region.start.linePrefix;
      const lines = [];
      for (const item of items) {
        lines.push("");
        if (!item.componentCount) { lines.push(prefix + "// " + item.id + "," + item.paramString + ",,NO ACTION,,0"); continue; }
        lines.push(prefix + "// " + item.id + "," + item.paramString + "," + item.notes);
        lines.push(prefix + (item.isParamDlg ? "dialogMore->" : "") + "_Combo" + ktCodegenDialogParamName(item)
          + (item.dataType === "int" ? "->SetSelect( parameter->" + item.paramString + ", 0);" : "->SetField( parameter->" + item.paramString + ");"));
      }
      return lines;
    }
    throw new Error("Extension activation must never run in the pure renderer gate");
  `;

  it("checks actual bundled declaration output without activating extension/Host code", () => {
    expect(verifyCodegenGeneratorBundle(bundle, KTC_CODEGEN_GENERATOR_VERSION))
      .toEqual({ generatorVersion: "1.0.2", declarationAnnotation: true, constructorBoundary: true, comboUpdateNotes: true });
    const artifactVerifier = readFileSync(new URL("../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(artifactVerifier).toContain("verifyCodegenGeneratorBundle(bundle, readCodegenGeneratorVersion");
  });

  it.each(["KT_CODEGEN_GENERATOR_VERSION", "KTC_CODEGEN_GENERATOR_VERSION"])("rejects an old bundled %s even if the annotation string looks new", name => {
    expect(() => verifyCodegenGeneratorBundle(bundle.replace(`${name} = "1.0.2"`, `${name} = "1.0.1"`), "1.0.2"))
      .toThrow(`rules version ${name}`);
  });

  it("rejects stale output even when the artifact contains a current annotation elsewhere", () => {
    const stale = bundle.replace('"  // @codegen-rules-version " + KT_CODEGEN_GENERATOR_VERSION', '"  // @version 5.0.0, (2024)"')
      + '\nvar unused = "@codegen-rules-version 1.0.2";';
    expect(() => verifyCodegenGeneratorBundle(stale, "1.0.2")).toThrow("PARAM DECLARATION must emit");
  });

  it("rejects absent or ambiguous executable renderer code", () => {
    expect(() => verifyCodegenGeneratorBundle(bundle.replace("function ktCodegenRenderCppParameterLines", "function obsoleteRenderer"), "1.0.2"))
      .toThrow("one executable ktCodegenRenderCppParameterLines");
    expect(() => verifyCodegenGeneratorBundle(bundle + "\nfunction ktCodegenRenderCppParameterLines() {}", "1.0.2"))
      .toThrow("one executable ktCodegenRenderCppParameterLines");
  });

  it("rejects old constructor indentation even when both version constants and declaration stamp are current", () => {
    const staleRenderer = bundle.replace('endPrefix + "// clang-format on"', '"// clang-format on"');
    expect(() => verifyCodegenGeneratorBundle(staleRenderer, "1.0.2")).toThrow("PARAM CONSTRUCTOR must align");
    const staleContext = bundle.replace('const text = context.snapshot.files[0].text;', 'const text = "";');
    expect(() => verifyCodegenGeneratorBundle(staleContext, "1.0.2")).toThrow("PARAM CONSTRUCTOR must align");
  });

  it("rejects missing or duplicated Combo notes even when rule stamps are current", () => {
    const note = 'lines.push(prefix + "// " + item.id + "," + item.paramString + "," + item.notes);';
    expect(() => verifyCodegenGeneratorBundle(bundle.replace(note, ""), "1.0.2")).toThrow("UPDATE DIALOG must emit");
    expect(() => verifyCodegenGeneratorBundle(bundle.replace(note, note + note), "1.0.2")).toThrow("UPDATE DIALOG must emit");
  });
});
