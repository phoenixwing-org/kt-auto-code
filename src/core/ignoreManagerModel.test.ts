import { readFileSync } from "node:fs";
import { pnwCodeIsIgnoredPath, pnwCodeShouldSkipDirName } from "@phoenix-wing/code-core";
import { describe, expect, it } from "vitest";
import {
  ktcApplyIgnoreRuleMutation,
  ktcDedupeIgnoreRules,
  ktcMergeIgnoreRuleSources,
  ktcNormalizeIgnoreRule,
  ktcRelocateGitIgnoreRules,
} from "./ignoreManagerModel.js";

describe("ignoreManagerModel", () => {
  it("normalizes portable rule identity without erasing directory intent", () => {
    expect(ktcNormalizeIgnoreRule("  ./build\\  ")).toEqual({ value: "build/", key: "build", identity: "build/" });
    expect(ktcNormalizeIgnoreRule("build")).toEqual({ value: "build", key: "build", identity: "build" });
    expect(ktcNormalizeIgnoreRule("!build/")).toEqual({ value: "!build/", key: "!build", identity: "!build/" });
    expect(ktcNormalizeIgnoreRule(" # note ")).toBeUndefined();
    expect(ktcNormalizeIgnoreRule("   ")).toBeUndefined();
    expect(ktcNormalizeIgnoreRule("build/\nsecret/")).toBeUndefined();
    expect(ktcNormalizeIgnoreRule("build/\rsecret/")).toBeUndefined();
    expect(ktcNormalizeIgnoreRule("build/\0secret/")).toBeUndefined();
  });

  it("deduplicates exact semantic rules in stable order without collapsing directory intent", () => {
    expect(ktcDedupeIgnoreRules(["./build/", "build", "cache\\", "cache/", "*.obj"]))
      .toEqual(["build/", "build", "cache/", "*.obj"]);
  });

  it("relocates repository path rules without widening their selected-root scope", () => {
    expect(ktcRelocateGitIgnoreRules([
      "/packages/feature/generated/",
      "packages/feature/objects/*.obj",
      "packages/other/generated/",
      "packages/*/cache/",
      "packages/**/unsafe/",
      "packages/feature/**",
      "packages/feature/root-only.txt",
      "!packages/feature/generated/keep.cpp",
      "dist/",
      "*.tmp",
    ], "packages/feature")).toEqual([
      "generated/**",
      "objects/*.obj",
      "cache/**",
      "**",
      "dist/",
      "*.tmp",
    ]);
  });

  it("keeps exclamation-prefixed rules literal instead of activating Git negation", () => {
    expect(ktcRelocateGitIgnoreRules([
      "!packages/feature/keep.cpp",
      "!literal.cpp",
      "!/packages/feature/keep.cpp",
    ], "packages/feature")).toEqual(["!literal.cpp"]);
  });

  it("specializes portable globstar rules after consuming a repository prefix", () => {
    expect(ktcRelocateGitIgnoreRules([
      "**/vendor/**",
      "**/*.tmp",
      "**/build/",
      "**/",
    ], "packages/feature")).toEqual([
      "vendor/**",
      "**/vendor/**",
      "*.tmp",
      "build/**",
      "**/build/**",
      "**/",
    ]);
  });

  it("keeps root rules unchanged and rejects a scan root outside the repository", () => {
    const rules = ["/root-only/", "nested/file.txt", "!literal/"];
    expect(ktcRelocateGitIgnoreRules(rules, "")).toEqual(rules);
    expect(ktcRelocateGitIgnoreRules(rules, "../outside")).toEqual([]);
  });

  it("merges Git and Phoenix rules with explicit source membership", () => {
    expect(ktcMergeIgnoreRuleSources([
      { source: "git", text: "# Git\nbuild/\n*.obj\n" },
      { source: "phoenix", text: "build\ncache/\ncache/\n" },
    ])).toEqual([
      {
        value: "build/",
        normalizedValue: "build/",
        sources: ["git"],
        presentIn: { git: true, phoenix: false },
      },
      {
        value: "*.obj",
        normalizedValue: "*.obj",
        sources: ["git"],
        presentIn: { git: true, phoenix: false },
      },
      {
        value: "build",
        normalizedValue: "build",
        sources: ["phoenix"],
        presentIn: { git: false, phoenix: true },
      },
      {
        value: "cache/",
        normalizedValue: "cache/",
        sources: ["phoenix"],
        presentIn: { git: false, phoenix: true },
      },
    ]);
  });

  it("appends only missing individual rules and preserves handwritten bytes", () => {
    const source = "# handwritten\nmanual/\nbuild\n\n# keep this comment\n";
    const result = ktcApplyIgnoreRuleMutation(source, "append", ["build/", "cache/", "cache"]);
    expect(result.text).toBe(`${source}build/\ncache/\ncache\n`);
    expect(result.addedRules).toEqual(["build/", "cache/", "cache"]);
    expect(result.unchangedRules).toEqual([]);
    expect(result.removedRules).toEqual([]);
  });

  it("removes only the selected semantic rule and protects comments, bare rules, and unrelated rules", () => {
    const source = [
      "# build/ stays as documentation",
      "manual/",
      "./build/",
      "cache/",
      "build",
      "# unrelated footer",
      "",
    ].join("\n");
    const result = ktcApplyIgnoreRuleMutation(source, "remove", ["build/"]);
    expect(result.text).toBe([
      "# build/ stays as documentation",
      "manual/",
      "cache/",
      "build",
      "# unrelated footer",
      "",
    ].join("\n"));
    expect(result.removedRules).toEqual(["build/"]);
    expect(result.unchangedRules).toEqual([]);
  });

  it("keeps CRLF when appending and when removing a selected rule", () => {
    const appended = ktcApplyIgnoreRuleMutation("# note\r\nbuild/\r\n", "append", ["cache/"]);
    expect(appended.text).toBe("# note\r\nbuild/\r\ncache/\r\n");
    expect(appended.text.replace(/\r\n/g, "")).not.toContain("\n");

    const removed = ktcApplyIgnoreRuleMutation(appended.text, "remove", ["build/"]);
    expect(removed.text).toBe("# note\r\ncache/\r\n");
  });

  it("does not mutate text for empty, invalid, or already-satisfied operations", () => {
    const source = "# comment\nbuild/\n";
    expect(ktcApplyIgnoreRuleMutation(source, "append", ["build/", "# nope", " "])).toMatchObject({
      text: source,
      addedRules: [],
      unchangedRules: ["build/"],
      invalidRules: ["# nope", " "],
    });
    expect(ktcApplyIgnoreRuleMutation(source, "remove", ["missing/"]).text).toBe(source);
    expect(ktcApplyIgnoreRuleMutation(source, "append", ["cache/\nsecret/"])).toMatchObject({
      text: source,
      addedRules: [],
      invalidRules: ["cache/\nsecret/"],
    });
  });

  it("keeps Wing directory pruning rules distinct from bare path rules during writes", () => {
    expect(pnwCodeShouldSkipDirName("foo", ["foo/"])).toBe(true);
    expect(pnwCodeShouldSkipDirName("foo", ["foo"])).toBe(false);
    expect(pnwCodeIsIgnoredPath("foo/child.txt", ["foo/"])).toBe(true);
    expect(pnwCodeIsIgnoredPath("foo/child.txt", ["foo"])).toBe(false);

    expect(ktcMergeIgnoreRuleSources([
      { source: "git", text: "foo/\n" },
      { source: "phoenix", text: "foo\n" },
    ])).toEqual([
      {
        value: "foo/",
        normalizedValue: "foo/",
        sources: ["git"],
        presentIn: { git: true, phoenix: false },
      },
      {
        value: "foo",
        normalizedValue: "foo",
        sources: ["phoenix"],
        presentIn: { git: false, phoenix: true },
      },
    ]);

    const appended = ktcApplyIgnoreRuleMutation("foo\n", "append", ["foo/", "foo"]);
    expect(appended.text).toBe("foo\nfoo/\n");
    expect(appended.addedRules).toEqual(["foo/"]);
    expect(appended.unchangedRules).toEqual(["foo"]);

    const removedDirectory = ktcApplyIgnoreRuleMutation(appended.text, "remove", ["foo/"]);
    expect(removedDirectory.text).toBe("foo\n");
    expect(removedDirectory.removedRules).toEqual(["foo/"]);

    const removedBare = ktcApplyIgnoreRuleMutation("foo\nfoo/\n", "remove", ["foo"]);
    expect(removedBare.text).toBe("foo/\n");
    expect(removedBare.removedRules).toEqual(["foo"]);
  });
});

describe("ignoreManagerModel architecture", () => {
  it("stays data-only for later Wing / Desk Tools migration", () => {
    const source = readFileSync(new URL("./ignoreManagerModel.ts", import.meta.url), "utf8");
    expect(source).not.toContain('from "vscode"');
    expect(source).not.toContain('from "node:fs"');
    expect(source).not.toContain('from "node:path"');
  });
});
