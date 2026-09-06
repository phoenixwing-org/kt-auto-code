import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectReleaseTarget,
  parseReleaseTargetArgs,
  pnpmVersionInvocation,
  readFirstChangelogVersion,
  runReleaseTargetPreflight,
  validateReleaseTarget,
  type ReleaseTargetState,
} from "../scripts/verify-release-target.mjs";

const temporaryRoots: string[] = [];
const commit = "0123456789abcdef0123456789abcdef01234567";

function validTarget(overrides: Partial<ReleaseTargetState> = {}): ReleaseTargetState {
  return {
    packageVersion: "0.8.3",
    changelogVersion: "0.8.3",
    headCommit: commit,
    detachedHead: true,
    worktreeStatus: "",
    nodeVersion: "22.23.1",
    packageManager: "pnpm@10.15.1",
    pnpmVersion: "10.15.1",
    leakedEnvironmentVariables: [],
    ...overrides,
  };
}

function createReleaseRepository() {
  const root = mkdtempSync(join(tmpdir(), "kt-auto-release-target-"));
  temporaryRoots.push(root);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({
    version: "0.8.3",
    packageManager: "pnpm@10.15.1",
  }, null, 2)}\n`);
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n\n## 0.8.3（发布候选）\n\n- candidate\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "package.json", "CHANGELOG.md"], { cwd: root });
  execFileSync("git", [
    "-c", "user.name=Release Test", "-c", "user.email=release-test@example.invalid",
    "commit", "--quiet", "-m", "release fixture",
  ], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release target preflight", () => {
  it("requires explicit exact version and full commit arguments", () => {
    expect(parseReleaseTargetArgs([
      "--expected-version", "0.8.3", `--expected-commit=${commit}`,
    ])).toEqual({ help: false, expectedVersion: "0.8.3", expectedCommit: commit });
    expect(() => parseReleaseTargetArgs(["--expected-version", "0.8.3"]))
      .toThrow(/requires both/u);
    expect(() => parseReleaseTargetArgs([
      "--expected-version", "0.8.3", "--expected-commit", "0123456",
    ])).toThrow(/full lowercase Git OID/u);
  });

  it("reads a release-candidate heading and rejects development or non-version first sections", () => {
    expect(readFirstChangelogVersion("# Changelog\r\n\r\n## 0.8.3（发布候选）\r\n"))
      .toBe("0.8.3");
    expect(() => readFirstChangelogVersion("\uFEFF# Changelog\r\n\r\n## 0.8.3（开发中）\r\n"))
      .toThrow(/still marked as development/u);
    expect(() => readFirstChangelogVersion("# Changelog\n\n## 0.8.3 ( 开发中 )\n"))
      .toThrow(/still marked as development/u);
    expect(() => readFirstChangelogVersion("# Changelog\n\n## Unreleased\n\n## 0.8.3\n"))
      .toThrow(/first level-2 heading/u);
  });

  it("在 Windows 通过 cmd 启动 pnpm shim", () => {
    expect(pnpmVersionInvocation("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm --version"],
    });
    expect(pnpmVersionInvocation("linux", {})).toEqual({ command: "pnpm", args: ["--version"] });
  });

  it("accepts only a fully aligned release target", () => {
    expect(() => validateReleaseTarget(validTarget(), {
      expectedVersion: "0.8.3",
      expectedCommit: commit,
    })).not.toThrow();
  });

  it.each([
    ["package version", { packageVersion: "0.8.2" }, /package\.json version/u],
    ["changelog version", { changelogVersion: "0.8.2" }, /CHANGELOG\.md first version/u],
    ["HEAD", { headCommit: "f".repeat(40) }, /current HEAD/u],
    ["attached branch", { detachedHead: false }, /HEAD must be detached/u],
    ["dirty worktree", { worktreeStatus: " M package.json" }, /worktree must be clean/u],
    ["Node major", { nodeVersion: "23.7.0" }, /Node major must be 22/u],
    ["packageManager range", { packageManager: "pnpm@^10.15.1" }, /must pin an exact pnpm version/u],
    ["pnpm runtime", { pnpmVersion: "10.14.0" }, /pnpm must equal packageManager version/u],
    ["local Wing root", { leakedEnvironmentVariables: ["PHOENIX_WING_ROOT"] }, /local Wing environment must be absent/u],
  ])("rejects a mismatched %s", (_label, overrides, message) => {
    expect(() => validateReleaseTarget(validTarget(overrides), {
      expectedVersion: "0.8.3",
      expectedCommit: commit,
    })).toThrow(message);
  });

  it("rejects an attached branch, then accepts the same commit in detached release mode", () => {
    const root = createReleaseRepository();
    const attached = inspectReleaseTarget({
      root,
      environment: {},
      nodeVersion: "22.23.1",
      pnpmVersion: "10.15.1",
    });
    expect(attached).toMatchObject({
      packageVersion: "0.8.3",
      changelogVersion: "0.8.3",
      detachedHead: false,
      worktreeStatus: "",
      leakedEnvironmentVariables: [],
    });
    expect(() => runReleaseTargetPreflight({
      root,
      argv: ["--expected-version", "0.8.3", "--expected-commit", attached.headCommit],
      environment: {},
      nodeVersion: "22.23.1",
      pnpmVersion: "10.15.1",
    })).toThrow(/HEAD must be detached/u);

    execFileSync("git", ["switch", "--detach", "--quiet", attached.headCommit], { cwd: root });
    const clean = inspectReleaseTarget({
      root,
      environment: {},
      nodeVersion: "22.23.1",
      pnpmVersion: "10.15.1",
    });
    expect(clean.detachedHead).toBe(true);
    expect(clean.headCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(runReleaseTargetPreflight({
      root,
      argv: ["--expected-version", "0.8.3", "--expected-commit", clean.headCommit],
      environment: {},
      nodeVersion: "22.23.1",
      pnpmVersion: "10.15.1",
    })).toMatchObject({ help: false, expectedVersion: "0.8.3", expectedCommit: clean.headCommit });

    writeFileSync(join(root, "untracked.txt"), "dirty\n");
    const dirty = inspectReleaseTarget({
      root,
      environment: { PHOENIX_WING_ROOT: "" },
      nodeVersion: "22.23.1",
      pnpmVersion: "10.15.1",
    });
    expect(dirty.worktreeStatus).toContain("?? untracked.txt");
    expect(dirty.leakedEnvironmentVariables).toEqual(["PHOENIX_WING_ROOT"]);
  });

  it("keeps the target-specific preflight out of parameterless aggregate gates", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.scripts["release:preflight"]).toBe("node scripts/verify-release-target.mjs");
    expect(manifest.scripts["release:check"]).toBe("pnpm verify:ci");
    expect(manifest.scripts["release:check"]).not.toContain("release:preflight");
    expect(manifest.scripts["verify:ci"]).not.toContain("release:preflight");
  });
});
