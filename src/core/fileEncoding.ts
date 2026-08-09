/**
 * 整文件编码检测与按项目策略转换。
 * 与 sourceEncodingScan 的字节级清理分工不同。
 */

import iconv from "iconv-lite";

import {
  bomKindLabel,
  detectFileBom,
  type FileBomInfo,
} from "./fileBom.js";

export type DetectedEncoding =
  | "ascii"
  | "gbk"
  | "utf8"
  | "utf8-bom"
  | "utf16-le"
  | "utf16-be"
  | "utf32-le"
  | "utf32-be"
  | "unknown";

export type EncodingStatus = "ok" | "mismatch" | "unsupported";

export type ExpectedEncoding = "ascii" | "utf8" | "gbk";

export interface EncodingTargetPolicy {
  defaultTarget: ExpectedEncoding;
  headerTarget?: ExpectedEncoding;
  sourceTarget?: ExpectedEncoding;
  markdownTarget?: ExpectedEncoding;
}

export interface DetectedEncodingInfo {
  detected: DetectedEncoding;
  bom: FileBomInfo;
  /** 检测说明（详细模式） */
  confidence: string;
  bomHex?: string;
}

export interface EncodingExpectationRule {
  expected: ExpectedEncoding;
  /** 是否优先在预检列表置顶（如 .md） */
  highlight?: boolean;
}

export interface EncodingFixRow {
  filePath: string;
  relativePath: string;
  detected: DetectedEncoding;
  expected: ExpectedEncoding;
  status: EncodingStatus;
  suggestedAction: string;
  confidence: string;
  bomHex?: string;
  convertible: boolean;
  needsStrongConfirm: boolean;
}

const DETECTED_LABELS: Record<DetectedEncoding, string> = {
  ascii: "ascii",
  gbk: "gbk",
  utf8: "utf8",
  "utf8-bom": "utf8-bom",
  "utf16-le": "utf16-le",
  "utf16-be": "utf16-be",
  "utf32-le": "utf32-le",
  "utf32-be": "utf32-be",
  unknown: "unknown",
};

/** 未传项目策略时保持原有 UTF-8 无 BOM 默认。 */
export const DEFAULT_ENCODING_TARGET_POLICY: Readonly<EncodingTargetPolicy> = {
  defaultTarget: "utf8",
};

/** 扫描扩展名与默认高亮信息；具体目标可由项目策略覆盖。 */
export const EXTENSION_EXPECTATIONS: Readonly<Record<string, EncodingExpectationRule>> = {
  ".md": { expected: "utf8", highlight: true },
  ".mdx": { expected: "utf8", highlight: true },
  ".json": { expected: "utf8" },
  ".yaml": { expected: "utf8" },
  ".yml": { expected: "utf8" },
  ".cpp": { expected: "utf8" },
  ".c": { expected: "utf8" },
  ".cc": { expected: "utf8" },
  ".cxx": { expected: "utf8" },
  ".m": { expected: "utf8" },
  ".mm": { expected: "utf8" },
  ".h": { expected: "utf8" },
  ".hh": { expected: "utf8" },
  ".hpp": { expected: "utf8" },
  ".hxx": { expected: "utf8" },
  ".inl": { expected: "utf8" },
  ".txt": { expected: "utf8" },
  ".cmake": { expected: "utf8" },
  ".catdlg": { expected: "utf8" },
  ".catnls": { expected: "utf8" },
  ".catrsc": { expected: "utf8" },
};

const HEADER_EXTENSIONS = new Set([".h", ".hh", ".hpp", ".hxx", ".inl"]);
const SOURCE_EXTENSIONS = new Set([".cpp", ".c", ".cc", ".cxx", ".m", ".mm"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

export const ENCODING_FIX_EXTENSIONS = new Set(Object.keys(EXTENSION_EXPECTATIONS));

export function detectedEncodingLabel(detected: DetectedEncoding): string {
  return DETECTED_LABELS[detected];
}

export function expectedEncodingLabel(expected: ExpectedEncoding): string {
  if (expected === "utf8") return "UTF-8";
  if (expected === "gbk") return "GBK";
  return "ASCII";
}

function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
}

export function getExpectationForFile(
  filePath: string,
  policy: EncodingTargetPolicy = DEFAULT_ENCODING_TARGET_POLICY,
): EncodingExpectationRule {
  const ext = extensionOf(filePath);
  const categoryTarget = HEADER_EXTENSIONS.has(ext)
    ? policy.headerTarget
    : SOURCE_EXTENSIONS.has(ext)
      ? policy.sourceTarget
      : MARKDOWN_EXTENSIONS.has(ext)
        ? policy.markdownTarget
        : undefined;
  return {
    expected: categoryTarget ?? policy.defaultTarget,
    highlight: EXTENSION_EXPECTATIONS[ext]?.highlight,
  };
}

export function encodingTargetPolicySummary(policy: EncodingTargetPolicy): string {
  const overrides = [
    policy.headerTarget ? `头文件 ${expectedEncodingLabel(policy.headerTarget)}` : "",
    policy.sourceTarget ? `源文件 ${expectedEncodingLabel(policy.sourceTarget)}` : "",
    policy.markdownTarget ? `Markdown ${expectedEncodingLabel(policy.markdownTarget)}` : "",
  ].filter(Boolean);
  const base = `默认 ${expectedEncodingLabel(policy.defaultTarget)}`;
  return overrides.length > 0 ? `${base}；${overrides.join("；")}` : base;
}

function bomHexPreview(buf: Uint8Array, bomLength: number): string | undefined {
  if (bomLength <= 0) return undefined;
  return [...buf.subarray(0, Math.min(bomLength, 8))]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

function isPureAscii(buf: Uint8Array): boolean {
  for (const b of buf) {
    if (b > 0x7f) return false;
  }
  return true;
}

function isGbkTrail(b: number): boolean {
  return (b >= 0x40 && b <= 0x7e) || (b >= 0x80 && b <= 0xfe);
}

function isGbkLead(b: number): boolean {
  return b >= 0x81 && b <= 0xfe;
}

/** 字节流是否可完整按 GBK 双字节规则解析 */
function isValidGbkByteStream(buf: Uint8Array): boolean {
  for (let i = 0; i < buf.length; ) {
    const b = buf[i];
    if (b <= 0x7f) {
      i++;
      continue;
    }
    if (!isGbkLead(b) || i + 1 >= buf.length || !isGbkTrail(buf[i + 1])) {
      return false;
    }
    i += 2;
  }
  return true;
}

function decodeGbk(buf: Uint8Array): string | undefined {
  if (!isValidGbkByteStream(buf)) return undefined;
  for (const label of ["gbk", "gb18030"] as const) {
    try {
      return new TextDecoder(label, { fatal: true }).decode(buf);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 检测文件整体编码（BOM → UTF-8 strict → GBK → unknown） */
export function detectFileEncoding(buf: Uint8Array): DetectedEncodingInfo {
  const bom = detectFileBom(buf);
  const bomHex = bomHexPreview(buf, bom.bomLength);

  if (bom.kind === "utf8-bom") {
    return {
      detected: "utf8-bom",
      bom,
      confidence: `文件头为 ${bomKindLabel(bom.kind)}`,
      bomHex,
    };
  }
  if (bom.kind === "utf16-le") {
    return {
      detected: "utf16-le",
      bom,
      confidence: `文件头为 ${bomKindLabel(bom.kind)}；不可做字节级 ASCII 清理`,
      bomHex,
    };
  }
  if (bom.kind === "utf16-be") {
    return {
      detected: "utf16-be",
      bom,
      confidence: `文件头为 ${bomKindLabel(bom.kind)}；不可做字节级 ASCII 清理`,
      bomHex,
    };
  }
  if (bom.kind === "utf32-le") {
    return {
      detected: "utf32-le",
      bom,
      confidence: `文件头为 ${bomKindLabel(bom.kind)}；仅报告，暂不支持自动转换`,
      bomHex,
    };
  }
  if (bom.kind === "utf32-be") {
    return {
      detected: "utf32-be",
      bom,
      confidence: `文件头为 ${bomKindLabel(bom.kind)}；仅报告，暂不支持自动转换`,
      bomHex,
    };
  }

  if (isPureAscii(buf)) {
    return {
      detected: "ascii",
      bom,
      confidence: "全部为 ASCII 字节（0x00–0x7F）",
    };
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return {
      detected: "utf8",
      bom,
      confidence: "无 BOM，且为合法 UTF-8 序列",
    };
  } catch {
    /* fall through */
  }

  if (decodeGbk(buf) !== undefined) {
    return {
      detected: "gbk",
      bom,
      confidence: "无 BOM，UTF-8 严格解码失败，字节流符合 GBK（CP936）",
    };
  }

  return {
    detected: "unknown",
    bom,
    confidence: "无 BOM，既非合法 UTF-8 也无法按 GBK 解析",
  };
}

function isExpectedEncoding(detected: DetectedEncoding, expected: ExpectedEncoding): boolean {
  if (expected === "ascii") return detected === "ascii";
  if (expected === "gbk") return detected === "ascii" || detected === "gbk";
  return detected === "ascii" || detected === "utf8";
}

function suggestedActionFor(
  detected: DetectedEncoding,
  expected: ExpectedEncoding,
  convertible: boolean,
): {
  action: string;
  status: EncodingStatus;
  needsStrongConfirm: boolean;
} {
  if (detected === "utf32-le" || detected === "utf32-be") {
    return { action: "仅报告（UTF-32 暂不支持转换）", status: "unsupported", needsStrongConfirm: false };
  }
  if (detected === "unknown") {
    return { action: "仅报告", status: "unsupported", needsStrongConfirm: false };
  }
  if (!convertible) {
    return {
      action: expected === "ascii"
        ? "需清理非 ASCII 内容（使用头文件修正）"
        : `含 ${expectedEncodingLabel(expected)} 无法表示的字符，仅报告`,
      status: "unsupported",
      needsStrongConfirm: false,
    };
  }
  const source = detected === "utf8-bom"
    ? "去掉 BOM"
    : detected.startsWith("utf16-")
      ? "UTF-16"
      : detected === "gbk"
        ? "GBK"
        : detected === "utf8"
          ? "UTF-8"
          : detected === "ascii"
            ? "ASCII"
            : detectedEncodingLabel(detected);
  return {
    action: `${source} → ${expectedEncodingLabel(expected)}`,
    status: "mismatch",
    needsStrongConfirm: detected === "utf16-le" || detected === "utf16-be",
  };
}

export function evaluateFileEncoding(
  filePath: string,
  relativePath: string,
  info: DetectedEncodingInfo,
  rule: EncodingExpectationRule = getExpectationForFile(filePath),
  buf?: Uint8Array,
): EncodingFixRow {
  const ok = isExpectedEncoding(info.detected, rule.expected);
  const convertible = !ok && info.detected !== "unknown"
    && info.detected !== "utf32-le"
    && info.detected !== "utf32-be"
    && (buf === undefined
      ? rule.expected === "utf8"
      : convertFileToExpectedEncoding(buf, info, rule.expected) !== undefined);
  const { action, status, needsStrongConfirm } = suggestedActionFor(
    info.detected,
    rule.expected,
    convertible,
  );

  return {
    filePath,
    relativePath,
    detected: info.detected,
    expected: rule.expected,
    status: ok ? "ok" : status,
    suggestedAction: ok ? "—" : action,
    confidence: info.confidence,
    bomHex: info.bomHex,
    convertible: ok ? false : convertible,
    needsStrongConfirm,
  };
}

function decodeDetectedText(buf: Uint8Array, info: DetectedEncodingInfo): string | undefined {
  try {
    switch (info.detected) {
      case "ascii":
      case "utf8":
        return new TextDecoder("utf-8", { fatal: true }).decode(buf);
      case "utf8-bom":
        return new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(info.bom.bomLength));
      case "gbk":
        return decodeGbk(buf);
      case "utf16-le":
        return new TextDecoder("utf-16le", { fatal: true }).decode(buf.subarray(info.bom.bomLength));
      case "utf16-be":
        return new TextDecoder("utf-16be", { fatal: true }).decode(buf.subarray(info.bom.bomLength));
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function encodeExpectedText(text: string, expected: ExpectedEncoding): Uint8Array | undefined {
  if (expected === "utf8") return encodeUtf8(text);
  if (expected === "ascii") {
    for (const char of text) {
      if (char.codePointAt(0)! > 0x7f) return undefined;
    }
    return encodeUtf8(text);
  }
  const output = iconv.encode(text, "gbk");
  return iconv.decode(output, "gbk") === text ? new Uint8Array(output) : undefined;
}

/** 将文件无损转换为目标编码；不支持或目标无法表示内容时返回 undefined。 */
export function convertFileToExpectedEncoding(
  buf: Uint8Array,
  info: DetectedEncodingInfo,
  expected: ExpectedEncoding,
): Uint8Array | undefined {
  if (isExpectedEncoding(info.detected, expected)) return buf;
  const text = decodeDetectedText(buf, info);
  return text === undefined ? undefined : encodeExpectedText(text, expected);
}

/** 兼容 CLI / 旧调用方：转为 UTF-8 无 BOM。 */
export function convertFileToUtf8NoBom(
  buf: Uint8Array,
  info: DetectedEncodingInfo,
): Uint8Array | undefined {
  return convertFileToExpectedEncoding(buf, info, "utf8");
}

export function sortEncodingRows(rows: EncodingFixRow[]): EncodingFixRow[] {
  return [...rows].sort((a, b) => {
    const aMd = EXTENSION_EXPECTATIONS[extensionOf(a.filePath)]?.highlight ? 0 : 1;
    const bMd = EXTENSION_EXPECTATIONS[extensionOf(b.filePath)]?.highlight ? 0 : 1;
    if (aMd !== bMd) return aMd - bMd;
    if (a.status !== b.status) {
      const rank = (s: EncodingStatus) => (s === "mismatch" ? 0 : s === "unsupported" ? 1 : 2);
      return rank(a.status) - rank(b.status);
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
}
