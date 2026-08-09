import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ktcListSearchReplaceDirectoryOptions } from "./searchReplaceDirectoryOptions.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("searchReplaceDirectoryOptions", () => {
  it("列出多根工作区和一级目录，并把 Git 子目录排在前面", () => {
    const first = mkdtempSync(join(tmpdir(), "kt-scope-a-"));
    const second = mkdtempSync(join(tmpdir(), "kt-scope-b-"));
    roots.push(first, second);
    mkdirSync(join(first, "plain"));
    mkdirSync(join(first, "repo", ".git"), { recursive: true });
    mkdirSync(join(first, "node_modules"));
    mkdirSync(join(second, "other"));

    const options = ktcListSearchReplaceDirectoryOptions([
      { name: "Phoenix", fsPath: first },
      { name: "Other", fsPath: second },
    ]);

    expect(options.map(({ value, label, kind }) => ({ value, label, kind }))).toEqual([
      { value: "", label: "当前目录 · Phoenix", kind: "current" },
      { value: "repo", label: "Git · Phoenix / repo", kind: "git" },
      { value: "plain", label: "目录 · Phoenix / plain", kind: "directory" },
      { value: second, label: "工作区 · Other", kind: "workspace" },
      { value: join(second, "other"), label: "目录 · Other / other", kind: "directory" },
    ]);
  });
});
