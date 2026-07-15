import { randomUUID } from "node:crypto";
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
    label: string,
  ): Promise<KtcSearchReplaceProfileViewSnapshot> {
    const snapshot = ktcLoadWorkspaceSearchReplaceProfiles(root);
    if (snapshot.error) throw new Error(`无法保存：${snapshot.error}`);
    const normalized = label.trim();
    if (!normalized) throw new Error("规则档案名称不能为空");
    const existing = snapshot.document.profiles.find((profile) => profile.label.localeCompare(
      normalized,
      undefined,
      { sensitivity: "accent" },
    ) === 0);
    const selectedProfile = ktcCreateSearchReplaceProfile(draft, {
      id: existing?.id ?? randomUUID(),
      label: existing?.label ?? normalized,
      updatedAt: new Date().toISOString(),
    });
    const document = ktcUpsertSearchReplaceProfile(snapshot.document, selectedProfile);
    const saved = ktcWriteWorkspaceSearchReplaceProfiles(root, document);
    return {
      profiles: ktcSearchReplaceProfileSummaries(saved.document),
      selectedProfile,
    };
  }
}
