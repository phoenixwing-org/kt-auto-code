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
  appendIgnorePresetToDocument,
  invalidateWorkspaceIgnorePatterns,
  resolveWorkspaceIgnorePatterns,
} from "./ignoreConfig.js";
import { KtcIgnoreController, ktcDefaultIgnoreGroupIds, ktcIsIgnoreMessage } from "./ignoreController.js";

const tempRoots: string[] = [];

function workspaceRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ktc-ignore-config-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, ".phoenix"), { recursive: true });
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
    expect(ktcIsIgnoreMessage({ type: "applyIgnoreRecommendations", groupIds: ["build-cache"] })).toBe(true);
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "invalid", action: "append" } as never)).toBe(false);
    expect(ktcIsIgnoreMessage({ type: "applyIgnorePreset", presetId: "cpp", action: "replace" } as never)).toBe(false);
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

  it("refreshes cached disk rules after the save listener invalidates them", () => {
    const root = workspaceRoot();
    const filename = path.join(root, ".phoenix", ".ignore");
    fs.writeFileSync(filename, "alpha-cache/\n", "utf8");
    expect(resolveWorkspaceIgnorePatterns(root)).toContain("alpha-cache/");

    fs.writeFileSync(filename, "bravo-cache/\n", "utf8");
    invalidateWorkspaceIgnorePatterns(root);
    expect(resolveWorkspaceIgnorePatterns(root)).toEqual(expect.arrayContaining([".phoenix/", "bravo-cache/"]));
    expect(resolveWorkspaceIgnorePatterns(root)).not.toContain("alpha-cache/");
  });
});
