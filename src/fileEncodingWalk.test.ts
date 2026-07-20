import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  convertFileEncodings,
  scanFileEncodings,
} from "./fileEncodingWalk.js";
import { detectFileEncoding } from "./fileEncoding.js";
import iconv from "iconv-lite";

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

  it("工作集精确文件范围只预检 includePaths", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-enc-scope-"));
    try {
      writeFileSync(join(root, "selected.cpp"), Buffer.from("// \xb2\xe2\n", "binary"));
      writeFileSync(join(root, "outside.cpp"), Buffer.from("// \xb2\xe2\n", "binary"));
      const report = scanFileEncodings({ root, includePaths: ["selected.cpp"] });
      expect(report.scanned).toBe(1);
      expect(report.results.map((row) => row.row.relativePath)).toEqual(["selected.cpp"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("项目策略支持头文件 ASCII、源文件 UTF-8", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-enc-policy-"));
    try {
      writeFileSync(join(root, "Part.h"), Buffer.from("// 中文\n", "utf8"));
      writeFileSync(join(root, "Part.cpp"), iconv.encode("// 本地\n", "gbk"));
      const report = scanFileEncodings({
        root,
        targetPolicy: { defaultTarget: "gbk", headerTarget: "ascii", sourceTarget: "utf8" },
      });
      expect(report.results.map(({ row }) => ({
        file: row.relativePath,
        expected: row.expected,
        status: row.status,
        convertible: row.convertible,
      }))).toEqual([
        { file: "Part.cpp", expected: "utf8", status: "mismatch", convertible: true },
        { file: "Part.h", expected: "ascii", status: "unsupported", convertible: false },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("项目策略可将头文件和源文件统一转换为 GBK", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-enc-gbk-policy-"));
    try {
      writeFileSync(join(root, "Part.h"), Buffer.from("// 头文件\n", "utf8"));
      writeFileSync(join(root, "Part.cpp"), Buffer.from("// 源文件\n", "utf8"));
      const report = convertFileEncodings({
        root,
        convert: true,
        targetPolicy: { defaultTarget: "utf8", headerTarget: "gbk", sourceTarget: "gbk" },
      });
      expect(report.convertedFiles).toBe(2);
      expect(detectFileEncoding(readFileSync(join(root, "Part.h"))).detected).toBe("gbk");
      expect(detectFileEncoding(readFileSync(join(root, "Part.cpp"))).detected).toBe("gbk");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
