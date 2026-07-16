import { inflateRawSync } from "node:zlib";
import {
  pnwExtractXlinksFromDocumentXml,
  type PnwCadXlinkRef,
} from "@phoenix-wing/cad-core";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024;

export interface KtcTsFcstdAnalysis {
  readonly documentXmlBytes: number;
  readonly objectCount: number;
  readonly xlinks: readonly PnwCadXlinkRef[];
}

/** Lightweight FCStd reader: extracts only Document.xml from the ZIP container. */
export function analyzeFcstdBytes(bytes: Uint8Array): KtcTsFcstdAnalysis {
  const documentXml = readZipTextEntry(bytes, "Document.xml");
  const objectNames = new Set<string>();
  for (const match of documentXml.matchAll(/<Object\b[^>]*\bname\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const name = decodeXmlAttribute(match[2]).trim();
    if (name) objectNames.add(name);
  }
  return Object.freeze({
    documentXmlBytes: Buffer.byteLength(documentXml, "utf8"),
    objectCount: objectNames.size,
    xlinks: Object.freeze(pnwExtractXlinksFromDocumentXml(documentXml)),
  });
}

export function readZipTextEntry(bytes: Uint8Array, requestedName: string): string {
  const archive = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(archive, offset, 46, "ZIP central directory");
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("FCStd ZIP central directory is invalid");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    requireRange(archive, offset + 46, nameLength + extraLength + commentLength, "ZIP entry metadata");
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.toLocaleLowerCase("en-US") === requestedName.toLocaleLowerCase("en-US")) {
      if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) throw new Error("Document.xml 过大，已跳过 TS 轻量解析");
      requireRange(archive, localOffset, 30, "ZIP local header");
      if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error("FCStd ZIP local header is invalid");
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      requireRange(archive, dataOffset, compressedSize, "Document.xml compressed data");
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      const content = method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: MAX_DOCUMENT_XML_BYTES })
          : undefined;
      if (!content) throw new Error(`Document.xml 使用暂不支持的 ZIP 压缩方法 ${method}`);
      if (content.byteLength > MAX_DOCUMENT_XML_BYTES) throw new Error("Document.xml 过大，已跳过 TS 轻量解析");
      return content.toString("utf8");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("FCStd 中未找到 Document.xml");
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimum = Math.max(0, archive.length - MAX_EOCD_SEARCH);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("文件不是有效的 FCStd ZIP 容器");
}

function requireRange(archive: Buffer, offset: number, length: number, label: string): void {
  if (offset < 0 || length < 0 || offset + length > archive.length) throw new Error(`${label} 超出文件范围`);
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
