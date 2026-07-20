import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
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

  it("保留多字节模式按文档编码分析，接受 CAA GBK 与 Qt UTF-8", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-mixed-encoding-"));
    writeFileSync(join(root, "CaaLocal.cpp"), iconv.encode("// 本地中文\nint caa;\n", "gbk"));
    writeFileSync(join(root, "QtUtf8.cpp"), Buffer.from("// UTF-8 中文\nint qt;\n", "utf8"));

    expect(scanWorkspace({ root, headersOnly: false, asciiOnly: false })).toHaveLength(0);
  });

  it("纯 ASCII 模式只报告实际多字节字符，GBK 日志上下文保持可读", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-local-report-"));
    writeFileSync(join(root, "CaaLocal.cpp"), iconv.encode("// 检测到feature\n", "gbk"));

    const results = scanWorkspace({ root, headersOnly: false, asciiOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.issues.every((issue) => issue.kind !== "invalid_utf8")).toBe(true);
    expect(results[0]?.issues[0]?.context).toBe("// 检测到feature");
  });

  it("修复 Qt UTF-8 全角标点时保持 UTF-8 中文和其他字节", () => {
    const root = mkdtempSync(join(tmpdir(), "phoenix-code-qt-utf8-fix-"));
    const path = join(root, "QtUtf8.cpp");
    writeFileSync(path, Buffer.from("// 中文：说明\nint qt;\n", "utf8"));

    const report = runWorkspaceEncodingScan({
      root,
      headersOnly: false,
      asciiOnly: false,
      fix: true,
    });
    expect(report.fixedFiles).toBe(1);
    expect(readFileSync(path, "utf8")).toBe("// 中文:说明\nint qt;\n");
    expect(scanWorkspace({ root, headersOnly: false, asciiOnly: false })).toHaveLength(0);
  });
});
