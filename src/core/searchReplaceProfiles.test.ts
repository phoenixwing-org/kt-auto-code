import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ktcLoadWorkspaceSearchReplaceProfiles,
  ktcWorkspaceSearchReplaceProfilePath,
  ktcWriteWorkspaceSearchReplaceProfiles,
} from "./searchReplaceProfileRepository.js";
import {
  ktcCreateSearchReplaceProfile,
  ktcEmptySearchReplaceProfileDocument,
  ktcParseSearchReplaceProfileDocument,
  ktcUpsertSearchReplaceProfile,
  type KtcSearchReplaceProfileDraft,
} from "./searchReplaceProfiles.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "ktc-search-profile-"));
  roots.push(root);
  return root;
}

function draft(): KtcSearchReplaceProfileDraft {
  return {
    search: "AutoCode",
    replace: "TomBuild",
    sourcePrefix: "KTC",
    targetPrefix: "KTM",
    associatedRules: [
      {
        id: "associated-prefix-primary",
        parentId: "primary",
        relationKind: "prefix",
        source: "generated",
        search: "KTCAutoCode",
        replace: "KTMTomBuild",
        enabled: true,
      },
    ],
    options: {
      preserveCase: true,
      text: true,
      file: true,
      dir: true,
      includeIgnored: false,
      scope: "src",
    },
  };
}

describe("searchReplaceProfiles", () => {
  it("缺少工作区文件时返回空文档且不自动创建", () => {
    const root = workspace();
    const snapshot = ktcLoadWorkspaceSearchReplaceProfiles(root);
    expect(snapshot.document.profiles).toEqual([]);
    expect(snapshot.exists).toBe(false);
    expect(existsSync(snapshot.filePath)).toBe(false);
  });

  it("显式写入后可按版本模型读回", () => {
    const root = workspace();
    const profile = ktcCreateSearchReplaceProfile(draft(), {
      id: "profile-1",
      label: "AutoCode to TomBuild",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    const document = ktcUpsertSearchReplaceProfile(ktcEmptySearchReplaceProfileDocument(), profile);
    const saved = ktcWriteWorkspaceSearchReplaceProfiles(root, document);
    expect(saved.exists).toBe(true);
    expect(ktcLoadWorkspaceSearchReplaceProfiles(root).document).toEqual(document);
    expect(readFileSync(saved.filePath, "utf8")).toMatch(/"version": 1/);
  });

  it("同一 id 更新而不是追加重复档案", () => {
    const first = ktcCreateSearchReplaceProfile(draft(), {
      id: "profile-1",
      label: "First",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    const updated = { ...first, label: "Updated" };
    const document = ktcUpsertSearchReplaceProfile(
      ktcUpsertSearchReplaceProfile(ktcEmptySearchReplaceProfileDocument(), first),
      updated,
    );
    expect(document.profiles).toEqual([updated]);
  });

  it("现有文件损坏时拒绝覆盖", () => {
    const root = workspace();
    const filePath = ktcWorkspaceSearchReplaceProfilePath(root);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "{ broken", "utf8");
    expect(() => ktcWriteWorkspaceSearchReplaceProfiles(root, ktcEmptySearchReplaceProfileDocument()))
      .toThrow(/未覆盖/);
    expect(readFileSync(filePath, "utf8")).toBe("{ broken");
  });

  it("拒绝未知版本和未知关联类型", () => {
    expect(() => ktcParseSearchReplaceProfileDocument('{"version":2,"profiles":[]}')).toThrow(/版本/);
    const profile = ktcCreateSearchReplaceProfile(draft(), {
      id: "profile-1",
      label: "Valid",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    const invalid = JSON.stringify({ version: 1, profiles: [{ ...profile, associatedRules: [{ ...profile.associatedRules[0], relationKind: "unknown" }] }] });
    expect(() => ktcParseSearchReplaceProfileDocument(invalid)).toThrow(/relationKind/);
  });

  it("拒绝重复名称和无替换范围的档案", () => {
    const profile = ktcCreateSearchReplaceProfile(draft(), {
      id: "profile-1",
      label: "Shared Name",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    expect(() => ktcParseSearchReplaceProfileDocument(JSON.stringify({
      version: 1,
      profiles: [profile, { ...profile, id: "profile-2", label: "shared name" }],
    }))).toThrow(/名称重复/);
    expect(() => ktcCreateSearchReplaceProfile({
      ...draft(),
      options: { ...draft().options, text: false, file: false, dir: false },
    }, {
      id: "profile-3",
      label: "No Scope",
      updatedAt: "2026-07-11T12:00:00.000Z",
    })).toThrow(/替换范围/);
  });

  it("保存草稿时忽略完全空白的自定义行", () => {
    const profile = ktcCreateSearchReplaceProfile({
      ...draft(),
      associatedRules: [
        ...draft().associatedRules,
        { id: "empty", search: "", replace: "", enabled: true, source: "user", relationKind: "custom" },
      ],
    }, {
      id: "profile-1",
      label: "Clean",
      updatedAt: "2026-07-11T12:00:00.000Z",
    });
    expect(profile.associatedRules.map((rule) => rule.id)).not.toContain("empty");
  });
});
