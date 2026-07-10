import { describe, it, expect } from "vitest";
import {
  convertFileToUtf8NoBom,
  detectFileEncoding,
  evaluateFileEncoding,
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
});
