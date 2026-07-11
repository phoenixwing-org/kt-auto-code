/**
 * 扫描源文件中在 GBK（代码页 936）或 UTF-8 下无法正确表示的字节/字符。
 * 用于消除 MSVC C4819 等「当前代码页无法表示该字符」类告警。
 */

import {
  appendAsciiBytes,
  fullwidthLabel,
  mapCodePointToAscii,
  mapGbkPairToAscii,
  readUtf8MappedAscii,
} from "./fullwidthPunct.js";

export type SourceEncodingIssueKind =
  | "invalid_gbk"
  | "invalid_utf8"
  | "not_encodable_gbk"
  | "non_ascii"
  | "file_bom"
  | "fullwidth_punct";

export interface SourceEncodingIssue {
  /** 1-based 行号 */
  line: number;
  /** 1-based 列号（UTF-8 解码后的字符列；字节扫描时按字节偏移） */
  column: number;
  /** 文件内字节偏移（0-based） */
  offset: number;
  kind: SourceEncodingIssueKind;
  /** 原始字节值 0–255 */
  byte: number;
  /** 该行内容预览（不含换行） */
  context: string;
  /** 若已知，建议替换为的 ASCII 字符 */
  suggestedAscii?: string;
  /** 人类可读说明 */
  hint?: string;
}

export interface ScanSourceEncodingOptions {
  /** 检查 GBK/CP936 兼容性（默认 true，对应中文 Windows MSVC 无 /utf-8） */
  checkGbk?: boolean;
  /** 检查 UTF-8 合法性（默认 true） */
  checkUtf8?: boolean;
  /**
   * 要求纯 ASCII（头文件推荐）：额外报告合法 GBK 双字节中文等多字节内容。
   * 与 invalid_gbk 互补——后者报非法字节，本项报「合法但不应出现在头文件」的字节。
   */
  requireAscii?: boolean;
}

export interface SanitizeSourceOptions {
  /** 未知/不可映射字节替换为此字符，默认空格 */
  replacement?: string;
  /** 是否将 Windows-1252 弯引号等映射为 ASCII 标点（默认 true） */
  mapCp1252Punctuation?: boolean;
  /** 是否保留合法 GBK 双字节中文（默认 true）；false 时输出纯 ASCII */
  preserveGbk?: boolean;
}

/** Windows-1252 中 0x80–0x9F 区段 → ASCII 近似（MSVC CP936 常见误粘贴来源） */
const CP1252_TO_ASCII: Record<number, string> = {
  0x80: "EUR",
  0x82: ",",
  0x83: "f",
  0x84: ",,",
  0x85: "...",
  0x86: "+",
  0x87: "++",
  0x88: "^",
  0x89: "%",
  0x8a: "S",
  0x8b: "<",
  0x8c: "OE",
  0x8e: "Z",
  0x91: "'",
  0x92: "'",
  0x93: '"',
  0x94: '"',
  0x95: "*",
  0x96: "-",
  0x97: "-",
  0x98: "~",
  0x99: "(TM)",
  0x9a: "s",
  0x9b: ">",
  0x9c: "oe",
  0x9e: "z",
  0x9f: "Y",
};

function lineColumnAtOffset(buf: Uint8Array, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function lineContext(buf: Uint8Array, offset: number): string {
  let start = offset;
  while (start > 0 && buf[start - 1] !== 0x0a && buf[start - 1] !== 0x0d) start--;
  let end = offset;
  while (end < buf.length && buf[end] !== 0x0a && buf[end] !== 0x0d) end++;
  return new TextDecoder("latin1").decode(buf.subarray(start, end));
}

function isGbkTrail(b: number): boolean {
  return (b >= 0x40 && b <= 0x7e) || (b >= 0x80 && b <= 0xfe);
}

function isGbkLead(b: number): boolean {
  return b >= 0x81 && b <= 0xfe;
}

/** Windows-1252 专用区 0x80–0x9F（西欧弯引号、破折号等，非 GBK 中文）。 */
function isCp1252SpecialByte(b: number): boolean {
  return b >= 0x80 && b <= 0x9f;
}

/**
 * 在 ASCII 源文件中，0x80–0x9F 若后跟 ASCII 可打印字符，几乎总是 CP1252 标点误粘贴，
 * 而非 GBK 双字节中文（后者尾字节通常 ≥ 0x40 且多为 ≥ 0x80）。
 */
function shouldTreatAsCp1252(buf: Uint8Array, offset: number): boolean {
  const b = buf[offset];
  if (!isCp1252SpecialByte(b) || !CP1252_TO_ASCII[b]) return false;
  if (offset + 1 >= buf.length) return true;
  const next = buf[offset + 1];
  if (next <= 0x7f) return true;
  if (!isGbkTrail(next)) return true;
  return false;
}

function cp1252Hint(byte: number): string {
  return `字节 0x${byte.toString(16)} 为 Windows-1252 西欧标点（弯引号/破折号等），在 CP936 下会触发 MSVC C4819`;
}

const NBSP_HINT =
  "不换行空格 NBSP (0xA0)，常见于 Word/PDF 粘贴，外观像普通空格但非 ASCII";

/** 0xA0 在英文语境下多为 NBSP；若后跟 ASCII 则不能按 GBK 双字节与下一字符合并 */
function isNbspBeforeAscii(buf: Uint8Array, i: number): boolean {
  return buf[i] === 0xa0 && (i + 1 >= buf.length || buf[i + 1] <= 0x7f);
}

/** 按字节扫描：找出不能按 GBK 解码的字节位置。 */
export function scanInvalidGbkBytes(buf: Uint8Array): SourceEncodingIssue[] {
  const issues: SourceEncodingIssue[] = [];
  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if (shouldTreatAsCp1252(buf, i)) {
      const pos = lineColumnAtOffset(buf, i);
      issues.push({
        ...pos,
        offset: i,
        kind: "invalid_gbk",
        byte: b,
        context: lineContext(buf, i),
        suggestedAscii: CP1252_TO_ASCII[b],
        hint: cp1252Hint(b),
      });
      i++;
      continue;
    }
    if (isNbspBeforeAscii(buf, i)) {
      const pos = lineColumnAtOffset(buf, i);
      issues.push({
        ...pos,
        offset: i,
        kind: "invalid_gbk",
        byte: b,
        context: lineContext(buf, i),
        suggestedAscii: " ",
        hint: NBSP_HINT,
      });
      i++;
      continue;
    }
    if (isGbkLead(b)) {
      if (i + 1 >= buf.length || !isGbkTrail(buf[i + 1])) {
        const pos = lineColumnAtOffset(buf, i);
        issues.push({
          ...pos,
          offset: i,
          kind: "invalid_gbk",
          byte: b,
          context: lineContext(buf, i),
          suggestedAscii: CP1252_TO_ASCII[b],
          hint: CP1252_TO_ASCII[b]
            ? `孤立字节 0x${b.toString(16)}，常见于 Windows-1252 弯引号/破折号误粘贴`
            : `无效 GBK 首字节 0x${b.toString(16)}（后续不是合法双字节尾）`,
        });
        i++;
        continue;
      }
      i += 2;
      continue;
    }
    const pos = lineColumnAtOffset(buf, i);
    issues.push({
      ...pos,
      offset: i,
      kind: "invalid_gbk",
      byte: b,
      context: lineContext(buf, i),
      suggestedAscii: CP1252_TO_ASCII[b],
      hint: CP1252_TO_ASCII[b]
        ? `字节 0x${b.toString(16)} 在 CP936 中无对应字符（Windows-1252 标点）`
        : `字节 0x${b.toString(16)} 不是合法 GBK 序列`,
    });
    i++;
  }
  return issues;
}

const NON_ASCII_HINT =
  "头文件应仅含 ASCII；GBK 等多字节字符请移至 .cpp、文档或 NLS";

/**
 * 扫描合法多字节内容（如 GBK 中文双字节对），在 requireAscii 模式下视为问题。
 * 不重复报告 scanInvalidGbkBytes 已覆盖的偏移。
 */
export function scanNonAsciiBytes(buf: Uint8Array): SourceEncodingIssue[] {
  const invalidOffsets = new Set(scanInvalidGbkBytes(buf).map((x) => x.offset));
  const issues: SourceEncodingIssue[] = [];

  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if (invalidOffsets.has(i)) {
      i++;
      continue;
    }
    const utf8Mapped = readUtf8MappedAscii(buf, i);
    if (utf8Mapped) {
      const pos = lineColumnAtOffset(buf, i);
      issues.push({
        ...pos,
        offset: i,
        kind: "fullwidth_punct",
        byte: b,
        context: lineContext(buf, i),
        suggestedAscii: utf8Mapped.ascii,
        hint: `${fullwidthLabel(utf8Mapped.codePoint)}，建议改为 ASCII「${utf8Mapped.ascii}」`,
      });
      i += utf8Mapped.length;
      continue;
    }
    if (isGbkLead(b) && i + 1 < buf.length && isGbkTrail(buf[i + 1])) {
      const mapped = mapGbkPairToAscii(b, buf[i + 1]);
      if (mapped) {
        const pos = lineColumnAtOffset(buf, i);
        issues.push({
          ...pos,
          offset: i,
          kind: "fullwidth_punct",
          byte: b,
          context: lineContext(buf, i),
          suggestedAscii: mapped,
          hint: `GBK 全角标点，建议改为 ASCII「${mapped}」`,
        });
        i += 2;
        continue;
      }
      const pos = lineColumnAtOffset(buf, i);
      issues.push({
        ...pos,
        offset: i,
        kind: "non_ascii",
        byte: b,
        context: lineContext(buf, i),
        suggestedAscii: " ",
        hint: NON_ASCII_HINT,
      });
      i += 2;
      continue;
    }
    i++;
  }
  return issues;
}

/** 扫描非法 UTF-8 字节序列。 */
export function scanInvalidUtf8Bytes(buf: Uint8Array): SourceEncodingIssue[] {
  const issues: SourceEncodingIssue[] = [];
  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 >= buf.length || (buf[i + 1] & 0xc0) !== 0x80) {
        pushUtf8Issue(issues, buf, i, b, "截断的多字节 UTF-8");
        i++;
        continue;
      }
      i += 2;
      continue;
    }
    if (b >= 0xe0 && b <= 0xef) {
      if (
        i + 2 >= buf.length
        || (buf[i + 1] & 0xc0) !== 0x80
        || (buf[i + 2] & 0xc0) !== 0x80
      ) {
        pushUtf8Issue(issues, buf, i, b, "截断的 3 字节 UTF-8");
        i++;
        continue;
      }
      i += 3;
      continue;
    }
    if (b >= 0xf0 && b <= 0xf4) {
      if (
        i + 3 >= buf.length
        || (buf[i + 1] & 0xc0) !== 0x80
        || (buf[i + 2] & 0xc0) !== 0x80
        || (buf[i + 3] & 0xc0) !== 0x80
      ) {
        pushUtf8Issue(issues, buf, i, b, "截断的 4 字节 UTF-8");
        i++;
        continue;
      }
      i += 4;
      continue;
    }
    if ((b & 0xc0) === 0x80) {
      pushUtf8Issue(issues, buf, i, b, "孤立的 UTF-8 续字节");
      i++;
      continue;
    }
    pushUtf8Issue(issues, buf, i, b, "非法 UTF-8 首字节");
    i++;
  }
  return issues;
}

function pushUtf8Issue(
  issues: SourceEncodingIssue[],
  buf: Uint8Array,
  offset: number,
  byte: number,
  hint: string,
): void {
  const pos = lineColumnAtOffset(buf, offset);
  issues.push({
    ...pos,
    offset,
    kind: "invalid_utf8",
    byte,
    context: lineContext(buf, offset),
    suggestedAscii: CP1252_TO_ASCII[byte],
    hint,
  });
}

/** 合法 UTF-8 文本中，找出无法按 GBK 编码的 Unicode 字符。 */
export function scanNonGbkCodepoints(text: string, byteOffsets?: number[]): SourceEncodingIssue[] {
  const enc = new TextEncoder();
  const issues: SourceEncodingIssue[] = [];
  let line = 1;
  let lineStartChar = 0;
  let byteOffset = 0;

  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const chBytes = enc.encode(ch);

    if (text[i] === "\n") {
      line++;
      lineStartChar = i + 1;
    }

    if (cp > 0x7f) {
      const mapped = mapCodePointToAscii(cp);
      if (mapped) {
        const col = i - lineStartChar + 1;
        const ctxLine = text.slice(lineStartChar, text.indexOf("\n", lineStartChar) === -1 ? text.length : text.indexOf("\n", lineStartChar));
        issues.push({
          line,
          column: col,
          offset: byteOffsets?.[i] ?? byteOffset,
          kind: "fullwidth_punct",
          byte: chBytes[0] ?? 0,
          context: ctxLine,
          suggestedAscii: mapped,
          hint: `${fullwidthLabel(cp)}，建议改为 ASCII「${mapped}」`,
        });
      } else if (!canEncodeGbk(ch)) {
        const col = i - lineStartChar + 1;
        const ctxLine = text.slice(lineStartChar, text.indexOf("\n", lineStartChar) === -1 ? text.length : text.indexOf("\n", lineStartChar));
        issues.push({
          line,
          column: col,
          offset: byteOffsets?.[i] ?? byteOffset,
          kind: "not_encodable_gbk",
          byte: chBytes[0] ?? 0,
          context: ctxLine,
          hint: `Unicode U+${cp.toString(16).toUpperCase().padStart(4, "0")} 无法按 GBK 编码`,
        });
      }
    }

    byteOffset += chBytes.length;
    i += cp > 0xffff ? 2 : 1;
  }
  return issues;
}

function canEncodeGbk(text: string): boolean {
  try {
    const dec = new TextDecoder("gbk");
    const bytes = encodeGbk(text);
    return dec.decode(bytes) === text;
  } catch {
    return false;
  }
}

function encodeGbk(text: string): Uint8Array {
  const enc = new TextEncoder();
  try {
    const nodeUtil = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer;
    if (nodeUtil) {
      return new Uint8Array(nodeUtil.from(text, "gbk" as BufferEncoding));
    }
  } catch {
    /* fall through */
  }
  return enc.encode(text);
}

/** 扫描 GBK / UTF-8 全角标点（不论是否 requireAscii） */
export function scanFullwidthPunctuation(buf: Uint8Array): SourceEncodingIssue[] {
  const invalidOffsets = new Set(scanInvalidGbkBytes(buf).map((x) => x.offset));
  const issues: SourceEncodingIssue[] = [];

  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if (invalidOffsets.has(i)) {
      i++;
      continue;
    }
    const utf8Mapped = readUtf8MappedAscii(buf, i);
    if (utf8Mapped) {
      const pos = lineColumnAtOffset(buf, i);
      issues.push({
        ...pos,
        offset: i,
        kind: "fullwidth_punct",
        byte: b,
        context: lineContext(buf, i),
        suggestedAscii: utf8Mapped.ascii,
        hint: `${fullwidthLabel(utf8Mapped.codePoint)}，建议改为 ASCII「${utf8Mapped.ascii}」`,
      });
      i += utf8Mapped.length;
      continue;
    }
    if (isGbkLead(b) && i + 1 < buf.length && isGbkTrail(buf[i + 1])) {
      const mapped = mapGbkPairToAscii(b, buf[i + 1]);
      if (mapped) {
        const pos = lineColumnAtOffset(buf, i);
        issues.push({
          ...pos,
          offset: i,
          kind: "fullwidth_punct",
          byte: b,
          context: lineContext(buf, i),
          suggestedAscii: mapped,
          hint: `GBK 全角标点，建议改为 ASCII「${mapped}」`,
        });
      }
      i += 2;
      continue;
    }
    i++;
  }
  return issues;
}

/** 综合扫描：GBK 字节合法性 + UTF-8 合法性 +（UTF-8 成功时）码点 GBK 可编码性。 */
export function scanSourceEncoding(
  buf: Uint8Array,
  opts: ScanSourceEncodingOptions = {},
): SourceEncodingIssue[] {
  const checkGbk = opts.checkGbk ?? true;
  const checkUtf8 = opts.checkUtf8 ?? true;
  const issues: SourceEncodingIssue[] = [];

  if (checkGbk) issues.push(...scanInvalidGbkBytes(buf));
  if (checkUtf8) issues.push(...scanInvalidUtf8Bytes(buf));
  issues.push(...scanFullwidthPunctuation(buf));

  if (checkUtf8) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      if (checkGbk) issues.push(...scanNonGbkCodepoints(text));
    } catch {
      /* 已由 scanInvalidUtf8Bytes 报告 */
    }
  }

  if (opts.requireAscii) {
    issues.push(...scanNonAsciiBytes(buf));
  }

  return dedupeIssues(issues);
}

function dedupeIssues(issues: SourceEncodingIssue[]): SourceEncodingIssue[] {
  const seen = new Set<string>();
  const out: SourceEncodingIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.offset}:${issue.kind}:${issue.byte}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out.sort((a, b) => a.offset - b.offset || a.kind.localeCompare(b.kind));
}

/**
 * 将源字节流清理为 GBK 安全内容：映射 CP1252 标点，其余非法字节替换为 replacement。
 * 返回新字节（Latin-1 逐字节构建，适合以 GBK 或 ASCII 保存）。
 */
export function sanitizeSourceForGbk(
  buf: Uint8Array,
  opts: SanitizeSourceOptions = {},
): Uint8Array {
  const replacement = opts.replacement ?? " ";
  const mapCp1252 = opts.mapCp1252Punctuation ?? true;
  const preserveGbk = opts.preserveGbk ?? true;
  const repByte = replacement.codePointAt(0)! <= 0x7f ? replacement.codePointAt(0)! : 0x20;

  const parts: number[] = [];
  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      parts.push(b);
      i++;
      continue;
    }
    if (mapCp1252 && shouldTreatAsCp1252(buf, i)) {
      for (const ch of CP1252_TO_ASCII[b]) parts.push(ch.charCodeAt(0));
      i++;
      continue;
    }
    if (isNbspBeforeAscii(buf, i)) {
      parts.push(0x20);
      i++;
      continue;
    }
    const utf8Mapped = readUtf8MappedAscii(buf, i);
    if (utf8Mapped) {
      appendAsciiBytes(parts, utf8Mapped.ascii);
      i += utf8Mapped.length;
      continue;
    }
    if (isGbkLead(b) && i + 1 < buf.length && isGbkTrail(buf[i + 1])) {
      const mapped = mapGbkPairToAscii(b, buf[i + 1]);
      if (mapped) {
        appendAsciiBytes(parts, mapped);
        i += 2;
        continue;
      }
      if (preserveGbk) {
        parts.push(b, buf[i + 1]);
      } else {
        parts.push(repByte);
      }
      i += 2;
      continue;
    }
    if (mapCp1252 && CP1252_TO_ASCII[b]) {
      for (const ch of CP1252_TO_ASCII[b]) parts.push(ch.charCodeAt(0));
      i++;
      continue;
    }
    parts.push(repByte);
    i++;
  }
  return Uint8Array.from(parts);
}

/** 格式化扫描结果为可读文本（CLI / 日志） */
export function formatSourceEncodingReport(
  filePath: string,
  issues: SourceEncodingIssue[],
): string {
  if (issues.length === 0) return `${filePath}: OK（GBK/UTF-8 无问题字节）`;
  const lines = [`${filePath}: ${issues.length} 处问题`];
  for (const issue of issues) {
    const hex = `0x${issue.byte.toString(16).padStart(2, "0")}`;
    const sug = issue.suggestedAscii ? ` → 建议 '${issue.suggestedAscii}'` : "";
    lines.push(
      `  L${issue.line}:C${issue.column} offset=${issue.offset} ${issue.kind} byte=${hex}${sug}`,
    );
    if (issue.hint) lines.push(`    ${issue.hint}`);
    lines.push(`    ${issue.context.trimEnd()}`);
  }
  return lines.join("\n");
}
