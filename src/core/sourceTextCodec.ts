import { createHash } from "node:crypto";
import iconv from "iconv-lite";

const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

export interface KtcDecodedSourceText {
  readonly text: string;
  readonly encoding: "utf8" | "utf8-bom" | "gbk";
  readonly eol: "lf" | "crlf";
  readonly fingerprint: string;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasUtf8Bom(raw: Uint8Array): boolean {
  return raw.length >= 3 && UTF8_BOM.every((value, index) => raw[index] === value);
}

/** Decode a C/C++ source file without changing its original storage encoding. */
export function ktcDecodeSourceText(raw: Uint8Array): KtcDecodedSourceText | undefined {
  const bom = hasUtf8Bom(raw);
  let text: string | undefined;
  let encoding: KtcDecodedSourceText["encoding"] | undefined;
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

/** Encode transformed text with the exact storage encoding discovered during Preview. */
export function ktcEncodeSourceText(
  text: string,
  encoding: KtcDecodedSourceText["encoding"],
): Uint8Array {
  if (encoding === "gbk") {
    const output = iconv.encode(text, "gbk");
    if (iconv.decode(output, "gbk") !== text) throw new Error("内容无法无损写回原 GBK 编码");
    return output;
  }
  const output = Buffer.from(text, "utf8");
  return encoding === "utf8-bom"
    ? Buffer.concat([Buffer.from(UTF8_BOM), output])
    : output;
}
