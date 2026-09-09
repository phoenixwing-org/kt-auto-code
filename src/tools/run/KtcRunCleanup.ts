import * as PnwRunNodeImport from "@phoenix-wing/run-node";
import { realpath } from "node:fs/promises";
import { KTC_RUN_CLEANUP_DIALOG_MODES, type KtcCleanupDialogModel } from "../../core/cleanupContracts.js";

export const KTC_RUN_CLEANUP_MODES = ["build", "objects", "obj", "git-untracked"] as const;
export type KtcRunCleanupMode = typeof KTC_RUN_CLEANUP_MODES[number];
export interface KtcRunCleanupRequest {
  readonly modeId: KtcRunCleanupMode;
  readonly targetIds: readonly ["workspace"];
  readonly rulesYaml: "";
}
export type KtcRunCleanupPayload =
  | { readonly kind: "cancel" }
  | { readonly kind: "preview"; readonly request: KtcRunCleanupRequest }
  | { readonly kind: "execute"; readonly request: KtcRunCleanupRequest; readonly previewToken: string };
interface KtcWingRecursivePreview { readonly root: string; readonly matched: readonly string[]; readonly skippedPaths: readonly string[]; }
interface KtcWingGitUntrackedPreview {
  readonly root: string;
  readonly repositories: readonly {
    readonly repository: string;
    readonly untrackedAndIgnored: readonly string[];
    readonly preservedRepositories: readonly string[];
  }[];
}
export type KtcRunFrozenCleanup =
  | { readonly kind: "recursive"; readonly preview: KtcWingRecursivePreview }
  | { readonly kind: "git-untracked"; readonly preview: KtcWingGitUntrackedPreview };
type KtcCleanupOptions = { readonly shouldContinue: () => boolean };
interface KtcWingRunCleanup {
  pnwPreviewRecursiveCleanupArtifacts(root: string, yaml: string, options: KtcCleanupOptions): Promise<KtcWingRecursivePreview>;
  pnwCleanPreviewedRecursiveArtifacts(preview: KtcWingRecursivePreview, options: KtcCleanupOptions): Promise<{ readonly deleted: readonly string[] }>;
  pnwPreviewGitUntrackedCleanup(root: string, options: KtcCleanupOptions): Promise<KtcWingGitUntrackedPreview>;
  pnwExecuteGitUntrackedCleanup(preview: KtcWingGitUntrackedPreview, options: KtcCleanupOptions): Promise<{
    readonly repositories: readonly { readonly repository: string; readonly deleted: readonly string[]; readonly cleanOutput: string }[];
  }>;
}
// TODO(Wing-release): once published, consume named exports and official snapshot types.
// Until then this is local-Wing-only; missing Registry capabilities fail closed, never fall back to direct deletion.
const KtcWing = PnwRunNodeImport as unknown as KtcWingRunCleanup;

export function KtcParseRunCleanupPayload(value: unknown): KtcRunCleanupPayload | undefined {
  if (!record(value)) return undefined;
  if (value.kind === "cancel") return { kind: "cancel" };
  if (value.kind !== "preview" && value.kind !== "execute") return undefined;
  const request = value.request;
  if (!record(request) || !KTC_RUN_CLEANUP_MODES.includes(request.modeId as KtcRunCleanupMode)
    || !Array.isArray(request.targetIds) || request.targetIds.length !== 1 || request.targetIds[0] !== "workspace"
    || request.rulesYaml !== "") return undefined;
  const normalized: KtcRunCleanupRequest = { modeId: request.modeId as KtcRunCleanupMode, targetIds: ["workspace"], rulesYaml: "" };
  if (value.kind === "preview") return { kind: "preview", request: normalized };
  if (typeof value.previewToken !== "string" || !value.previewToken.length || value.previewToken.length > 512) return undefined;
  return { kind: "execute", request: normalized, previewToken: value.previewToken };
}

export function KtcCreateRunCleanupModel(
  root: string, mode: KtcRunCleanupMode, preview: KtcCleanupDialogModel["preview"], disabledReason?: string,
): KtcCleanupDialogModel {
  return {
    title: "Run 清理",
    description: "预览精确目标后点击清理。递归产物与 Git 未跟踪清理保留各自语义；不会自动执行 Git reset。",
    modes: KTC_RUN_CLEANUP_DIALOG_MODES,
    selectedModeId: mode,
    targets: [{ id: "workspace", label: "当前工作目录", path: root, selected: true, supportedModeIds: KTC_RUN_CLEANUP_MODES }],
    rulesVisible: false, rulesLabel: "固定清理规则", rulesYaml: "", preview,
    previewEnabled: !disabledReason, executeEnabled: !disabledReason && preview.state === "ready" && !!preview.token,
    ...(disabledReason ? { previewDisabledReason: disabledReason, executeDisabledReason: disabledReason } : {}),
    previewLabel: "预览", executeLabel: "清理", cancelLabel: "取消",
    requireHighRiskConfirmation: false,
    highRiskConfirmationLabel: "",
  };
}

/** These are thin adapters; complete snapshots remain opaque and never cross into the Webview. */
export async function KtcPreviewRunCleanup(root: string, mode: KtcRunCleanupMode, shouldContinue: () => boolean) {
  if (!shouldContinue()) throw new Error("清理已取消。");
  if (mode === "git-untracked") {
    if (typeof KtcWing.pnwPreviewGitUntrackedCleanup !== "function") throw new Error("当前 Wing 不支持 Run Git 清理预览，请更新本地构建。");
    const preview = await KtcWing.pnwPreviewGitUntrackedCleanup(root, { shouldContinue });
    const items = preview.repositories.flatMap((repo) => [
      `[仓库] ${repo.repository}`,
      ...repo.untrackedAndIgnored.map((item) => `[待清理] ${repo.repository} / ${item}`),
      ...repo.preservedRepositories.map((item) => `[保留嵌套仓库] ${item}`),
    ]);
    return { value: { kind: "git-untracked", preview } as const, items, summary: `${preview.repositories.length} 个仓库；仅清理未跟踪与忽略内容` };
  }
  if (typeof KtcWing.pnwPreviewRecursiveCleanupArtifacts !== "function") throw new Error("当前 Wing 不支持递归清理预览，请更新本地构建。");
  const yaml = mode === "obj" ? "delete:\n  files:\n    - '*.obj'" : `delete:\n  directories:\n    - ${mode}`;
  const preview = await KtcWing.pnwPreviewRecursiveCleanupArtifacts(root, yaml, { shouldContinue });
  return { value: { kind: "recursive", preview } as const, items: [
    ...preview.matched.map((item) => `[待删除] ${item}`),
    ...preview.skippedPaths.map((item) => `[跳过] ${item}`),
  ], summary: `${preview.matched.length} 个递归命中，${preview.skippedPaths.length} 个跳过项` };
}

export async function KtcExecuteRunCleanup(
  root: string, frozen: KtcRunFrozenCleanup, shouldContinue: () => boolean, log: (message: string) => void,
): Promise<readonly string[]> {
  if (!shouldContinue() || await realpath(root) !== frozen.preview.root) throw new Error("当前清理目录已变化，请重新预览。");
  const result = frozen.kind === "recursive"
    ? (await KtcWing.pnwCleanPreviewedRecursiveArtifacts(frozen.preview, { shouldContinue })).deleted.map((item) => `删除 ${item}`)
    : (await KtcWing.pnwExecuteGitUntrackedCleanup(frozen.preview, { shouldContinue })).repositories.flatMap((repo) =>
      repo.deleted.map((item) => `删除 ${item}`));
  for (const line of result) log(line);
  return result;
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
