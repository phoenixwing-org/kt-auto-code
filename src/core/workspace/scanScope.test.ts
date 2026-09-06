import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { collectScopedFiles, extensionsForByteScan } from "./scanScope.js";
import { loadDotIgnore } from "../dotIgnore.js";

describe("scanScope", () => {
  it("按范围收集并尊重 .phoenix/.ignore", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-scope-"));
    writeFileSync(join(root, "ok.h"), "int x;\n");
    writeFileSync(join(root, "main.cpp"), "int main(){}\n");
    mkdirSync(join(root, "vendor"));
    writeFileSync(join(root, "vendor", "skip.h"), "int s;\n");
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "vendor/\n");

    const files = collectScopedFiles({
      root,
      extensions: extensionsForByteScan({
        includeHeaders: true,
        includeSource: true,
        includeMarkdown: false,
      }),
      ignorePatterns: loadDotIgnore(root),
    });

    expect(files.map((p) => p.replace(/\\/g, "/").split("/").pop()).sort()).toEqual([
      "main.cpp",
      "ok.h",
    ]);
  });

  it("插件内置生成目录大小写无关且可显式关闭", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-scope-builtin-"));
    mkdirSync(join(root, "ImportedInterfaces"));
    writeFileSync(join(root, "ImportedInterfaces", "Generated.h"), "int generated;\n");
    const options = {
      root,
      extensions: extensionsForByteScan({ includeHeaders: true, includeSource: false, includeMarkdown: false }),
    };

    expect(collectScopedFiles(options)).toEqual([]);
    expect(collectScopedFiles({ ...options, useBuiltInIgnore: false })).toHaveLength(1);
  });

  it("普通点目录按显式规则扫描，安全边界始终排除且内置生成目录可关闭", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-scope-dot-directory-"));
    mkdirSync(join(root, ".github"));
    writeFileSync(join(root, ".github", "Workflow.h"), "int workflow;\n");
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "Safety.h"), "int safety;\n");
    mkdirSync(join(root, ".vs"));
    writeFileSync(join(root, ".vs", "Generated.h"), "int generated;\n");
    mkdirSync(join(root, ".custom-ignored"));
    writeFileSync(join(root, ".custom-ignored", "Ignored.h"), "int ignored;\n");
    const options = {
      root,
      extensions: extensionsForByteScan({ includeHeaders: true, includeSource: false, includeMarkdown: false }),
      ignorePatterns: [".custom-ignored/"],
    };

    expect(collectScopedFiles(options)
      .map((file) => file.slice(root.length + 1).replace(/\\/g, "/")))
      .toEqual([".github/Workflow.h"]);
    expect(collectScopedFiles({ ...options, useBuiltInIgnore: false })
      .map((file) => file.slice(root.length + 1).replace(/\\/g, "/")))
      .toEqual([".github/Workflow.h", ".vs/Generated.h"]);
  });
});
