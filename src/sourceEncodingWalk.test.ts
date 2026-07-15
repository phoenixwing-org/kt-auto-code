import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import {
  collectSourceFiles,
  runWorkspaceEncodingScan,
  scanWorkspace,
} from "./sourceEncodingWalk";

describe("sourceEncodingWalk", () => {
  it("默认根目录仅收集头文件（--headers）", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-"));
    writeFileSync(join(root, "ok.h"), Buffer.from("int x;\n", "latin1"));
    writeFileSync(join(root, "skip.cpp"), Buffer.from("int main(){}\n", "latin1"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "bad.h"), Buffer.from("void f(\x94x\x94);\n", "latin1"));

    const headers = collectSourceFiles(root, { headersOnly: true });
    expect(headers.map((p) => p.replace(/\\/g, "/"))).toEqual([
      join(root, "nested", "bad.h").replace(/\\/g, "/"),
      join(root, "ok.h").replace(/\\/g, "/"),
    ]);

    const all = collectSourceFiles(root, { headersOnly: false });
    expect(all).toHaveLength(3);
  });

  it("根目录 --fix --headers 修复头文件", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-"));
    const badPath = join(root, "sample.h");
    writeFileSync(badPath, Buffer.from("void f(\x94x\x94);\n", "latin1"));

    const report = runWorkspaceEncodingScan({
      root,
      headersOnly: true,
      fix: true,
    });

    expect(report.scanned).toBe(1);
    expect(report.issueFiles).toBe(1);
    expect(report.fixedFiles).toBe(1);
    expect(readFileSync(badPath, "latin1")).toBe('void f("x");\n');

    const after = scanWorkspace({ root, headersOnly: true, fix: false });
    expect(after).toHaveLength(0);
  });

  it("工作集精确文件范围只扫描 includePaths", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-scope-"));
    writeFileSync(join(root, "selected.h"), Buffer.from("void f(\x94x\x94);\n", "latin1"));
    writeFileSync(join(root, "outside.h"), Buffer.from("void g(\x94y\x94);\n", "latin1"));

    const report = runWorkspaceEncodingScan({
      root,
      headersOnly: true,
      includePaths: ["selected.h"],
    });

    expect(report.scanned).toBe(1);
    expect(report.results.map((row) => row.filePath)).toEqual([join(root, "selected.h")]);
  });
});
