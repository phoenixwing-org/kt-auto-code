import type { KtcReorderMembersResultActions } from "./contracts.js";
import { ktcCancelReorderRows, ktcPendingReorderUris, type KtcReorderStateRow } from "./state.js";

export type KtcReorderAction = "open" | "preview" | "apply" | "cancel" | "gitDiff" | "revert";

export interface KtcReorderActionSession {
  readonly rows: KtcReorderStateRow[];
  readonly actions: KtcReorderMembersResultActions;
  readonly runtimeWarnings: Map<string, string>;
  readonly selected: Set<string>;
}

export interface KtcReorderActionOutcome {
  readonly handled: boolean;
  readonly refresh: boolean;
  readonly status: "done" | "error";
  readonly message?: string;
}

export async function ktcExecuteReorderAction(
  session: KtcReorderActionSession,
  action: KtcReorderAction,
  requestedUris: readonly string[],
): Promise<KtcReorderActionOutcome> {
  const firstUri = requestedUris[0];
  const firstRow = firstUri ? session.rows.find((row) => row.uri === firstUri) : undefined;
  if (!firstUri || !firstRow) return noop();

  if (action === "open") {
    await session.actions.openFile(firstUri);
    return passive();
  }
  if (action === "preview") {
    if (firstRow.state !== "pending") return noop();
    await session.actions.previewDiff(firstUri);
    return passive();
  }
  if (action === "gitDiff") {
    if (firstRow.state !== "applied") return noop();
    await session.actions.openGitDiff(firstUri);
    return passive();
  }
  if (action === "cancel") {
    const count = ktcCancelReorderRows(session.rows, requestedUris);
    pruneSelection(session);
    return count
      ? { handled: true, refresh: true, status: "done", message: `已从本次结果移除 ${count} 个文件。` }
      : noop();
  }
  if (action === "apply") {
    const uris = ktcPendingReorderUris(session.rows, requestedUris);
    if (!uris.length) return noop();
    const result = await session.actions.apply(uris);
    for (const update of result.updates) {
      const row = session.rows.find((candidate) => candidate.uri === update.uri);
      if (row) row.state = update.state;
      if (update.warning) session.runtimeWarnings.set(update.uri, update.warning);
    }
    pruneSelection(session);
    const applied = result.updates.filter((update) => update.state === "applied").length;
    const blocked = result.updates.filter((update) => update.state === "blocked").length;
    const message = result.updates.length === 0
      ? "未应用成员排序变更。"
      : blocked
        ? `已写入 ${applied} 个文件，${blocked} 个文件未写入。`
        : `已写入 ${applied} 个文件；可从对应行查看 Git 差异或还原。`;
    return { handled: true, refresh: true, status: blocked ? "error" : "done", message };
  }
  if (action === "revert") {
    if (firstRow.state !== "applied") return noop();
    const result = await session.actions.revert(firstUri);
    if (result.state === "reverted" || result.state === "blocked") firstRow.state = result.state;
    if (result.warning) session.runtimeWarnings.set(result.uri, result.warning);
    pruneSelection(session);
    const message = result.state === "reverted"
      ? `已还原 ${firstRow.relativePath}。`
      : result.state === "cancelled"
        ? "已取消还原。"
        : `${firstRow.relativePath} 未能还原。`;
    return { handled: true, refresh: true, status: result.state === "blocked" ? "error" : "done", message };
  }
  return noop();
}

function pruneSelection(session: KtcReorderActionSession): void {
  const pending = new Set(session.rows.filter((row) => row.state === "pending").map((row) => row.uri));
  for (const uri of session.selected) if (!pending.has(uri)) session.selected.delete(uri);
}

function noop(): KtcReorderActionOutcome {
  return { handled: false, refresh: false, status: "done" };
}

function passive(): KtcReorderActionOutcome {
  return { handled: true, refresh: false, status: "done" };
}
