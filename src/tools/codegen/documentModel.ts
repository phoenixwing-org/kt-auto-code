import {
  KT_CODEGEN_LEGACY_BLOCKS,
  KtCodegenController,
  KtCodegenTableCore,
  type KtCodegenBlockKey,
  type KtCodegenDataResult,
  type KtCodegenDiagnostic,
  type KtCodegenParam,
  type KtCodegenTableData,
} from "@phoenix-wing/kt-codegen";
import type { KtcCodegenMetaField, KtcCodegenPreflightResult } from "./contracts.js";
import type { KtCodegenRegionApplyUiOutcome } from "@phoenix-wing/kt-codegen/ui";

export interface KtcCodegenDocumentIdentity {
  readonly uri: string;
  readonly fsPath: string;
  readonly fileName: string;
}

export type KtcCodegenTableAcceptance = "accepted" | "unchanged" | "stale";
export type KtcCodegenExternalState = "current" | "changed" | "deleted";
export type KtcCodegenPreflightSnapshotState = "ready" | "applied" | "stale";
export interface KtcCodegenPreflightSnapshot {
  readonly result: KtcCodegenPreflightResult;
  readonly state: KtcCodegenPreflightSnapshotState;
  readonly message: string;
  readonly regionOutcomes?: readonly KtCodegenRegionApplyUiOutcome[];
}
export interface KtcCodegenControlSelectionChange {
  readonly selectionChanged: boolean;
  readonly modeChanged: boolean;
}

/**
 * 单份 Codegen JSON 的 Model。
 *
 * 它持有 Wing Controller/TableCore 的唯一共享 Param，并集中维护 revision、
 * dirty、控制符选择和预检失效规则；不依赖 VS Code、DOM 或文件系统。
 */
export class KtcCodegenDocumentModel {
  public readonly tableCore: KtCodegenTableCore;
  private currentDirty = false;
  private currentRevision = 0;
  private currentDraftItemCount: number | undefined;
  private currentDiagnosticCount: number;
  private currentPreflight: KtcCodegenPreflightResult | undefined;
  private currentPreflightSnapshot: KtcCodegenPreflightSnapshot | undefined;
  private currentDiskFingerprint: string;
  private currentExternalState: KtcCodegenExternalState = "current";
  private currentSingleSelectionMode = false;
  private currentShowMissingTemplates = false;
  private readonly blockKeys = new Set<KtCodegenBlockKey>(
    KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key),
  );

  constructor(
    public readonly identity: KtcCodegenDocumentIdentity,
    public readonly controller: KtCodegenController,
    diagnosticCount = 0,
    diskFingerprint = "",
  ) {
    this.tableCore = new KtCodegenTableCore(controller.param);
    this.currentDiagnosticCount = diagnosticCount;
    this.currentDiskFingerprint = diskFingerprint;
  }

  get dirty(): boolean {
    return this.currentDirty;
  }

  get revision(): number {
    return this.currentRevision;
  }

  get draftItemCount(): number | undefined {
    return this.currentDraftItemCount;
  }

  get diagnosticCount(): number {
    return this.currentDiagnosticCount;
  }

  get preflight(): KtcCodegenPreflightResult | undefined {
    return this.currentPreflight;
  }

  /** 最近一次预检的只读展示快照；绝不能作为 Apply 的可执行计划。 */
  get preflightSnapshot(): KtcCodegenPreflightSnapshot | undefined {
    return this.currentPreflightSnapshot;
  }

  get diskFingerprint(): string {
    return this.currentDiskFingerprint;
  }

  get externalState(): KtcCodegenExternalState {
    return this.currentExternalState;
  }

  get hasExternalConflict(): boolean {
    return this.currentExternalState !== "current";
  }

  get selectedBlockKeys(): readonly KtCodegenBlockKey[] {
    return [...this.blockKeys];
  }

  get singleSelectionMode(): boolean {
    return this.currentSingleSelectionMode;
  }

  get showMissingTemplates(): boolean {
    return this.currentShowMissingTemplates;
  }

  /** 只记录 Web Component 的 dirty 跃迁，不进行逐单元格交换。 */
  markTableDirty(itemCount: number): void {
    this.currentDraftItemCount = Math.max(0, Math.trunc(itemCount));
    this.markDirty();
  }

  /** 文档级动作时接收整表；revision 过期时不触碰共享 Param。 */
  acceptTable(table: KtCodegenTableData): KtcCodegenTableAcceptance {
    if (table.documentRevision !== this.currentRevision) return "stale";
    const unchanged = JSON.stringify(this.controller.param.items) === JSON.stringify(table.items);
    if (unchanged) {
      this.tableCore.select(table.selectedRow);
      return "unchanged";
    }
    this.tableCore.replaceData(table);
    this.currentDraftItemCount = table.items.length;
    this.markDirty();
    return "accepted";
  }

  updateMeta(field: KtcCodegenMetaField, value: string): boolean {
    if (this.controller.param[field] === value) return false;
    this.controller.param[field] = value;
    this.markDirty();
    return true;
  }

  setSelectedBlockKeys(
    keys: readonly KtCodegenBlockKey[],
    singleSelectionMode = this.currentSingleSelectionMode,
  ): KtcCodegenControlSelectionChange {
    const next = new Set(keys);
    const selectionChanged = next.size !== this.blockKeys.size
      || [...next].some((key) => !this.blockKeys.has(key));
    const modeChanged = this.currentSingleSelectionMode !== singleSelectionMode;
    if (!selectionChanged && !modeChanged) return { selectionChanged, modeChanged };
    this.blockKeys.clear();
    for (const key of next) this.blockKeys.add(key);
    this.currentSingleSelectionMode = singleSelectionMode;
    if (selectionChanged) this.invalidatePreflight("控制符选择已变化，需重新预检");
    return { selectionChanged, modeChanged };
  }

  /** 只属于当前 Extension Host 会话，不写入 Codegen JSON。 */
  setShowMissingTemplates(value: boolean): boolean {
    if (this.currentShowMissingTemplates === value) return false;
    this.currentShowMissingTemplates = value;
    return true;
  }

  setPreflight(preflight: KtcCodegenPreflightResult | undefined): void {
    this.currentPreflight = preflight;
    if (preflight) {
      this.currentPreflightSnapshot = {
        result: preflight,
        state: "ready",
        message: preflight.reused ? "缓存计划可应用" : "新计划可应用",
      };
    } else {
      this.markPreflightSnapshotStale("执行计划已失效，需重新预检");
    }
  }

  /** Apply 成功后销毁可执行计划，但保留只读结果供命中、问题和产物回看。 */
  markPreflightApplied(
    additionalDiagnostics: readonly KtCodegenDiagnostic[] = [],
    regionOutcomes: readonly KtCodegenRegionApplyUiOutcome[] = [],
  ): void {
    const completed = this.currentPreflight;
    this.currentPreflight = undefined;
    if (!completed) return;
    const result = additionalDiagnostics.length
      ? {
          ...completed,
          plan: {
            ...completed.plan,
            diagnostics: [...completed.plan.diagnostics, ...additionalDiagnostics],
          },
        }
      : completed;
    this.currentPreflightSnapshot = {
      result,
      state: "applied",
      message: "已应用；再次 Apply 前需重新预检",
      regionOutcomes,
    };
  }

  recordDiagnostics(count: number): void {
    this.currentDiagnosticCount = Math.max(0, Math.trunc(count));
  }

  /** 写盘成功后推进 revision，并把整表设为新 checkpoint。 */
  markSaved(diagnosticCount: number, diskFingerprint = this.currentDiskFingerprint): void {
    this.currentRevision += 1;
    this.tableCore.markCheckpoint(this.currentRevision);
    this.currentDirty = false;
    this.currentDraftItemCount = undefined;
    this.currentDiagnosticCount = diagnosticCount;
    this.currentDiskFingerprint = diskFingerprint;
    this.currentExternalState = "current";
  }

  /** 从磁盘内容原地更新共享 Param；失败时保持当前草稿。 */
  reloadFromJson(
    input: string,
    diskFingerprint = this.currentDiskFingerprint,
  ): KtCodegenDataResult<KtCodegenParam> {
    const result = this.controller.readJson(input);
    if (!result.ok || !result.value) return result;
    this.currentRevision += 1;
    this.tableCore.markCheckpoint(this.currentRevision);
    this.invalidatePreflight("JSON 已从磁盘重新载入，需重新预检");
    this.currentDirty = false;
    this.currentDraftItemCount = undefined;
    this.currentDiagnosticCount = result.diagnostics.length;
    this.currentDiskFingerprint = diskFingerprint;
    this.currentExternalState = "current";
    return result;
  }

  observeExternalFingerprint(fingerprint: string): "unchanged" | "changed" {
    if (fingerprint === this.currentDiskFingerprint) {
      this.currentExternalState = "current";
      return "unchanged";
    }
    this.markExternalChanged();
    return "changed";
  }

  /** 外部文件存在但无法读取/解码时也必须进入冲突态，不能继续显示 current。 */
  markExternalChanged(): void {
    this.currentExternalState = "changed";
    this.invalidatePreflight("源文件或 JSON 已在外部变化，需重新预检");
  }

  markExternalDeleted(): void {
    this.currentExternalState = "deleted";
    this.invalidatePreflight("JSON 已在外部删除，需重新预检");
  }

  getTableData(): KtCodegenTableData {
    return this.tableCore.getData();
  }

  private markDirty(): void {
    this.currentDirty = true;
    this.invalidatePreflight("JSON 参数已修改，需重新预检");
  }

  private invalidatePreflight(message: string): void {
    this.currentPreflight = undefined;
    this.markPreflightSnapshotStale(message);
  }

  private markPreflightSnapshotStale(message: string): void {
    if (!this.currentPreflightSnapshot) return;
    this.currentPreflightSnapshot = {
      ...this.currentPreflightSnapshot,
      state: "stale",
      message,
    };
  }
}
