import { describe, expect, it } from "vitest";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import { ktcCreateAutoBuildCleanupViewModel } from "./autoBuildCleanupViewModel.js";

const configuration: KtcAutoBuildConfiguration = {
  schemaVersion: 2,
  rootDirectory: "/workspace/Phoenix",
  thirdPartyDirectory: "/workspace/Phoenix-3rdParty",
  rootEnabled: true,
  thirdPartyEnabled: true,
  updateRoot: false,
  updateThirdParty: false,
  workingDirectory: "/workspace/Phoenix/projects",
  rootBranch: "develop",
  branch: "develop",
  cmakeBranch: "master",
  buildExecutionMode: "sequential",
  clean: false,
  rootCleanupYaml: "- Kt*",
  projects: [
    {
      id: "core",
      enabled: true,
      name: "KtCore",
      path: "KtCore",
      branch: "develop",
      operations: { update: true, cmake: true, caa: false, linkCaa: false },
    },
    {
      id: "disabled",
      enabled: false,
      name: "Disabled",
      path: "Disabled",
      branch: "develop",
      operations: { update: true, cmake: true, caa: false, linkCaa: false },
    },
  ],
};

describe("AutoBuild cleanup dialog projection", () => {
  it("默认直达规则清理，并只选择 ROOT 与工作目录", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration,
      defaultWorkingDirectory: "",
      platform: "darwin",
      enabled: true,
    });

    expect(model.selectedModeId).toBe("rules");
    expect(model.rulesYaml).toBe("- Kt*");
    expect(model.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
      "rules:root",
      "rules:working",
    ]);
    expect(model.targets.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "git:root",
      "git:third-party",
      "git:project:core",
      "cmake:project:core",
      "cmake:shared",
    ]));
    expect(model.targets.some(({ id }) => id.includes("disabled"))).toBe(false);
  });

  it("保留用户选择，并且只有 ready token 可以执行", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration,
      defaultWorkingDirectory: "",
      platform: "linux",
      enabled: true,
      state: {
        selectedModeId: "git-force",
        selectedTargetIds: ["git:project:core"],
        preview: { state: "ready", token: "frozen", items: ["tracked"] },
      },
    });

    expect(model.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
      "git:project:core",
    ]);
    expect(model.executeEnabled).toBe(true);
    expect(model.preview).toMatchObject({ state: "ready", token: "frozen" });
  });

  it("在当前 Host 无法访问路径时禁用目标", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration: {
        ...configuration,
        rootDirectory: "C:\\Phoenix",
        thirdPartyDirectory: "C:\\Phoenix-3rdParty",
        workingDirectory: "C:\\Phoenix\\projects",
        projects: [],
      },
      defaultWorkingDirectory: "",
      platform: "darwin",
      enabled: true,
    });

    expect(model.previewEnabled).toBe(false);
    expect(model.targets.every(({ disabled }) => disabled)).toBe(true);
  });
});
