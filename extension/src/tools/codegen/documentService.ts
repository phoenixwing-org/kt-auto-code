import type * as vscode from "vscode";
import { createHash } from "node:crypto";
import {
  KtCodegenController,
  ktCodegenParamsEqual,
  type KtCodegenDiagnostic,
} from "@phoenix-wing/kt-codegen";
import { ktcDecodeCodegenSource } from "./sourceCodec.js";

export interface KtcCodegenFileSystem {
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
  stat(uri: vscode.Uri): Thenable<unknown>;
  delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void>;
}

export type KtcCsvConversionKind = "ignored" | "converted" | "deduplicated" | "conflict";

export interface KtcCsvConversionResult {
  readonly kind: KtcCsvConversionKind;
  readonly target: vscode.Uri;
  readonly controller?: KtCodegenController;
  readonly diagnosticCount: number;
}

export interface KtcDiscoveredCodegenDocument {
  readonly uri: vscode.Uri;
  readonly itemCount: number;
  readonly className: string;
  readonly namePrefix: string;
  readonly nameMiddle: string;
  readonly nameSpace: string;
  readonly appendFunction: string;
  readonly diagnosticCount: number;
}

export interface KtcCodegenTextSnapshot {
  readonly text: string;
  readonly fingerprint: string;
}

export interface KtcCodegenJsonWriteGuard {
  /** 普通保存必须仍匹配打开时 checkpoint；省略表示用户已明确允许覆盖。 */
  readonly expectedFingerprint?: string;
  /** 文件已删除后“重新创建”使用；若竞态中重新出现则拒绝覆盖。 */
  readonly requireMissing?: boolean;
}

export function ktcCodegenFingerprint(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export type KtcCodegenSaveDiskState = "current" | "changed" | "deleted";

/** 保存前只比较已确认的 checkpoint 与最新磁盘快照，不依赖 watcher 是否及时送达。 */
export function ktcCodegenClassifySaveDiskState(
  checkpointFingerprint: string,
  observedFingerprint: string | undefined,
  watcherReportedConflict: boolean,
): KtcCodegenSaveDiskState {
  if (observedFingerprint === undefined) return "deleted";
  if (watcherReportedConflict || observedFingerprint !== checkpointFingerprint) return "changed";
  return "current";
}

export function ktcCodegenIsFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "FileNotFound" || code === "ENOENT";
}

export function ktcCodegenDiagnosticsText(diagnostics: readonly KtCodegenDiagnostic[]): string {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .slice(0, 3)
    .map((diagnostic) => diagnostic.message)
    .join("；");
}

export function ktcIsLegacyCodegenJson(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return String(record.type ?? "") === "100106"
    && (String(record.version ?? "") === "4.0" || Array.isArray(record.data));
}

/** JSON 读写与 CSV 安全转换 Service；文件系统通过端口注入。 */
export class KtcCodegenDocumentService {
  constructor(private readonly fs: KtcCodegenFileSystem) {}

  async readText(uri: vscode.Uri): Promise<string> {
    return (await this.readSnapshot(uri)).text;
  }

  async readSnapshot(uri: vscode.Uri): Promise<KtcCodegenTextSnapshot> {
    const bytes = await this.fs.readFile(uri);
    const decoded = ktcDecodeCodegenSource(bytes);
    if (!decoded) throw new Error("文件不是有效 UTF-8 或 GBK 文本");
    return {
      text: decoded.text,
      fingerprint: decoded.fingerprint,
    };
  }

  async inspect(uri: vscode.Uri): Promise<KtcDiscoveredCodegenDocument | undefined> {
    try {
      const raw = JSON.parse(await this.readText(uri)) as unknown;
      if (!ktcIsLegacyCodegenJson(raw)) return undefined;
      const normalized = this.controllerFromJson(raw);
      if (!normalized) return undefined;
      const { controller, diagnosticCount } = normalized;
      return {
        uri,
        itemCount: controller.param.items.length,
        className: `${controller.param.namePrefix}${controller.param.nameMiddle}`,
        namePrefix: controller.param.namePrefix,
        nameMiddle: controller.param.nameMiddle,
        nameSpace: controller.param.nameSpace,
        appendFunction: controller.param.appendFunction,
        diagnosticCount,
      };
    } catch {
      return undefined;
    }
  }

  async readController(uri: vscode.Uri): Promise<{
    controller: KtCodegenController;
    normalized: string;
    diagnosticCount: number;
  } | undefined> {
    try {
      return this.controllerFromJson(await this.readText(uri));
    } catch {
      return undefined;
    }
  }

  /**
   * 规范 JSON 的单文件安全写入：临时文件复读、保存时再次检查 guard、原子替换、
   * 目标复读。最终验证失败时尽力恢复原字节或删除新建目标。
   */
  async writeValidatedJson(
    uri: vscode.Uri,
    json: string,
    guard: KtcCodegenJsonWriteGuard = {},
  ): Promise<KtcCodegenTextSnapshot> {
    const normalized = this.controllerFromJson(json);
    if (!normalized || normalized.normalized !== json) {
      throw new Error("待保存 JSON 不是可复读的规范 Codegen 数据");
    }
    const tempUri = uri.with({
      path: `${uri.path}.kt-codegen-save-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    });
    let tempWritten = false;
    let original: Uint8Array | undefined;
    let replaced = false;
    try {
      await this.fs.writeFile(tempUri, new TextEncoder().encode(json));
      tempWritten = true;
      const temp = await this.readController(tempUri);
      if (!temp || temp.normalized !== json) throw new Error("保存临时 JSON 复读验证不一致");

      try {
        original = await this.fs.readFile(uri);
      } catch (error) {
        if (!ktcCodegenIsFileNotFoundError(error)) throw error;
      }
      if (guard.requireMissing && original) {
        throw new Error("JSON 在准备重新创建时重新出现，已阻止覆盖；请重新加载后再保存");
      }
      if (
        guard.expectedFingerprint &&
        (!original || ktcCodegenFingerprint(original) !== guard.expectedFingerprint)
      ) {
        throw new Error("JSON 在保存过程中再次变化，已阻止覆盖；请重新加载后再保存");
      }

      await this.fs.rename(tempUri, uri, { overwrite: true });
      tempWritten = false;
      replaced = true;
      const verified = await this.readController(uri);
      if (!verified || verified.normalized !== json) throw new Error("保存后的目标 JSON 复读验证不一致");
      return this.readSnapshot(uri);
    } catch (error) {
      if (replaced) {
        try {
          if (original) await this.fs.writeFile(uri, original);
          else await this.fs.delete(uri, { useTrash: false });
        } catch {
          throw new Error(`JSON 保存失败且恢复原文件失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      throw error;
    } finally {
      if (tempWritten) {
        try {
          await this.fs.delete(tempUri, { useTrash: false });
        } catch {
          // 原始保存错误优先。
        }
      }
    }
  }

  /** CSV → JSON 的唯一事务；任何验证失败都不会删除源 CSV。 */
  async convertCsv(
    csvUri: vscode.Uri,
    targetUri: vscode.Uri,
    allowOverwrite: boolean,
  ): Promise<KtcCsvConversionResult> {
    const controller = new KtCodegenController();
    const read = controller.readCsv(await this.readText(csvUri));
    if (!read.ok || !read.value) {
      return { kind: "ignored", target: targetUri, diagnosticCount: read.diagnostics.length };
    }
    const written = controller.writeJson();
    if (!written.ok || written.value === null) {
      throw new Error(ktcCodegenDiagnosticsText(written.diagnostics) || "CSV 无法规范化为 JSON");
    }

    let original: Uint8Array | undefined;
    if (await this.exists(targetUri)) {
      const existing = await this.readController(targetUri);
      if (existing && ktCodegenParamsEqual(existing.controller.param, controller.param)) {
        await this.fs.delete(csvUri, { useTrash: false });
        return {
          kind: "deduplicated",
          target: targetUri,
          controller: existing.controller,
          diagnosticCount: existing.diagnosticCount,
        };
      }
      if (!allowOverwrite) {
        return { kind: "conflict", target: targetUri, diagnosticCount: read.diagnostics.length };
      }
      original = await this.fs.readFile(targetUri);
    }

    const tempUri = targetUri.with({
      path: `${targetUri.path}.kt-codegen-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    });
    let tempWritten = false;
    let replaced = false;
    try {
      await this.fs.writeFile(tempUri, new TextEncoder().encode(written.value));
      tempWritten = true;
      const temp = await this.readController(tempUri);
      if (!temp || temp.normalized !== written.value) throw new Error("临时 JSON 复读验证不一致");
      await this.fs.rename(tempUri, targetUri, { overwrite: allowOverwrite });
      tempWritten = false;
      replaced = true;
      const verified = await this.readController(targetUri);
      if (!verified || verified.normalized !== written.value) {
        throw new Error("目标 JSON 写入后的复读验证不一致");
      }
      await this.fs.delete(csvUri, { useTrash: false });
      return {
        kind: "converted",
        target: targetUri,
        controller: verified.controller,
        diagnosticCount: read.diagnostics.length + verified.diagnosticCount,
      };
    } catch (error) {
      if (replaced) {
        try {
          if (original) await this.fs.writeFile(targetUri, original);
          else await this.fs.delete(targetUri, { useTrash: false });
        } catch {
          throw new Error(`CSV 转换失败且恢复原 JSON 失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      throw error;
    } finally {
      if (tempWritten) {
        try {
          await this.fs.delete(tempUri, { useTrash: false });
        } catch {
          // 原始异常优先；源 CSV 始终保留。
        }
      }
    }
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await this.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private controllerFromJson(input: string | unknown): {
    controller: KtCodegenController;
    normalized: string;
    diagnosticCount: number;
  } | undefined {
    const controller = new KtCodegenController();
    const read = controller.readJson(input);
    if (!read.ok || !read.value) return undefined;
    const written = controller.writeJson();
    if (!written.ok || written.value === null) return undefined;
    return {
      controller,
      normalized: written.value,
      diagnosticCount: read.diagnostics.length + written.diagnostics.length,
    };
  }
}
