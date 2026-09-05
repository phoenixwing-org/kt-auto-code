import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakePosition = { readonly line: number; readonly character: number };
type FakeDocument = {
  readonly uri: { readonly scheme: "file"; readonly fsPath: string };
  isDirty: boolean;
  readonly lineCount: number;
  getText(): string;
  lineAt(line: number): { readonly rangeIncludingLineBreak: { readonly end: FakePosition } };
  save(): Promise<boolean>;
};

let documents: FakeDocument[] = [];
let pendingReplacement: { document: FakeDocument; text: string } | undefined;

vi.mock("vscode", () => {
  class Position {
    constructor(readonly line: number, readonly character: number) {}
  }
  class Range {
    constructor(readonly start: Position, readonly end: Position) {}
  }
  class WorkspaceEdit {
    replace(uri: { fsPath: string }, _range: Range, text: string): void {
      const document = documents.find((candidate) => candidate.uri.fsPath === uri.fsPath);
      if (!document) throw new Error("missing fake document");
      pendingReplacement = { document, text };
    }
  }
  return {
    Position,
    Range,
    WorkspaceEdit,
    Uri: { file: (fsPath: string) => ({ scheme: "file", fsPath }) },
    window: { showTextDocument: vi.fn(async () => undefined) },
    workspace: {
      get textDocuments() { return documents; },
      openTextDocument: vi.fn(async (uri: { scheme: "file"; fsPath: string }) => {
        const existing = documents.find((document) => document.uri.fsPath === uri.fsPath);
        if (existing) return existing;
        let text = fs.readFileSync(uri.fsPath, "utf8");
        const document: FakeDocument = {
          uri,
          isDirty: false,
          get lineCount() { return text.split("\n").length; },
          getText: () => text,
          lineAt(line: number) {
            const lines = text.split("\n");
            return { rangeIncludingLineBreak: { end: { line, character: lines[line]?.length ?? 0 } } };
          },
          async save() {
            fs.writeFileSync(uri.fsPath, text, "utf8");
            this.isDirty = false;
            return true;
          },
        };
        Object.defineProperty(document, "__replace", { value: (value: string) => { text = value; } });
        documents.push(document);
        return document;
      }),
      applyEdit: vi.fn(async () => {
        if (!pendingReplacement) return false;
        const replace = (pendingReplacement.document as FakeDocument & { __replace(value: string): void }).__replace;
        replace(pendingReplacement.text);
        pendingReplacement.document.isDirty = true;
        pendingReplacement = undefined;
        return true;
      }),
    },
  };
});

import {
  applyIgnoreRulesToDocument,
  appendIgnorePresetToDocument,
  invalidateWorkspaceIgnorePatterns,
  openIgnoreTargetFile,
  refreshIgnoreConfig,
  resolveWorkspaceIgnorePatterns,
  savePrimaryCustomIgnorePatterns,
} from "./ignoreConfig.js";
import { KtcIgnoreController, ktcDefaultIgnoreGroupIds, ktcIsIgnoreMessage } from "./ignoreController.js";
import { KtcIgnoreRecommendationController } from "./ignoreRecommendationController.js";
import { isIgnoredPath, shouldSkipDirName } from "./core/dotIgnore.js";

const tempRoots: string[] = [];
const SAFETY_IGNORE_PATTERNS = [".git/", ".hg/", ".svn/", ".phoenix/"];

function workspaceRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ktc-ignore-config-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".phoenix"), { recursive: true });
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  return root;
}

beforeEach(() => {
  documents = [];
  pendingReplacement = undefined;
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Ignore document host adapter", () => {
  it("rejects malformed preset and recommendation messages at the Host boundary", () => {
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "cpp", action: "append" })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "cpp", action: "append", target: "git" })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "openIgnoreTarget", target: "phoenix" })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRules", target: "git", action: "remove", rules: ["build/"] })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRecommendations", groupIds: ["build-cache"] })).toBe(true);
    expect(ktcIsIgnoreMessage({
      type: "applyIgnoreRecommendations",
      target: "phoenix",
      action: "append",
      ruleValues: ["build/"],
    })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "invalid", action: "append" } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "cpp", action: "replace" } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "openIgnoreTarget", target: "workspace" } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRules", target: "git", action: "append", rules: Array(501).fill("x") } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRules", target: "git", action: "append", rules: ["x".repeat(501)] } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRules", target: "git", action: "append", rules: ["build/\nsecret/"] } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "savePrimaryCustomIgnore", patterns: ["build/\0secret/"] } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({
      type: "applyIgnoreRecommendations",
      target: "git",
      action: "append",
      ruleValues: ["build/\rsecret/"],
    } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRecommendations", groupIds: [""] } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRecommendations" } as never)).toBe(false);
  });

  it("selects at most one safe Ignore recommendation group by default", () => {
    const groups = [
      { groupId: "empty", defaultSelected: true, suggestedRules: [] },
      { groupId: "first-safe", defaultSelected: true, suggestedRules: ["build/"] },
      { groupId: "second-safe", defaultSelected: true, suggestedRules: ["cache/"] },
    ];
    expect(ktcDefaultIgnoreGroupIds(groups)).toEqual(["first-safe"]);
    expect(ktcDefaultIgnoreGroupIds(groups.map((group) => ({ ...group, defaultSelected: false })))).toEqual([]);
  });

  it("does not create a missing Ignore target merely to open it", async () => {
    const root = workspaceRoot();
    fs.rmSync(path.join(root, ".phoenix"), { recursive: true, force: true });

    await expect(openIgnoreTargetFile(root, "git")).rejects.toThrow(".gitignore 尚不存在");
    await expect(openIgnoreTargetFile(root, "phoenix")).rejects.toThrow(".phoenix/.ignore 尚不存在");

    expect(fs.existsSync(path.join(root, ".gitignore"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".phoenix"))).toBe(false);
    expect(documents).toEqual([]);
  });

  it("updates only the open buffer, marks it dirty, and leaves disk bytes unchanged", async () => {
    const root = workspaceRoot();
    const filename = path.join(root, ".phoenix", ".ignore");
    const diskText = "custom-cache/\n";
    fs.writeFileSync(filename, diskText, "utf8");

    const summary = await appendIgnorePresetToDocument(root, "web");
    const document = documents[0]!;

    expect(document.isDirty).toBe(true);
    expect(document.getText()).toContain("# >>> KT Auto Code preset:web");
    expect(summary.statusText).toContain("未保存");
    expect(fs.readFileSync(filename, "utf8")).toBe(diskText);
  });

  it("routes gitignore sync through the Controller and reports the dirty buffer summary", async () => {
    const root = workspaceRoot();
    const filename = path.join(root, ".phoenix", ".ignore");
    const diskText = "custom-cache/\n";
    fs.writeFileSync(filename, diskText, "utf8");
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n", "utf8");
    const summaries: string[] = [];

    const result = await new KtcIgnoreController().handle(
      { type: "syncIgnoreFromGit" },
      root,
      (summary) => summaries.push(summary.statusText),
    );

    expect(result.error).toBeUndefined();
    expect(result.summary?.statusText).toContain("未保存");
    expect(summaries).toEqual([expect.stringContaining("未保存")]);
    expect(documents[0]?.getText()).toContain("node_modules/");
    expect(fs.readFileSync(filename, "utf8")).toBe(diskText);
  });

  it("syncs the current unsaved Git Ignore buffer instead of stale disk text", async () => {
    const root = workspaceRoot();
    const gitIgnore = path.join(root, ".gitignore");
    const phoenixIgnore = path.join(root, ".phoenix", ".ignore");
    fs.writeFileSync(gitIgnore, "disk-only/\n", "utf8");

    await applyIgnoreRulesToDocument(root, "git", "append", ["dirty-only/"]);
    expect(documents.find((document) => document.uri.fsPath === gitIgnore)?.isDirty).toBe(true);
    expect(fs.readFileSync(gitIgnore, "utf8")).toBe("disk-only/\n");

    const result = await new KtcIgnoreController().handle({ type: "syncIgnoreFromGit" }, root);

    expect(result.error).toBeUndefined();
    const phoenixText = documents.find((document) => document.uri.fsPath === phoenixIgnore)?.getText() ?? "";
    expect(phoenixText).toContain("disk-only/");
    expect(phoenixText).toContain("dirty-only/");
  });

  it("refreshes cached disk rules after the save listener invalidates them", () => {
    const root = workspaceRoot();
    const filename = path.join(root, ".phoenix", ".ignore");
    fs.writeFileSync(filename, "alpha-cache/\n", "utf8");
    expect(resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true })).toContain("alpha-cache/");

    fs.writeFileSync(filename, "bravo-cache/\n", "utf8");
    invalidateWorkspaceIgnorePatterns(root);
    expect(resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true })).toEqual(expect.arrayContaining([".phoenix/", "bravo-cache/"]));
    expect(resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true })).not.toContain("alpha-cache/");
  });

  it("always resolves root gitignore rules when no plugin Ignore file exists", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "# generated\ndist/\n*.tmp\n", "utf8");

    expect(resolveWorkspaceIgnorePatterns(root)).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "*.tmp"]);
    expect(fs.existsSync(path.join(root, ".phoenix", ".ignore"))).toBe(false);
  });

  it("layers plugin rules when enabled and omits them when disabled", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n", "utf8");
    fs.writeFileSync(path.join(root, ".phoenix", ".ignore"), "plugin-cache/\n", "utf8");

    expect(resolveWorkspaceIgnorePatterns(root)).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/"]);
    expect(resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true })).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "plugin-cache/"]);
    expect(resolveWorkspaceIgnorePatterns(root, false)).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/"]);
  });

  it("uses the nearest repository root gitignore for a selected child directory", () => {
    const root = workspaceRoot();
    const child = path.join(root, "packages", "feature");
    fs.mkdirSync(path.join(child, ".phoenix"), { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n*.tmp\n", "utf8");
    fs.writeFileSync(path.join(child, ".phoenix", ".ignore"), "local-cache/\n", "utf8");

    expect(resolveWorkspaceIgnorePatterns(child)).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "*.tmp"]);
    expect(resolveWorkspaceIgnorePatterns(child, { customIgnoreEnabled: true })).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "*.tmp", "local-cache/"]);
    expect(resolveWorkspaceIgnorePatterns(child, false)).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "*.tmp"]);
  });

  it("relocates repository-root path rules to actual selected-child matcher hits", () => {
    const root = workspaceRoot();
    const child = path.join(root, "packages", "feature");
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), [
      "/packages/feature/generated/",
      "packages/feature/objects/*.obj",
      "/packages/other/generated/",
      "packages/feature/root-only.txt",
      "!packages/feature/generated/keep.cpp",
      "**/vendor/**",
      "",
    ].join("\n"), "utf8");

    const patterns = resolveWorkspaceIgnorePatterns(child, { builtInIgnoreEnabled: false });

    expect(patterns).toEqual([
      ...SAFETY_IGNORE_PATTERNS,
      "generated/**",
      "objects/*.obj",
      "vendor/**",
      "**/vendor/**",
    ]);
    expect(shouldSkipDirName("generated", patterns)).toBe(false);
    expect(isIgnoredPath("generated/", patterns)).toBe(true);
    expect(isIgnoredPath("generated/output.cpp", patterns)).toBe(true);
    expect(isIgnoredPath("src/generated/output.cpp", patterns)).toBe(false);
    expect(isIgnoredPath("objects/output.obj", patterns)).toBe(true);
    expect(isIgnoredPath("src/objects/output.obj", patterns)).toBe(false);
    expect(isIgnoredPath("vendor/library.cpp", patterns)).toBe(true);
    expect(isIgnoredPath("thirdparty/vendor/library.cpp", patterns)).toBe(true);
    expect(isIgnoredPath("root-only.txt", patterns)).toBe(false);
    expect(isIgnoredPath("generated/keep.cpp", patterns)).toBe(true);
  });

  it("filters repository-root sibling rules before directory-name pruning", () => {
    const root = workspaceRoot();
    const child = path.join(root, "packages", "feature");
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), "/packages/other/generated/\n", "utf8");

    const patterns = resolveWorkspaceIgnorePatterns(child, { builtInIgnoreEnabled: false });

    expect(patterns).toEqual(SAFETY_IGNORE_PATTERNS);
    expect(shouldSkipDirName("generated", patterns)).toBe(false);
    expect(isIgnoredPath("generated/output.cpp", patterns)).toBe(false);
  });

  it("prefers the open unsaved plugin Ignore document", async () => {
    const root = workspaceRoot();
    const filename = path.join(root, ".phoenix", ".ignore");
    fs.writeFileSync(filename, "disk-cache/\n", "utf8");
    await appendIgnorePresetToDocument(root, "web");
    fs.writeFileSync(filename, "replacement-cache/\n", "utf8");

    const patterns = resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true });
    expect(patterns).toContain("disk-cache/");
    expect(patterns).toContain("node_modules/");
    expect(patterns).not.toContain("replacement-cache/");
  });

  it("deduplicates rules across built-in, git, and plugin layers", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), ".phoenix/\ndist/\ndist/\n", "utf8");
    fs.writeFileSync(path.join(root, ".phoenix", ".ignore"), "dist/\ncache/\ncache/\n", "utf8");

    expect(resolveWorkspaceIgnorePatterns(root, { customIgnoreEnabled: true })).toEqual([...SAFETY_IGNORE_PATTERNS, "dist/", "cache/"]);
  });

  it("exposes Git and Phoenix targets plus a source-aware merged rule list", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "build/\n*.obj\n", "utf8");
    fs.writeFileSync(path.join(root, ".phoenix", ".ignore"), "build\ncache/\n", "utf8");

    const summary = refreshIgnoreConfig(root)!;

    expect(summary.targets).toEqual([
      expect.objectContaining({
        target: "git",
        label: "Git Ignore",
        relativePath: ".gitignore",
        exists: true,
        available: true,
        patternCount: 2,
      }),
      expect.objectContaining({
        target: "phoenix",
        label: "Phoenix Ignore",
        relativePath: ".phoenix/.ignore",
        exists: true,
        available: true,
        patternCount: 2,
      }),
    ]);
    expect(summary.mergedRules).toEqual([
      expect.objectContaining({ value: "build/", sources: ["git"], presentIn: { git: true, phoenix: false } }),
      expect.objectContaining({ value: "*.obj", sources: ["git"], presentIn: { git: true, phoenix: false } }),
      expect.objectContaining({ value: "build", sources: ["phoenix"], presentIn: { git: false, phoenix: true } }),
      expect.objectContaining({ value: "cache/", sources: ["phoenix"], presentIn: { git: false, phoenix: true } }),
    ]);
  });

  it("summarizes all effective file rules instead of only Phoenix rules", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "build/\n*.tmp\n", "utf8");

    const gitOnly = refreshIgnoreConfig(root)!;
    expect(gitOnly.statusText).toBe("2 条有效规则");

    fs.writeFileSync(path.join(root, ".phoenix", ".ignore"), "cache/\n", "utf8");
    const combined = refreshIgnoreConfig(root)!;
    expect(combined.statusText).toBe("3 条有效规则");
  });

  it("uses the repository-root Git target and the selected-directory Phoenix target", () => {
    const root = workspaceRoot();
    const child = path.join(root, "packages", "feature");
    fs.mkdirSync(path.join(child, ".phoenix"), { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), "root-build/\n", "utf8");
    fs.writeFileSync(path.join(child, ".phoenix", ".ignore"), "feature-cache/\n", "utf8");

    const summary = refreshIgnoreConfig(child)!;

    expect(summary.targets[0]?.fullPath).toBe(path.join(root, ".gitignore"));
    expect(summary.targets[1]?.fullPath).toBe(path.join(child, ".phoenix", ".ignore"));
    expect(summary.mergedRules.map((rule) => rule.value)).toEqual(["root-build/", "feature-cache/"]);
  });

  it("recommendations respect an unsaved deletion from the Git Ignore buffer", async () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n", "utf8");

    const mutation = await applyIgnoreRulesToDocument(root, "git", "remove", ["node_modules/"]);
    expect(mutation.mutation.removedRules).toEqual(["node_modules/"]);
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toBe("node_modules/\n");

    const report = new KtcIgnoreRecommendationController().createReport(root);
    const webNode = report.recommendations.find((group) => group.groupId === "web-node");
    expect(webNode?.existingRules.map((rule) => rule.value)).not.toContain("node_modules/");
    expect(webNode?.suggestedRules.map((rule) => rule.value)).toContain("node_modules/");
  });

  it("recommendations use only the nearest Git root Ignore for a selected child directory", () => {
    const root = workspaceRoot();
    const child = path.join(root, "packages", "feature");
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n", "utf8");
    fs.writeFileSync(path.join(child, ".gitignore"), "dist/\n", "utf8");
    fs.writeFileSync(path.join(child, "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(child, "vite.config.ts"), "export default {};\n", "utf8");

    const report = new KtcIgnoreRecommendationController().createReport(child);
    const webNode = report.recommendations.find((group) => group.groupId === "web-node");
    const webOutput = report.recommendations.find((group) => group.groupId === "web-output");
    expect(webNode?.existingRules.map((rule) => rule.value)).toContain("node_modules/");
    expect(webOutput?.existingRules.map((rule) => rule.value)).not.toContain("dist/");
    expect(webOutput?.suggestedRules.map((rule) => rule.value)).toContain("dist/");
  });

  it("does not create a missing target for no-op removal but creates it for a real append", async () => {
    const root = workspaceRoot();
    const gitIgnore = path.join(root, ".gitignore");

    const removed = await applyIgnoreRulesToDocument(root, "git", "remove", ["missing/"]);
    expect(removed.mutation.removedRules).toEqual([]);
    expect(fs.existsSync(gitIgnore)).toBe(false);

    const appended = await applyIgnoreRulesToDocument(root, "git", "append", ["build/", "./build"]);
    expect(appended.mutation.addedRules).toEqual(["build/", "build"]);
    expect(fs.existsSync(gitIgnore)).toBe(true);
    expect(fs.readFileSync(gitIgnore, "utf8")).toBe("");
    expect(documents.find((document) => document.uri.fsPath === gitIgnore)?.getText()).toBe("build/\nbuild\n");
    expect(appended.summary.targets[0]).toMatchObject({ exists: true, dirty: true, patternCount: 2 });
  });

  it("uses exclusive target creation and never truncates an existing file", async () => {
    const root = workspaceRoot();
    const gitIgnore = path.join(root, ".gitignore");
    fs.writeFileSync(gitIgnore, "sentinel/\n", "utf8");

    const appended = await applyIgnoreRulesToDocument(root, "git", "append", ["build/"]);

    expect(fs.readFileSync(gitIgnore, "utf8")).toBe("sentinel/\n");
    expect(documents.find((document) => document.uri.fsPath === gitIgnore)?.getText())
      .toBe("sentinel/\nbuild/\n");
    expect(appended.mutation.addedRules).toEqual(["build/"]);
    const source = fs.readFileSync(new URL("./ignoreConfig.ts", import.meta.url), "utf8");
    expect(source).toContain('flag: "wx"');
  });

  it("routes explicit target preset changes without collapsing bare and directory rules", async () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n", "utf8");

    const result = await new KtcIgnoreController().handle({
      type: "applyIgnorePreset",
      presetId: "web",
      action: "append",
      target: "git",
    }, root);

    expect(result.error).toBeUndefined();
    expect(result.message).toContain(".gitignore");
    const text = documents.find((document) => document.uri.fsPath === path.join(root, ".gitignore"))?.getText() ?? "";
    expect(text).toContain("node_modules\n");
    expect(text).toContain("node_modules/\n");
    expect(text).toContain("dist/");
    expect(text).not.toContain("KT Auto Code preset:web");
  });

  it("validates rule-level recommendations and can add a Git-existing rule to Phoenix", async () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n", "utf8");
    const controller = new KtcIgnoreController();
    const analysis = await controller.handle({ type: "analyzeIgnore" }, root);
    const webNode = analysis.recommendations?.recommendations.find((group) => group.groupId === "web-node");
    expect(webNode?.existingRules.map((rule) => rule.value)).toContain("node_modules/");

    const applied = await controller.handle({
      type: "applyIgnoreRecommendations",
      target: "phoenix",
      action: "append",
      ruleValues: ["node_modules/"],
    }, root);

    expect(applied.error).toBeUndefined();
    expect(applied.message).toContain("已追加 1 条推荐规则");
    expect(applied.summary?.mergedRules.find((rule) => rule.normalizedValue === "node_modules/"))
      .toMatchObject({ sources: ["git", "phoenix"], presentIn: { git: true, phoenix: true } });
    expect(documents.find((document) => document.uri.fsPath === path.join(root, ".phoenix", ".ignore"))?.getText())
      .toContain("node_modules/");

    const stale = await controller.handle({
      type: "applyIgnoreRecommendations",
      target: "phoenix",
      action: "remove",
      ruleValues: ["not-in-report/"],
    }, root);
    expect(stale.error).toContain("推荐规则已经变化");
  });

  it("removes only the selected exact recommendation when bare and directory rules coexist", async () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "cache/\n", "utf8");
    fs.writeFileSync(path.join(root, ".phoenix", "ignore-rules.json"), JSON.stringify({
      version: 1,
      rules: [
        { id: "cache-bare", value: "cache", kind: "pattern", categories: ["custom-cache"], description: "裸规则" },
        { id: "cache-directory", value: "cache/", kind: "directory", categories: ["custom-cache"], description: "目录规则" },
      ],
      groups: [{
        id: "custom-cache",
        title: "缓存",
        description: "精确规则测试",
        ruleIds: ["cache-bare", "cache-directory"],
        includeCategories: [],
        excludeCategories: [],
        reviewRequired: false,
        defaultSelected: false,
      }],
    }), "utf8");
    const controller = new KtcIgnoreRecommendationController();
    const report = controller.createReport(root);
    const custom = report.recommendations.find((group) => group.groupId === "custom-cache");
    expect(custom?.suggestedRules.map((rule) => rule.value)).toContain("cache");
    expect(custom?.existingRules.map((rule) => rule.value)).toContain("cache/");

    const result = await controller.applyRules(root, report, "git", "remove", ["cache/"], () => {});

    expect(result.message).toContain("已去除 1 条推荐规则");
    expect(documents.find((document) => document.uri.fsPath === path.join(root, ".gitignore"))?.getText()).toBe("");
  });

  it("does not create the Phoenix directory or Ignore file while resolving", () => {
    const root = workspaceRoot();
    fs.rmSync(path.join(root, ".phoenix"), { recursive: true, force: true });

    expect(resolveWorkspaceIgnorePatterns(root)).toEqual(SAFETY_IGNORE_PATTERNS);
    expect(fs.existsSync(path.join(root, ".phoenix"))).toBe(false);
  });

  it("does not create plugin Ignore merely to render its status", () => {
    const root = workspaceRoot();
    fs.rmSync(path.join(root, ".phoenix"), { recursive: true, force: true });

    const summary = refreshIgnoreConfig(root);
    expect(summary).toMatchObject({ patternCount: 0, statusText: "未配置" });
    expect(summary?.builtInPatternCount).toBe(summary?.builtInPatterns.length);
    expect(summary?.builtInPatterns).toEqual(expect.arrayContaining([
      ".vs/",
      "build/",
      "importedinterfaces/",
      "node_modules/",
      "win_b64/",
    ]));
    expect(fs.existsSync(path.join(root, ".phoenix"))).toBe(false);
  });

  it("keeps all three selectable Ignore sources independent while retaining safety boundaries", () => {
    const root = workspaceRoot();
    fs.writeFileSync(path.join(root, ".gitignore"), "git-cache/\n", "utf8");
    fs.writeFileSync(path.join(root, ".phoenix", ".ignore"), "custom-cache/\n", "utf8");

    expect(resolveWorkspaceIgnorePatterns(root, {
      builtInIgnoreEnabled: false,
      gitIgnoreEnabled: false,
      customIgnoreEnabled: false,
    })).toEqual(SAFETY_IGNORE_PATTERNS);
    expect(resolveWorkspaceIgnorePatterns(root, {
      builtInIgnoreEnabled: true,
      gitIgnoreEnabled: false,
      customIgnoreEnabled: false,
    })).toEqual(SAFETY_IGNORE_PATTERNS);
    expect(resolveWorkspaceIgnorePatterns(root, {
      builtInIgnoreEnabled: false,
      gitIgnoreEnabled: true,
      customIgnoreEnabled: true,
    })).toEqual([...SAFETY_IGNORE_PATTERNS, "git-cache/", "custom-cache/"]);
  });

  it("does not create .phoenix/.ignore for an empty Primary custom draft", async () => {
    const root = workspaceRoot();
    fs.rmSync(path.join(root, ".phoenix"), { recursive: true, force: true });

    const summary = await savePrimaryCustomIgnorePatterns(root, []);

    expect(summary.patternCount).toBe(0);
    expect(fs.existsSync(path.join(root, ".phoenix", ".ignore"))).toBe(false);
  });

  it("saves non-empty Primary custom rules without copying .gitignore", async () => {
    const root = workspaceRoot();
    fs.rmSync(path.join(root, ".phoenix"), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, ".gitignore"), "git-only/\n", "utf8");

    const summary = await savePrimaryCustomIgnorePatterns(root, ["ImportedInterfaces/", "build/"]);
    const text = fs.readFileSync(path.join(root, ".phoenix", ".ignore"), "utf8");

    expect(summary.primaryCustomPatterns).toEqual(["ImportedInterfaces/", "build/"]);
    expect(text).toContain("ImportedInterfaces/");
    expect(text).not.toContain("git-only/");
  });
});
