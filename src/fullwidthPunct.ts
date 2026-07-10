/**
 * 全角 / 中文标点 → ASCII（常见于注释从 Word、IME 粘贴）
 */

/** Unicode 码点 → ASCII */
export const FULL_WIDTH_TO_ASCII: Readonly<Record<number, string>> = {
  0xff1a: ":", // ：
  0xff0c: ",", // ，
  0xff1b: ";", // ；
  0xff1f: "?", // ？
  0xff01: "!", // ！
  0xff08: "(", // （
  0xff09: ")", // ）
  0xff0e: ".", // ．
  0x3002: ".", // 。
  0xff0d: "-", // －
  0xff1d: "=", // ＝
  0xff05: "%", // ％
  0xff03: "#", // ＃
  0xff06: "&", // ＆
  0xff0b: "+", // ＋
  0xff1c: "<", // ＜
  0xff1e: ">", // ＞
  0xff20: "@", // ＠
  0xff3b: "[", // ［
  0xff3d: "]", // ］
  0xff5b: "{", // ｛
  0xff5d: "}", // ｝
  0xff02: '"', // ＂
  0xff07: "'", // ＇
  0xff0f: "/", // ／
  0xff3c: "\\", // ＼
  0xff5e: "~", // ～
  0x201c: '"', // "
  0x201d: '"', // "
  0x2018: "'", // '
  0x2019: "'", // '
  0x03b5: "e", // ε
  0x0395: "E", // Ε
};

/** GBK 双字节 (lead<<8|trail) → ASCII */
export const GBK_PAIR_TO_ASCII: Readonly<Record<number, string>> = {
  0xa3ba: ":", // ：
  0xa3ac: ",", // ，
  0xa3bb: ";", // ；
  0xa3bf: "?", // ？
  0xa3a1: "!", // ！
  0xa3a8: "(", // （
  0xa3a9: ")", // ）
  0xa3ae: ".", // ．
  0xa1a3: ".", // 。
  0xa3ad: "-", // －
  0xa3bd: "=", // ＝
  0xa3a5: "%", // ％
  0xa3a3: "#", // ＃
  0xa3a6: "&", // ＆
  0xa3ab: "+", // ＋
  0xa3bc: "<", // ＜
  0xa3be: ">", // ＞
  0xa3a0: "@", // ＠
  0xa3db: "[", // ［
  0xa3dd: "]", // ］
  0xa3a2: '"', // ＂
  0xa3a7: "'", // ＇
  0xa3af: "/", // ／
  0xa3dc: "\\", // ＼
  0xa3a4: "~", // ～
  0xceb5: "e", // ε
  0xced5: "E", // Ε
};

const FULL_WIDTH_LABEL: Readonly<Record<number, string>> = {
  0xff1a: "全角冒号 ：",
  0xff0c: "全角逗号 ，",
  0xff1b: "全角分号 ；",
  0xff1f: "全角问号 ？",
  0xff01: "全角叹号 ！",
  0xff08: "全角左括号 （",
  0xff09: "全角右括号 ）",
  0x03b5: "希腊字母 ε",
  0x0395: "希腊字母 Ε",
};

export function fullwidthLabel(cp: number): string {
  return FULL_WIDTH_LABEL[cp] ?? `全角标点 U+${cp.toString(16).toUpperCase()}`;
}

export function mapGbkPairToAscii(lead: number, trail: number): string | undefined {
  return GBK_PAIR_TO_ASCII[(lead << 8) | trail];
}

export function mapCodePointToAscii(cp: number): string | undefined {
  return FULL_WIDTH_TO_ASCII[cp];
}

/** 从 offset 起尝试匹配 UTF-8 全角标点 */
export function readUtf8MappedAscii(
  buf: Uint8Array,
  offset: number,
): { ascii: string; length: number; codePoint: number } | undefined {
  if (buf[offset] < 0xc2) return undefined;
  const len =
    buf[offset] >= 0xf0 ? 4
    : buf[offset] >= 0xe0 ? 3
    : buf[offset] >= 0xc2 ? 2
    : 0;
  if (len === 0 || offset + len > buf.length) return undefined;
  try {
    const slice = buf.subarray(offset, offset + len);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
    const cp = text.codePointAt(0)!;
    const ascii = mapCodePointToAscii(cp);
    if (!ascii) return undefined;
    return { ascii, length: len, codePoint: cp };
  } catch {
    return undefined;
  }
}

export function appendAsciiBytes(parts: number[], ascii: string): void {
  for (const ch of ascii) {
    const c = ch.charCodeAt(0);
    if (c <= 0x7f) parts.push(c);
  }
}
