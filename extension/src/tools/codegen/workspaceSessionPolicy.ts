import { ktcResolveCodegenWorkspaceRoot } from "./workspaceRootResolver.js";

export interface KtcCodegenWorkspaceSessionState {
  readonly documentPath: string;
  readonly open: boolean;
  readonly dirty: boolean;
  readonly externalConflict: boolean;
}

export interface KtcCodegenStableListEntry {
  readonly uri: string;
  readonly displayPath: string;
}

export interface KtcCodegenSessionReleaseState {
  readonly open: boolean;
  readonly dirty: boolean;
  readonly externalState: "current" | "changed" | "deleted";
  readonly operationCount: number;
  readonly preflightRunning: boolean;
  readonly batchRunning: boolean;
}

/**
 * Block 中的 JSON 顺序只由路径决定；打开、激活或编辑文档都不能让行跳位。
 * 返回新数组，避免排序 UI 投影时改变发现缓存的插入顺序。
 */
export function ktcSortCodegenDocumentList<T extends KtcCodegenStableListEntry>(
  documents: readonly T[],
): T[] {
  return [...documents].sort((a, b) => a.displayPath.localeCompare(b.displayPath)
    || a.uri.localeCompare(b.uri));
}

/** 工作区重扫后，决定未被重新发现的内存会话是否仍应出现在 Block。 */
export function ktcShouldRetainCodegenSessionInList(
  session: KtcCodegenWorkspaceSessionState,
  workspaceRoots: readonly string[],
): boolean {
  return session.open
    || session.dirty
    || session.externalConflict
    || Boolean(ktcResolveCodegenWorkspaceRoot(session.documentPath, workspaceRoots));
}

/** 关闭 View 只释放没有草稿、冲突或运行中 owner 的 session。 */
export function ktcCanReleaseClosedCodegenSession(
  session: KtcCodegenSessionReleaseState,
): boolean {
  return !session.open
    && !session.dirty
    && session.externalState === "current"
    && session.operationCount <= 0
    && !session.preflightRunning
    && !session.batchRunning;
}
