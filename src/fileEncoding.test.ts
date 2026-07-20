import { describe, it, expect } from "vitest";
import iconv from "iconv-lite";
import {
  convertFileToExpectedEncoding,
  convertFileToUtf8NoBom,
  detectFileEncoding,
  evaluateFileEncoding,
  getExpectationForFile,
} from "./fileEncoding.js";

describe("fileEncoding", () => {
  it("纯 ASCII 视为 ascii / ok", () => {
    const buf = new TextEncoder().encode("// hello\n");
    const info = detectFileEncoding(buf);
    expect(info.detected).toBe("ascii");
    const row = evaluateFileEncoding("a.h", "a.h", info);
    expect(row.status).toBe("ok");
  });

  it("UTF-8 无 BOM", () => {
    const buf = new TextEncoder().encode("// \u4e2d\u6587\n");
    const info = detectFileEncoding(buf);
    expect(info.detected).toBe("utf8");
    expect(evaluateFileEncoding("a.cpp", "a.cpp", info).status).toBe("ok");
  });

  it("UTF-8 BOM → mismatch，可去 BOM", () => {
    const buf = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x74, 0x0a]);
    const info = detectFileEncoding(buf);
    expect(info.detected).toBe("utf8-bom");
    const row = evaluateFileEncoding("readme.md", "readme.md", info);
    expect(row.status).toBe("mismatch");
    expect(row.convertible).toBe(true);
    const out = convertFileToUtf8NoBom(buf, info)!;
    expect(detectFileEncoding(out).detected).toBe("ascii");
  });

  it("GBK 中文 → mismatch，可转 UTF-8", () => {
    const buf = Buffer.from("// \xb2\xe2\xca\xd4\n", "binary");
    const info = detectFileEncoding(new Uint8Array(buf));
    expect(info.detected).toBe("gbk");
    const row = evaluateFileEncoding("legacy.cpp", "legacy.cpp", info);
    expect(row.status).toBe("mismatch");
    expect(row.suggestedAction).toContain("GBK");
    const out = convertFileToUtf8NoBom(new Uint8Array(buf), info)!;
    expect(new TextDecoder("utf-8").decode(out)).toBe("// 测试\n");
  });

  it("UTF-16 LE → 可转 UTF-8", () => {
    const buf = Buffer.from("\uFEFF// wide\n", "utf16le");
    const info = detectFileEncoding(new Uint8Array(buf));
    expect(info.detected).toBe("utf16-le");
    const row = evaluateFileEncoding("Wide.h", "Wide.h", info);
    expect(row.needsStrongConfirm).toBe(true);
    const out = convertFileToUtf8NoBom(new Uint8Array(buf), info)!;
    expect(new TextDecoder("utf-8").decode(out)).toBe("// wide\n");
  });

  it("按项目策略分别解析头文件、源文件和默认目标", () => {
    const policy = {
      defaultTarget: "gbk" as const,
      headerTarget: "ascii" as const,
      sourceTarget: "utf8" as const,
    };
    expect(getExpectationForFile("Part.h", policy).expected).toBe("ascii");
    expect(getExpectationForFile("Part.cpp", policy).expected).toBe("utf8");
    expect(getExpectationForFile("config.json", policy).expected).toBe("gbk");
  });

  it("UTF-8 中文可无损转换为 GBK", () => {
    const buf = new Uint8Array(Buffer.from("// 中文\r\n", "utf8"));
    const info = detectFileEncoding(buf);
    const row = evaluateFileEncoding("Part.cpp", "Part.cpp", info, { expected: "gbk" }, buf);
    expect(row).toMatchObject({ status: "mismatch", convertible: true, expected: "gbk" });
    const out = convertFileToExpectedEncoding(buf, info, "gbk")!;
    expect(detectFileEncoding(out).detected).toBe("gbk");
    expect(iconv.decode(Buffer.from(out), "gbk")).toBe("// 中文\r\n");
  });

  it("ASCII 目标不静默删除中文，但可安全去除纯 ASCII 文件的 BOM", () => {
    const chinese = new Uint8Array(Buffer.from("// 中文\n", "utf8"));
    const chineseInfo = detectFileEncoding(chinese);
    const blocked = evaluateFileEncoding("Part.h", "Part.h", chineseInfo, { expected: "ascii" }, chinese);
    expect(blocked).toMatchObject({ status: "unsupported", convertible: false });
    expect(blocked.suggestedAction).toContain("头文件修正");

    const bomAscii = new Uint8Array([0xef, 0xbb, 0xbf, 0x2f, 0x2f, 0x20, 0x6f, 0x6b, 0x0a]);
    const bomInfo = detectFileEncoding(bomAscii);
    const safe = evaluateFileEncoding("Safe.h", "Safe.h", bomInfo, { expected: "ascii" }, bomAscii);
    expect(safe).toMatchObject({ status: "mismatch", convertible: true });
    const out = convertFileToExpectedEncoding(bomAscii, bomInfo, "ascii")!;
    expect(Buffer.from(out).toString("ascii")).toBe("// ok\n");
  });

  it("GBK 无法表示的字符只报告", () => {
    const buf = new Uint8Array(Buffer.from("// 😀\n", "utf8"));
    const info = detectFileEncoding(buf);
    const row = evaluateFileEncoding("Part.cpp", "Part.cpp", info, { expected: "gbk" }, buf);
    expect(row).toMatchObject({ status: "unsupported", convertible: false });
    expect(convertFileToExpectedEncoding(buf, info, "gbk")).toBeUndefined();
  });
});
