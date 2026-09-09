import { describe, expect, it } from "vitest";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import { ktcCloneAutoBuildConfiguration, ktcIsAutoBuildConfiguration } from "./autoBuildDraftContracts.js";

function configuration(): KtcAutoBuildConfiguration {
  return {
    schemaVersion: 2,
    rootDirectory: "E:/Phoenix",
    thirdPartyDirectory: "E:/Phoenix-3rdParty",
    updateRoot: false,
    updateThirdParty: true,
    workingDirectory: "E:/Phoenix/projects",
    rootBranch: "develop",
    branch: "develop",
    cmakeBranch: "master",
    buildExecutionMode: "parallel",
    clean: false,
    projects: [{
      id: "kt-core",
      enabled: true,
      name: "KtCore",
      path: "KtCore",
      branch: "develop",
      operations: { update: true, cmake: true, caa: false, linkCaa: false },
      probe: {
        capturedAt: "2026-09-08T00:00:00.000Z",
        branch: "develop",
        commit: "abc123",
        origin: "ssh://example/kt-core.git",
        status: "clean",
      },
    }],
    repositorySnapshot: {
      capturedAt: "2026-09-08T00:00:00.000Z",
      repositories: [{
        role: "ROOT_DIR",
        path: "E:/Phoenix",
        branch: "develop",
        commit: "abc123",
        origin: "ssh://example/phoenix.git",
        hasChanges: false,
      }],
    },
  };
}

describe("AutoBuild Webview draft contracts", () => {
  it("keeps legacy schema-v2 Root rows enabled when the new flags are absent", () => {
    const source = configuration();
    delete source.rootEnabled;
    delete source.thirdPartyEnabled;
    expect(ktcIsAutoBuildConfiguration(source)).toBe(true);
    expect(ktcCloneAutoBuildConfiguration(source)).not.toHaveProperty("rootEnabled");
    expect(ktcCloneAutoBuildConfiguration(source).rootCleanupYaml).toBe(KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML);
  });

  it("accepts the complete schema v2 draft and clones its nested mutable state", () => {
    const source = configuration();
    expect(ktcIsAutoBuildConfiguration(source)).toBe(true);
    const clone = ktcCloneAutoBuildConfiguration(source);
    source.projects[0]!.operations.cmake = false;
    expect(clone.projects[0]!.operations.cmake).toBe(true);
  });

  it.each([
    ["unknown build mode", { buildExecutionMode: "unordered" }],
    ["non-boolean update flag", { updateRoot: "yes" }],
    ["non-boolean Root enable flag", { rootEnabled: "yes" }],
    ["non-boolean 3rdParty enable flag", { thirdPartyEnabled: 1 }],
    ["invalid project probe", { projects: [{ ...configuration().projects[0], probe: { status: "surprise" } }] }],
    ["invalid repository snapshot", { repositorySnapshot: { capturedAt: "now", repositories: [{ role: "ROOT_DIR" }] } }],
  ])("rejects %s from the Webview boundary", (_label, override) => {
    expect(ktcIsAutoBuildConfiguration({ ...configuration(), ...override })).toBe(false);
  });

  it("bounds untrusted collections and strings", () => {
    expect(ktcIsAutoBuildConfiguration({
      ...configuration(),
      projects: Array.from({ length: 501 }, () => configuration().projects[0]),
    })).toBe(false);
    expect(ktcIsAutoBuildConfiguration({
      ...configuration(),
      rootDirectory: "x".repeat(32_769),
    })).toBe(false);
    expect(ktcIsAutoBuildConfiguration({
      ...configuration(),
      rootCleanupYaml: "x".repeat(4_097),
    })).toBe(false);
  });
});
