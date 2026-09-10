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
  it("默认直达规则清理，只选择当前目录，附加目标需手动勾选", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration,
      defaultWorkingDirectory: "",
      platform: "darwin",
      enabled: true,
    });

    expect(model.selectedModeId).toBe("rules");
    expect(model.rulesYaml).toBe("- Kt*");
    expect(model.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
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

  it.each([["rules", "rules:working"], ["git-force", "git:working"], ["cmake", "cmake:shared"]] as const)(
    "%s 默认只选传入目录，不依赖 ROOT/3rdParty 或项目表", (mode, id) => {
      const model = ktcCreateAutoBuildCleanupViewModel({
        configuration: { ...configuration, workingDirectory: " ", rootDirectory: "", thirdPartyDirectory: "", projects: [] },
        defaultWorkingDirectory: "/workspace/incoming", platform: "darwin", enabled: true,
        state: { selectedModeId: mode },
      });
      expect(model.previewEnabled).toBe(true);
      expect(model.targets.filter(({ selected }) => selected)).toEqual([
        expect.objectContaining({ id, path: mode === "cmake" ? "/workspace/incoming/build" : "/workspace/incoming" }),
      ]);
    });

  it("当前目录与 ROOT 相同时保留当前目录，不出现重复目标", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration: { ...configuration, workingDirectory: configuration.rootDirectory },
      defaultWorkingDirectory: "", platform: "darwin", enabled: true,
    });
    expect(model.targets.filter((t) => t.supportedModeIds?.includes("rules"))).toEqual([
      expect.objectContaining({ id: "rules:working", label: "当前目录", selected: true }),
    ]);
  });

  it("没有传入目录时不把 ROOT 或第三方作为默认目标", () => {
    const model = ktcCreateAutoBuildCleanupViewModel({
      configuration: { ...configuration, workingDirectory: "" },
      defaultWorkingDirectory: "", platform: "darwin", enabled: true,
    });
    expect(model.targets.some(({ selected }) => selected)).toBe(false);
    expect(model.targets.some(({ id }) => id === "rules:root")).toBe(true);
    expect(model.previewEnabled).toBe(false);
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
