import { describe, expect, it } from "vitest";
import iconv from "iconv-lite";
import { ktcDecodeCodegenSource, ktcEncodeCodegenSource } from "./sourceCodec.js";

describe("Codegen source codec", () => {
  it("区分 UTF-8、BOM 与换行风格并保持字节指纹", () => {
    const utf8 = ktcDecodeCodegenSource(new TextEncoder().encode("中文\r\nline"));
    expect(utf8).toMatchObject({ text: "中文\r\nline", encoding: "utf8", eol: "crlf" });
    expect(utf8?.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);

    const bom = ktcDecodeCodegenSource(Uint8Array.from([
      0xef, 0xbb, 0xbf, ...new TextEncoder().encode("text\n"),
    ]));
    expect(bom).toMatchObject({ text: "text\n", encoding: "utf8-bom", eol: "lf" });
    expect(bom?.fingerprint).not.toBe(utf8?.fingerprint);
  });

  it("严格往返 GBK，拒绝不可恢复的残缺字节", () => {
    expect(ktcDecodeCodegenSource(iconv.encode("参数", "gbk")))
      .toMatchObject({ text: "参数", encoding: "gbk" });
    expect(ktcDecodeCodegenSource(Uint8Array.from([0x81]))).toBeUndefined();
  });

  it("按 UTF-8 BOM 与 GBK 原编码无损写回", () => {
    const bom = ktcEncodeCodegenSource("text\n", "utf8-bom");
    expect([...bom.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(ktcDecodeCodegenSource(bom)).toMatchObject({ text: "text\n", encoding: "utf8-bom" });

    const gbk = ktcEncodeCodegenSource("参数\r\n", "gbk");
    expect(ktcDecodeCodegenSource(gbk)).toMatchObject({ text: "参数\r\n", encoding: "gbk" });
  });
});
