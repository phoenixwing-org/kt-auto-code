/**
 * 文件 BOM / 宽字节编码检测与转换为 UTF-8 无 BOM。
 * UTF-16 等不得走逐字节 ASCII 清理（会破坏 FF FE 等）。
 */

export type FileBomKind =
  | "none"
  | "utf8-bom"
  | "utf16-le"
  | "utf16-be"
  | "utf32-le"
  | "utf32-be";

export interface FileBomInfo {
  kind: FileBomKind;
  /** BOM 占用字节数（none 为 0） */
  bomLength: number;
  /** 不得对原始字节流做 sanitizeSourceForGbk */
  skipByteSanitize: boolean;
}

const BOM_LABELS: Record<Exclude<FileBomKind, "none">, string> = {
  "utf8-bom": "UTF-8 BOM (EF BB BF)",
  "utf16-le": "UTF-16 LE BOM (FF FE)",
  "utf16-be": "UTF-16 BE BOM (FE FF)",
  "utf32-le": "UTF-32 LE BOM",
  "utf32-be": "UTF-32 BE BOM",
};

export function bomKindLabel(kind: FileBomKind): string {
  if (kind === "none") return "无 BOM";
  return BOM_LABELS[kind];
}

/** 检测文件头 BOM */
export function detectFileBom(buf: Uint8Array): FileBomInfo {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { kind: "utf8-bom", bomLength: 3, skipByteSanitize: false };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    if (buf.length >= 4 && buf[2] === 0 && buf[3] === 0) {
      return { kind: "utf32-le", bomLength: 4, skipByteSanitize: true };
    }
    return { kind: "utf16-le", bomLength: 2, skipByteSanitize: true };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    if (buf.length >= 4 && buf[2] === 0 && buf[3] === 0) {
      return { kind: "utf32-be", bomLength: 4, skipByteSanitize: true };
    }
    return { kind: "utf16-be", bomLength: 2, skipByteSanitize: true };
  }
  return { kind: "none", bomLength: 0, skipByteSanitize: false };
}

export function bomFixTargetLabel(kind: FileBomKind): string {
  if (kind === "none") return "";
  if (kind === "utf8-bom") return "UTF-8 无 BOM";
  return "UTF-8 无 BOM（自宽字节解码）";
}

/** 转为 UTF-8 无 BOM；失败返回 undefined */
export function convertToUtf8NoBom(buf: Uint8Array, bom: FileBomInfo): Uint8Array | undefined {
  try {
    switch (bom.kind) {
      case "none":
        return buf;
      case "utf8-bom":
        return buf.subarray(bom.bomLength);
      case "utf16-le": {
        const text = new TextDecoder("utf-16le").decode(buf);
        return new TextEncoder().encode(text);
      }
      case "utf16-be": {
        const text = new TextDecoder("utf-16be").decode(buf);
        return new TextEncoder().encode(text);
      }
      case "utf32-le":
      case "utf32-be":
        // Node 无 utf-32 TextDecoder，手动跳过 BOM 后按 LE/BE 读（少见，尽力而为）
        return undefined;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

export function createBomScanIssue(bom: FileBomInfo): {
  line: number;
  column: number;
  offset: number;
  kind: "file_bom";
  byte: number;
  context: string;
  suggestedAscii?: string;
  hint?: string;
  bomKind: FileBomKind;
} {
  const label = bomKindLabel(bom.kind);
  const target = bomFixTargetLabel(bom.kind);
  return {
    line: 1,
    column: 1,
    offset: 0,
    kind: "file_bom",
    byte: bom.bomLength > 0 ? (bom.kind === "utf8-bom" ? 0xef : 0xff) : 0,
    context: `文件含 ${label}`,
    suggestedAscii: target,
    hint: bom.skipByteSanitize
      ? "宽字节编码文件不可做字节级 ASCII 清理；请勾选「去除 BOM / 转为 UTF-8 无 BOM」"
      : "可勾选「去除 UTF-8 BOM」转为 UTF-8 无 BOM",
    bomKind: bom.kind,
  };
}
