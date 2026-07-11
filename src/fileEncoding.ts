/**
 * 整文件编码检测与转换为 UTF-8 无 BOM。
 * 与 sourceEncodingScan 的字节级清理分工不同。
 */

import {
  bomKindLabel,
  convertToUtf8NoBom,
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

export type ExpectedEncoding = "utf8-no-bom";

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

/** 按扩展名的期望编码（初版，Phase D 可迁到配置） */
export const EXTENSION_EXPECTATIONS: Readonly<Record<string, EncodingExpectationRule>> = {
  ".md": { expected: "utf8-no-bom", highlight: true },
  ".mdx": { expected: "utf8-no-bom", highlight: true },
  ".json": { expected: "utf8-no-bom" },
  ".yaml": { expected: "utf8-no-bom" },
  ".yml": { expected: "utf8-no-bom" },
  ".cpp": { expected: "utf8-no-bom" },
  ".c": { expected: "utf8-no-bom" },
  ".cc": { expected: "utf8-no-bom" },
  ".cxx": { expected: "utf8-no-bom" },
  ".m": { expected: "utf8-no-bom" },
  ".mm": { expected: "utf8-no-bom" },
  ".h": { expected: "utf8-no-bom" },
  ".hh": { expected: "utf8-no-bom" },
  ".hpp": { expected: "utf8-no-bom" },
  ".hxx": { expected: "utf8-no-bom" },
  ".inl": { expected: "utf8-no-bom" },
  ".txt": { expected: "utf8-no-bom" },
  ".cmake": { expected: "utf8-no-bom" },
  ".catdlg": { expected: "utf8-no-bom" },
  ".catnls": { expected: "utf8-no-bom" },
  ".catrsc": { expected: "utf8-no-bom" },
};

export const ENCODING_FIX_EXTENSIONS = new Set(Object.keys(EXTENSION_EXPECTATIONS));

export function detectedEncodingLabel(detected: DetectedEncoding): string {
  return DETECTED_LABELS[detected];
}

export function expectedEncodingLabel(expected: ExpectedEncoding): string {
  if (expected === "utf8-no-bom") return "utf8";
  return expected;
}

function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
}

export function getExpectationForFile(filePath: string): EncodingExpectationRule {
  const ext = extensionOf(filePath);
  return EXTENSION_EXPECTATIONS[ext] ?? { expected: "utf8-no-bom" };
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
      confidence: "全部为 ASCII 字节（0x00–0x7F），符合 UTF-8 目标",
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
  if (expected !== "utf8-no-bom") return false;
  return detected === "ascii" || detected === "utf8";
}

function suggestedActionFor(detected: DetectedEncoding): {
  action: string;
  status: EncodingStatus;
  convertible: boolean;
  needsStrongConfirm: boolean;
} {
  switch (detected) {
    case "ascii":
    case "utf8":
      return { action: "—", status: "ok", convertible: false, needsStrongConfirm: false };
    case "utf8-bom":
      return {
        action: "去掉 BOM → UTF-8",
        status: "mismatch",
        convertible: true,
        needsStrongConfirm: false,
      };
    case "gbk":
      return {
        action: "GBK → UTF-8",
        status: "mismatch",
        convertible: true,
        needsStrongConfirm: false,
      };
    case "utf16-le":
    case "utf16-be":
      return {
        action: "UTF-16 → UTF-8",
        status: "mismatch",
        convertible: true,
        needsStrongConfirm: true,
      };
    case "utf32-le":
    case "utf32-be":
      return {
        action: "仅报告（UTF-32 暂不支持转换）",
        status: "unsupported",
        convertible: false,
        needsStrongConfirm: false,
      };
    case "unknown":
      return {
        action: "仅报告",
        status: "unsupported",
        convertible: false,
        needsStrongConfirm: false,
      };
    default:
      return { action: "仅报告", status: "unsupported", convertible: false, needsStrongConfirm: false };
  }
}

export function evaluateFileEncoding(
  filePath: string,
  relativePath: string,
  info: DetectedEncodingInfo,
  rule: EncodingExpectationRule = getExpectationForFile(filePath),
): EncodingFixRow {
  const { action, status, convertible, needsStrongConfirm } = suggestedActionFor(info.detected);
  const ok = isExpectedEncoding(info.detected, rule.expected);

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

/** 将文件转为 UTF-8 无 BOM；不支持的方向返回 undefined */
export function convertFileToUtf8NoBom(
  buf: Uint8Array,
  info: DetectedEncodingInfo,
): Uint8Array | undefined {
  switch (info.detected) {
    case "ascii":
    case "utf8":
      return buf;
    case "utf8-bom":
    case "utf16-le":
    case "utf16-be":
      return convertToUtf8NoBom(buf, info.bom);
    case "gbk": {
      const text = decodeGbk(buf);
      if (text === undefined) return undefined;
      return encodeUtf8(text);
    }
    default:
      return undefined;
  }
}

export function sortEncodingRows(rows: EncodingFixRow[]): EncodingFixRow[] {
  return [...rows].sort((a, b) => {
    const aMd = getExpectationForFile(a.filePath).highlight ? 0 : 1;
    const bMd = getExpectationForFile(b.filePath).highlight ? 0 : 1;
    if (aMd !== bMd) return aMd - bMd;
    if (a.status !== b.status) {
      const rank = (s: EncodingStatus) => (s === "mismatch" ? 0 : s === "unsupported" ? 1 : 2);
      return rank(a.status) - rank(b.status);
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
}
