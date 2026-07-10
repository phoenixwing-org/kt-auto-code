import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  convertToUtf8NoBom,
  detectFileBom,
} from "./fileBom.js";
import { scanWorkspace } from "./sourceEncodingWalk.js";

describe("fileBom", () => {
  it("识别 UTF-8 BOM", () => {
    const buf = new Uint8Array([0xef, 0xbb, 0xbf, 0x2f, 0x2a, 0x2a]);
    const bom = detectFileBom(buf);
    expect(bom.kind).toBe("utf8-bom");
    expect(bom.skipByteSanitize).toBe(false);
    const out = convertToUtf8NoBom(buf, bom);
    expect([...out!]).toEqual([0x2f, 0x2a, 0x2a]);
  });

  it("识别 UTF-16 LE 且跳过字节级修复", () => {
    const buf = Buffer.from("\uFEFF/**", "utf16le");
    const bom = detectFileBom(new Uint8Array(buf));
    expect(bom.kind).toBe("utf16-le");
    expect(bom.skipByteSanitize).toBe(true);
    const out = convertToUtf8NoBom(new Uint8Array(buf), bom);
    expect(Buffer.from(out!).toString("utf8")).toBe("/**");
  });

  it("UTF-16 未勾选 stripBom 时不写坏文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "kt-bom-"));
    const file = join(dir, "Wide.h");
    const original = Buffer.from("\uFEFF// test\n", "utf16le");
    writeFileSync(file, original);

    const results = scanWorkspace({
      root: dir,
      headersOnly: true,
      fix: true,
      stripBom: false,
      asciiOnly: true,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fixed).toBe(false);
    expect(readFileSync(file).equals(original)).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("UTF-16 stripBom 时转为 UTF-8 无 BOM", () => {
    const dir = mkdtempSync(join(tmpdir(), "kt-bom-"));
    const file = join(dir, "Wide.h");
    writeFileSync(file, Buffer.from("\uFEFF// test\n", "utf16le"));

    const results = scanWorkspace({
      root: dir,
      headersOnly: true,
      fix: true,
      stripBom: true,
      asciiOnly: false,
    });
    expect(results[0]?.fixed).toBe(true);
    const after = readFileSync(file);
    expect(detectFileBom(new Uint8Array(after)).kind).toBe("none");
    expect(after.toString("utf8")).toBe("// test\n");

    rmSync(dir, { recursive: true, force: true });
  });

  it("UTF-8 BOM only + stripBom 时去除 EF BB BF", () => {
    const dir = mkdtempSync(join(tmpdir(), "kt-utf8bom-"));
    const file = join(dir, "Bom.h");
    writeFileSync(file, Buffer.from([0xef, 0xbb, 0xbf, 0x2f, 0x2a, 0x2a, 0x0a]));

    const results = scanWorkspace({
      root: dir,
      headersOnly: true,
      fix: true,
      stripBom: true,
      asciiOnly: false,
    });
    expect(results).toHaveLength(1);
    expect(results[0].fixed).toBe(true);
    const after = new Uint8Array(readFileSync(file));
    expect(detectFileBom(after).kind).toBe("none");
    expect(after[0]).toBe(0x2f);

    rmSync(dir, { recursive: true, force: true });
  });

  it("UTF-8 BOM 未勾选 stripBom 时保留 BOM", () => {
    const dir = mkdtempSync(join(tmpdir(), "kt-utf8bom-"));
    const file = join(dir, "Bom.h");
    const original = Buffer.from([0xef, 0xbb, 0xbf, 0x2f, 0x2a, 0x2a, 0x0a]);
    writeFileSync(file, original);

    scanWorkspace({
      root: dir,
      headersOnly: true,
      fix: true,
      stripBom: false,
      asciiOnly: false,
    });
    expect(readFileSync(file).equals(original)).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});
