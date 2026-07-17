import { basename, isAbsolute, relative } from "node:path";
import type { KtcCodegenApplyRegionChange } from "./sourceApply.js";

export const KTC_CODEGEN_APPLY_RECEIPT_KIND = "kt.codegen.apply-receipt" as const;
export const KTC_CODEGEN_APPLY_RECEIPT_SCHEMA_VERSION = 1 as const;
export const KTC_CODEGEN_APPLY_RECEIPT_DIRECTORY = ".phoenix/cache/codegen/apply-receipt-v1";

export interface KtcCodegenApplyReceiptFile {
  readonly path: string;
  readonly beforeFingerprint: string;
  readonly afterFingerprint: string;
  readonly encoding: "utf8" | "utf8-bom" | "gbk";
  readonly eol: "lf" | "crlf";
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly regionCount: number;
  readonly regions: readonly KtcCodegenApplyRegionChange[];
}

export interface KtcCodegenApplyReceipt {
  readonly kind: typeof KTC_CODEGEN_APPLY_RECEIPT_KIND;
  readonly schemaVersion: typeof KTC_CODEGEN_APPLY_RECEIPT_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly documentPath: string;
  readonly preflightCachePath: string;
  readonly preflightCreatedAt: string;
  readonly fileCount: number;
  readonly regionCount: number;
  readonly files: readonly KtcCodegenApplyReceiptFile[];
}

export interface KtcCreateCodegenApplyReceiptInput {
  readonly createdAt?: string;
  readonly documentPath: string;
  readonly preflightCachePath: string;
  readonly preflightCreatedAt: string;
  readonly files: readonly KtcCodegenApplyReceiptFile[];
}

/** 将绝对目标约束为工作区内、平台无关的回执相对路径。 */
export function ktcCodegenReceiptWorkspacePath(
  workspaceRoot: string,
  target: string,
): string | undefined {
  const candidate = relative(workspaceRoot, target);
  if (
    !candidate
    || candidate === ".."
    || candidate.startsWith("../")
    || candidate.startsWith("..\\")
    || isAbsolute(candidate)
  ) return undefined;
  return candidate.replaceAll("\\", "/");
}

/** 每份 JSON 复用对应 preflight 文件名，只保留最新一次 Apply 证据。 */
export function ktcCodegenApplyReceiptRelativePath(preflightCachePath: string): string {
  const name = basename(preflightCachePath);
  if (!/^[a-zA-Z0-9._-]+\.json$/.test(name)) {
    throw new Error("Preflight Cache 文件名不能安全映射为 Apply Receipt");
  }
  return `${KTC_CODEGEN_APPLY_RECEIPT_DIRECTORY}/${name}`;
}

function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function validRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")) return false;
  return !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function validRegion(value: unknown): value is KtcCodegenApplyRegionChange {
  if (!value || typeof value !== "object") return false;
  const region = value as Partial<KtcCodegenApplyRegionChange>;
  return typeof region.id === "string" && region.id.length > 0
    && typeof region.artifactId === "string" && region.artifactId.length > 0
    && typeof region.blockKey === "string" && region.blockKey.length > 0
    && typeof region.classId === "string"
    && typeof region.nameSuffix === "string"
    && Number.isInteger(region.line) && Number(region.line) >= 0;
}

function validReceiptFile(value: unknown): value is KtcCodegenApplyReceiptFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<KtcCodegenApplyReceiptFile>;
  return validRelativePath(file.path)
    && validFingerprint(file.beforeFingerprint)
    && validFingerprint(file.afterFingerprint)
    && file.beforeFingerprint !== file.afterFingerprint
    && (file.encoding === "utf8" || file.encoding === "utf8-bom" || file.encoding === "gbk")
    && (file.eol === "lf" || file.eol === "crlf")
    && Number.isInteger(file.beforeBytes) && Number(file.beforeBytes) >= 0
    && Number.isInteger(file.afterBytes) && Number(file.afterBytes) >= 0
    && Number.isInteger(file.regionCount) && Number(file.regionCount) > 0
    && Array.isArray(file.regions)
    && file.regions.length === file.regionCount
    && file.regions.every(validRegion);
}

export function ktcValidCodegenApplyReceipt(value: unknown): value is KtcCodegenApplyReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<KtcCodegenApplyReceipt>;
  return receipt.kind === KTC_CODEGEN_APPLY_RECEIPT_KIND
    && receipt.schemaVersion === KTC_CODEGEN_APPLY_RECEIPT_SCHEMA_VERSION
    && typeof receipt.createdAt === "string" && !Number.isNaN(Date.parse(receipt.createdAt))
    && validRelativePath(receipt.documentPath)
    && validRelativePath(receipt.preflightCachePath)
    && typeof receipt.preflightCreatedAt === "string" && !Number.isNaN(Date.parse(receipt.preflightCreatedAt))
    && Number.isInteger(receipt.fileCount) && Number(receipt.fileCount) > 0
    && Number.isInteger(receipt.regionCount) && Number(receipt.regionCount) > 0
    && Array.isArray(receipt.files)
    && receipt.files.length === receipt.fileCount
    && receipt.files.every(validReceiptFile)
    && receipt.files.reduce((total, file) => total + file.regionCount, 0) === receipt.regionCount
    && new Set(receipt.files.map((file) => file.path)).size === receipt.files.length;
}

export function ktcCreateCodegenApplyReceipt(
  input: KtcCreateCodegenApplyReceiptInput,
): KtcCodegenApplyReceipt {
  const receipt: KtcCodegenApplyReceipt = {
    kind: KTC_CODEGEN_APPLY_RECEIPT_KIND,
    schemaVersion: KTC_CODEGEN_APPLY_RECEIPT_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    documentPath: input.documentPath,
    preflightCachePath: input.preflightCachePath,
    preflightCreatedAt: input.preflightCreatedAt,
    fileCount: input.files.length,
    regionCount: input.files.reduce((total, file) => total + file.regionCount, 0),
    files: input.files.map((file) => ({ ...file, regions: file.regions.map((region) => ({ ...region })) })),
  };
  if (!ktcValidCodegenApplyReceipt(receipt)) {
    throw new Error("Apply Receipt 数据无效，拒绝生成验收缓存");
  }
  return receipt;
}

export function ktcSerializeCodegenApplyReceipt(receipt: KtcCodegenApplyReceipt): Uint8Array {
  if (!ktcValidCodegenApplyReceipt(receipt)) throw new Error("Apply Receipt 数据无效，拒绝写盘");
  return new TextEncoder().encode(`${JSON.stringify(receipt, null, 2)}\n`);
}
