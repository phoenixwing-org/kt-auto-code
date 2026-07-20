import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import {
  formatSourceEncodingReport,
  sanitizeSourceForGbk,
  sanitizeSourcePreservingEncoding,
  scanInvalidGbkBytes,
  scanInvalidUtf8Bytes,
  scanNonAsciiBytes,
  scanSourceEncoding,
} from "./sourceEncodingScan";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const MULTI_CHAR_FIXTURE = resolve(
  REPO_ROOT,
  "tests/fixtures/multiChar/MultiCharSample.h",
);

describe("sourceEncodingScan", () => {
  it("MultiCharSample.h 第 20 行弯引号 0x94", () => {
    const buf = readFileSync(MULTI_CHAR_FIXTURE);
    const gbkIssues = scanInvalidGbkBytes(new Uint8Array(buf));
    const utf8Issues = scanInvalidUtf8Bytes(new Uint8Array(buf));

    expect(gbkIssues.length).toBeGreaterThanOrEqual(2);
    expect(gbkIssues.every((x) => x.byte === 0x94)).toBe(true);
    expect(gbkIssues[0].line).toBe(20);
    expect(gbkIssues[0].suggestedAscii).toBe('"');

    expect(utf8Issues.length).toBeGreaterThanOrEqual(2);
    expect(utf8Issues[0].line).toBe(20);

    const report = formatSourceEncodingReport(MULTI_CHAR_FIXTURE, scanSourceEncoding(new Uint8Array(buf)));
    expect(report).toContain("20");
    expect(report).toContain("0x94");
  });

  it("sanitize 将 0x94 映射为 ASCII 双引号", () => {
    const raw = Buffer.from("AddLocalUndo(GlobalUndo,\x94MyStep\x94);\n", "latin1");
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw));
    expect(Buffer.from(fixed).toString("latin1")).toBe('AddLocalUndo(GlobalUndo,"MyStep");\n');
    expect(scanInvalidGbkBytes(fixed)).toHaveLength(0);
    expect(scanInvalidUtf8Bytes(fixed)).toHaveLength(0);
  });

  it("合法 GBK 双字节中文：invalid_gbk 不报错，requireAscii 时报 non_ascii", () => {
    const raw = Buffer.from("// \xb2\xe2\xca\xd4\n", "binary"); // GBK「测试」
    expect(scanInvalidGbkBytes(new Uint8Array(raw))).toHaveLength(0);
    expect(scanNonAsciiBytes(new Uint8Array(raw))).toHaveLength(2);
    expect(
      scanSourceEncoding(new Uint8Array(raw), { requireAscii: true }).some((x) => x.kind === "non_ascii"),
    ).toBe(true);
  });

  it("日志上下文按文档实际编码显示 UTF-8 与 GBK，不输出 Latin-1 乱码", () => {
    const gbk = iconv.encode("// 检测到feature\n", "gbk");
    const gbkIssues = scanInvalidUtf8Bytes(gbk);
    expect(gbkIssues[0]?.context).toBe("// 检测到feature");
    expect(formatSourceEncodingReport("Cmd.cpp", gbkIssues)).not.toContain("¼ì³öµ½");

    const utf8 = new TextEncoder().encode("// 中文说明\n");
    const utf8Issues = scanNonAsciiBytes(utf8);
    expect(utf8Issues).toHaveLength(4);
    expect(utf8Issues.every((issue) => issue.context === "// 中文说明")).toBe(true);
  });

  it("GBK 可表示性使用真实 CP936 编码器，不把普通中文误报为不可编码", () => {
    const issues = scanSourceEncoding(new TextEncoder().encode("// 中文\n"));
    expect(issues.some((issue) => issue.kind === "not_encodable_gbk")).toBe(false);
  });

  it("清理 UTF-8 时保持中文与 UTF-8 编码，只映射全角标点", () => {
    const raw = new TextEncoder().encode("// 中文：说明\n");
    const fixed = sanitizeSourcePreservingEncoding(raw, { preserveGbk: true });
    expect(new TextDecoder("utf-8", { fatal: true }).decode(fixed)).toBe("// 中文:说明\n");

    const ascii = sanitizeSourcePreservingEncoding(raw, { preserveGbk: false });
    expect(new TextDecoder("utf-8", { fatal: true }).decode(ascii)).toBe("//   :  \n");
  });

  it("preserveGbk: false 时清除 GBK 中文", () => {
    const raw = Buffer.from("// \xb2\xe2\xca\xd4\n", "binary");
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("//   \n");
    expect(scanNonAsciiBytes(fixed)).toHaveLength(0);
  });

  it("0xA0 NBSP 在 Lighting 与 System 之间（非中文空格）", () => {
    const raw = Buffer.from(
      " * @copyright   Changzhou Xingyu Automotive Lighting\u00a0System Co., Ltd. 2024\n",
      "latin1",
    );
    const issues = scanInvalidGbkBytes(new Uint8Array(raw));
    expect(issues).toHaveLength(1);
    expect(issues[0].byte).toBe(0xa0);
    expect(issues[0].suggestedAscii).toBe(" ");
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toContain("Lighting System");
    expect(Buffer.from(fixed).toString("latin1")).not.toContain("\u00a0");
  });

  it("GBK 全角冒号 A3 BA → ASCII 冒号", () => {
    const raw = Buffer.from("// \xa3\xba comment\n", "binary");
    const issues = scanSourceEncoding(new Uint8Array(raw));
    expect(issues.some((x) => x.kind === "fullwidth_punct" && x.suggestedAscii === ":")).toBe(true);
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("// : comment\n");
  });

  it("UTF-8 全角冒号 EF BC 9A → ASCII 冒号", () => {
    const raw = Buffer.from("// \xef\xbc\x9a comment\n", "binary");
    const issues = scanSourceEncoding(new Uint8Array(raw));
    expect(issues.some((x) => x.kind === "fullwidth_punct" && x.suggestedAscii === ":")).toBe(true);
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("// : comment\n");
  });

  it("GBK 希腊字母 ε CE B5 → ASCII e", () => {
    const raw = Buffer.from("// tol \xce\xb5\n", "binary");
    const issues = scanSourceEncoding(new Uint8Array(raw));
    expect(issues.some((x) => x.kind === "fullwidth_punct" && x.suggestedAscii === "e")).toBe(true);
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("// tol e\n");
  });

  it("UTF-8 希腊字母 Ε CE 95 → ASCII E", () => {
    const raw = Buffer.from("// tol \xce\x95\n", "binary");
    const issues = scanSourceEncoding(new Uint8Array(raw));
    expect(issues.some((x) => x.kind === "fullwidth_punct" && x.suggestedAscii === "E")).toBe(true);
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("// tol E\n");
  });

  it("GBK 希腊字母 Ε CE D5 → ASCII E", () => {
    const raw = Buffer.from("// tol \xce\xd5\n", "binary");
    const issues = scanSourceEncoding(new Uint8Array(raw));
    expect(issues.some((x) => x.kind === "fullwidth_punct" && x.suggestedAscii === "E")).toBe(true);
    const fixed = sanitizeSourceForGbk(new Uint8Array(raw), { preserveGbk: false });
    expect(Buffer.from(fixed).toString("latin1")).toBe("// tol E\n");
  });
});
