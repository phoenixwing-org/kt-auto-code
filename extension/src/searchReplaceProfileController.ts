import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  ktcLoadWorkspaceSearchReplaceProfiles,
  ktcWriteWorkspaceSearchReplaceProfiles,
} from "../../src/searchReplaceProfileRepository.js";
import {
  ktcCreateSearchReplaceProfile,
  ktcSearchReplaceProfileSummaries,
  ktcUpsertSearchReplaceProfile,
  type KtcSearchReplaceProfile,
  type KtcSearchReplaceProfileDraft,
  type KtcSearchReplaceProfileSummary,
} from "../../src/searchReplaceProfiles.js";

export interface KtcSearchReplaceProfileViewSnapshot {
  profiles: readonly KtcSearchReplaceProfileSummary[];
  selectedProfile?: KtcSearchReplaceProfile;
  error?: string;
}

export class KtcSearchReplaceProfileController {
  snapshot(root: string | undefined): KtcSearchReplaceProfileViewSnapshot {
    if (!root) return { profiles: [] };
    const snapshot = ktcLoadWorkspaceSearchReplaceProfiles(root);
    return {
      profiles: ktcSearchReplaceProfileSummaries(snapshot.document),
      error: snapshot.error,
    };
  }

  load(root: string, id: string): KtcSearchReplaceProfileViewSnapshot {
    const snapshot = ktcLoadWorkspaceSearchReplaceProfiles(root);
    if (snapshot.error) throw new Error(snapshot.error);
    const selectedProfile = snapshot.document.profiles.find((profile) => profile.id === id);
    if (!selectedProfile) throw new Error("所选规则档案不存在或已被删除");
    return {
      profiles: ktcSearchReplaceProfileSummaries(snapshot.document),
      selectedProfile,
    };
  }

  async save(
    root: string,
    draft: KtcSearchReplaceProfileDraft,
  ): Promise<KtcSearchReplaceProfileViewSnapshot | undefined> {
    const snapshot = ktcLoadWorkspaceSearchReplaceProfiles(root);
    if (snapshot.error) throw new Error(`无法保存：${snapshot.error}`);
    const identity = await this.promptIdentity(snapshot.document.profiles);
    if (!identity) return undefined;
    const selectedProfile = ktcCreateSearchReplaceProfile(draft, {
      id: identity.id,
      label: identity.label,
      updatedAt: new Date().toISOString(),
    });
    const document = ktcUpsertSearchReplaceProfile(snapshot.document, selectedProfile);
    const saved = ktcWriteWorkspaceSearchReplaceProfiles(root, document);
    return {
      profiles: ktcSearchReplaceProfileSummaries(saved.document),
      selectedProfile,
    };
  }

  private async promptIdentity(
    profiles: readonly KtcSearchReplaceProfile[],
  ): Promise<{ id: string; label: string } | undefined> {
    let suggestion = "";
    while (true) {
      const label = await vscode.window.showInputBox({
        title: "保存搜索替换规则档案",
        prompt: "档案只写入当前工作区 .phoenix/search-replace.json",
        value: suggestion,
        validateInput: (value) => value.trim() ? undefined : "名称不能为空",
      });
      if (label === undefined) return undefined;
      const normalized = label.trim();
      const existing = profiles.find((profile) => profile.label.localeCompare(
        normalized,
        undefined,
        { sensitivity: "accent" },
      ) === 0);
      if (!existing) return { id: randomUUID(), label: normalized };
      const choice = await vscode.window.showWarningMessage(
        `规则档案“${existing.label}”已存在。`,
        { modal: true },
        "更新",
        "另存为",
      );
      if (choice === "更新") return { id: existing.id, label: existing.label };
      if (choice !== "另存为") return undefined;
      suggestion = `${normalized} 副本`;
    }
  }
}
