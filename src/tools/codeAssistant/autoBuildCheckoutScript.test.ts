import { describe, expect, it } from "vitest";
import { ktcCreateRepositoryCheckoutScript } from "./autoBuildCheckoutScript.js";

describe("repository checkout script", () => {
  const configuration = { schemaVersion: 2 as const, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/Third", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [], clean: false, repositorySnapshot: { capturedAt: "now", repositories: [
    { role: "ROOT_DIR", path: "E:/Root", branch: "develop", commit: "abc", origin: "ssh://root" },
    { role: "更新的库", path: "E:/App", branch: "master", commit: "def", origin: "ssh://app" },
  ] } };

  it("writes Git address first and omits roots and redundant names by default", () => {
    const source = ktcCreateRepositoryCheckoutScript(configuration);
    expect(source).toContain("git clone --branch 'master' 'ssh://app'");
    expect(source).not.toContain("ssh://root");
    expect(source).not.toContain("'App'");
    expect(source).not.toContain("Invoke-RepositoryCheckout.ps1");
  });

  it("can include roots and pin commits while retaining the branch", () => {
    const source = ktcCreateRepositoryCheckoutScript(configuration, { includeRoots: true, includeBranch: true, includeCommit: true });
    expect(source).toContain("git clone --branch 'develop' 'ssh://root'");
    expect(source).toContain("git -C 'Root' reset --hard 'abc'");
    expect(source).toContain("git -C 'Root' lfs pull");
    expect(source).toContain("git -C 'Root' submodule update --init --recursive");
  });
});
