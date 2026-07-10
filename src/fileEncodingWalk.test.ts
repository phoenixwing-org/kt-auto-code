import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  convertFileEncodings,
  scanFileEncodings,
} from "./fileEncodingWalk.js";
import { detectFileEncoding } from "./fileEncoding.js";

describe("fileEncodingWalk", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "kt-enc-"));
    writeFileSync(join(dir, "ok.md"), "# UTF-8\n", "utf8");
    writeFileSync(join(dir, "bom.md"), "\uFEFF# BOM\n", "utf8");
    writeFileSync(join(dir, "gbk.cpp"), Buffer.from("// \xb2\xe2\n", "binary"));
    writeFileSync(join(dir, "wide.h"), Buffer.from("\uFEFF// u16\n", "utf16le"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("预检仅列出不符合期望的文件", () => {
    const report = scanFileEncodings({ root: dir });
    expect(report.scanned).toBe(4);
    expect(report.issueFiles).toBe(3);
    expect(report.results.some((r) => r.row.relativePath === "ok.md")).toBe(false);
    expect(report.results[0]?.row.relativePath.endsWith(".md")).toBe(true);
  });

  it("转换 GBK / BOM / UTF-16", () => {
    const report = convertFileEncodings({ root: dir, convert: true });
    expect(report.convertedFiles).toBe(3);
    expect(detectFileEncoding(new Uint8Array(readFileSync(join(dir, "gbk.cpp")))).detected).toBe("utf8");
    expect(detectFileEncoding(new Uint8Array(readFileSync(join(dir, "bom.md")))).detected).toBe("ascii");
    expect(detectFileEncoding(new Uint8Array(readFileSync(join(dir, "wide.h")))).detected).toBe("ascii");
  });
});
