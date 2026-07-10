import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { collectScopedFiles, extensionsForByteScan } from "./scanScope.js";
import { loadDotIgnore } from "./dotIgnore.js";

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
});
