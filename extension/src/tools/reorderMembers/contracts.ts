import type * as vscode from "vscode";

export type KtcReorderPreviewRow = {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
  readonly kind: "header" | "source";
  readonly encoding: "UTF-8" | "UTF-8 BOM" | "GBK" | "未知";
  readonly changed: boolean;
  state: "unchanged" | "pending" | "cancelled" | "applied" | "blocked" | "reverted";
  readonly warnings: readonly string[];
};

export interface KtcReorderApplyResult {
  readonly updates: readonly { uri: string; state: "applied" | "blocked"; warning?: string }[];
}

export interface KtcReorderRevertResult {
  readonly uri: string;
  readonly state: "reverted" | "blocked" | "cancelled";
  readonly warning?: string;
}

export interface KtcReorderMembersResultActions {
  openFile(uri: string): Promise<void>;
  previewDiff(uri: string): Promise<void>;
  openGitDiff(uri: string): Promise<void>;
  revert(uri: string): Promise<KtcReorderRevertResult>;
  apply(uriStrings: readonly string[]): Promise<KtcReorderApplyResult>;
}
