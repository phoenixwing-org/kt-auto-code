import { createHash } from "node:crypto";
import iconv from "iconv-lite";

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

export interface KtcDecodedCodegenSource {
  readonly text: string;
  readonly encoding: "utf8" | "utf8-bom" | "gbk";
  readonly eol: "lf" | "crlf";
  readonly fingerprint: string;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function hasUtf8Bom(raw: Uint8Array): boolean {
  return raw.length >= 3 && UTF8_BOM.every((value, index) => raw[index] === value);
}

/** JSON/CSV 与源码索引共用的严格 UTF-8(BOM)/GBK 解码和字节指纹。 */
export function ktcDecodeCodegenSource(raw: Uint8Array): KtcDecodedCodegenSource | undefined {
  const bom = hasUtf8Bom(raw);
  let text: string | undefined;
  let encoding: KtcDecodedCodegenSource["encoding"] | undefined;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bom ? raw.subarray(3) : raw);
    encoding = bom ? "utf8-bom" : "utf8";
  } catch {
    if (bom) return undefined;
  }
  if (text === undefined) {
    const decoded = iconv.decode(Buffer.from(raw), "gbk");
    if (!bytesEqual(iconv.encode(decoded, "gbk"), raw)) return undefined;
    text = decoded;
    encoding = "gbk";
  }
  if (!encoding) return undefined;
  return {
    text,
    encoding,
    eol: text.includes("\r\n") ? "crlf" : "lf",
    fingerprint: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
  };
}

/** 按扫描到的原编码写回；GBK 无法无损表示生成内容时拒绝 Apply。 */
export function ktcEncodeCodegenSource(
  text: string,
  encoding: KtcDecodedCodegenSource["encoding"],
): Uint8Array {
  if (encoding === "gbk") {
    const output = iconv.encode(text, "gbk");
    if (iconv.decode(output, "gbk") !== text) {
      throw new Error("生成内容无法无损写入原 GBK 编码");
    }
    return output;
  }
  const output = Buffer.from(text, "utf8");
  return encoding === "utf8-bom"
    ? Buffer.concat([Buffer.from(UTF8_BOM), output])
    : output;
}
