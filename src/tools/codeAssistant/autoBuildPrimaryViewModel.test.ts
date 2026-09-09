import { describe, expect, it } from "vitest";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import type { KtcAutoBuildConfiguration, KtcAutoBuildTask } from "./autoBuildContracts.js";
import { ktcCreateAutoBuildPrimaryViewModel } from "./autoBuildPrimaryViewModel.js";

const configuration: KtcAutoBuildConfiguration = {
  schemaVersion: 2,
  rootDirectory: "/workspace/Phoenix",
  thirdPartyDirectory: "/workspace/Phoenix-3rdParty",
  workingDirectory: "/workspace/Phoenix/projects",
  rootBranch: "develop",
  branch: "develop",
  cmakeBranch: "master",
  buildExecutionMode: "sequential",
  clean: false,
  projects: [
    {
      id: "core",
      enabled: true,
      name: "KtCore",
      path: "KtCore",
      branch: "develop",
      operations: { update: true, cmake: true, caa: false, linkCaa: false },
      probe: { capturedAt: "2026-09-07", branch: "develop", commit: "abc", origin: "origin", status: "clean" },
    },
    {
      id: "bom",
      enabled: true,
      name: "PNXBomAnalysisWsp",
      path: "PNXBomAnalysisWsp",
      branch: "develop",
      operations: { update: true, cmake: false, caa: true, linkCaa: true },
      probe: { capturedAt: "2026-09-07", branch: "develop", commit: "def", origin: "origin", status: "modified" },
    },
    {
      id: "disabled",
      enabled: false,
      name: "Disabled",
      path: "Disabled",
      branch: "develop",
      operations: { update: false, cmake: false, caa: false, linkCaa: false },
    },
  ],
};

const tasks: KtcAutoBuildTask[] = [
  { id: "one", name: "one", commandSummary: "one", phase: "repository", status: "done" },
  { id: "two", name: "two", commandSummary: "two", phase: "cmake", status: "in_progress" },
  { id: "three", name: "three", commandSummary: "three", phase: "caa", status: "error" },
];

describe("AutoBuild Primary view model", () => {
  it("只投影真实统计、配置脏状态、环境和维护摘要", () => {
    const model = ktcCreateAutoBuildPrimaryViewModel({
      configuration,
      tasks,
      currentPath: "/workspace/config/auto-build.local.json",
      recentPaths: [
        "/workspace/config/auto-build.local.json",
        "/workspace/config/auto-build.release.json",
      ],
      dirty: true,
      defaultWorkingDirectory: "",
      platform: "darwin",
      scriptStatus: { status: "different", source: "/extension/script.ps1", target: "/workspace/tools/script.ps1" },
      cleanupEnabled: true,
    });

    expect(model.metrics).toEqual([
      { label: "启用项目", value: "2 / 3" },
      { label: "任务", value: "1 / 3" },
      { label: "失败", value: "1" },
    ]);
    expect(model.configuration).toEqual({
      name: "auto-build.local.json",
      fullPath: "/workspace/config/auto-build.local.json",
      dirty: true,
      statusLabel: "有未保存修改",
      workingDirectoryMismatch: false,
      workingDirectoryMismatchMessage: "",
      recent: [
        {
          actionId: "selectRecent0",
          name: "auto-build.local.json",
          fullPath: "/workspace/config/auto-build.local.json",
          selected: true,
        },
        {
          actionId: "selectRecent1",
          name: "auto-build.release.json",
          fullPath: "/workspace/config/auto-build.release.json",
          selected: false,
        },
      ],
    });
    expect(model).not.toHaveProperty("projects");
    expect(model.environment).toEqual([
      { label: "工作目录", value: "/workspace/Phoenix/projects" },
      { label: "执行模式", value: "顺序：CMake → CAA" },
      { label: "平台", value: "macOS（检查）→ Windows 执行" },
    ]);
    expect(model.maintenance).toEqual({
      scriptStatus: "脚本不一致",
      scriptDetail: "/extension/script.ps1 → /workspace/tools/script.ps1",
    });
    expect(model.cleanup).toMatchObject({
      selectedModeId: "rules",
      rulesYaml: KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
      previewEnabled: true,
      executeEnabled: false,
    });
    expect(model.cleanup.targets.filter(({ selected }) => selected).map(({ id }) => id)).toEqual([
      "rules:root",
      "rules:working",
    ]);
  });

  it("没有配置时保持诚实的空状态，不写入 Preview fixture", () => {
    const model = ktcCreateAutoBuildPrimaryViewModel({
      tasks: [],
      currentPath: "",
      defaultWorkingDirectory: "/workspace/current",
      platform: "win32",
    });

    expect(model.metrics.map(({ value }) => value)).toEqual(["0 / 0", "0 / 0", "0"]);
    expect(model.configuration).toMatchObject({
      name: "未保存",
      fullPath: "",
      dirty: true,
      statusLabel: "尚未写盘",
      workingDirectoryMismatch: false,
      workingDirectoryMismatchMessage: "",
      recent: [],
    });
    expect(model).not.toHaveProperty("projects");
    expect(model.environment).toContainEqual({ label: "平台", value: "Windows · 本机执行" });
    expect(model.maintenance).toMatchObject({
      scriptStatus: "正在检查",
    });
    expect(model.cleanup).toMatchObject({ previewEnabled: false, executeEnabled: false });
  });

  it("保存配置默认不脏，并由 Host 显式 dirty 信号覆盖", () => {
    const saved = ktcCreateAutoBuildPrimaryViewModel({
      configuration,
      tasks: [],
      currentPath: "C:\\Phoenix\\auto-build.json",
      defaultWorkingDirectory: "",
      platform: "win32",
    });
    expect(saved.configuration).toMatchObject({
      name: "auto-build.json",
      dirty: false,
      statusLabel: "已保存",
    });

    const dirty = ktcCreateAutoBuildPrimaryViewModel({
      configuration,
      tasks: [],
      currentPath: "C:\\Phoenix\\auto-build.json",
      dirty: true,
      defaultWorkingDirectory: "",
      platform: "win32",
    });
    expect(dirty.configuration).toMatchObject({ dirty: true, statusLabel: "有未保存修改" });
  });

  it("投影工作目录基线冲突说明", () => {
    const model = ktcCreateAutoBuildPrimaryViewModel({
      configuration: { ...configuration, workingDirectory: "/workspace/new" },
      tasks: [],
      currentPath: "/workspace/config/auto-build.json",
      dirty: true,
      workingDirectoryMismatch: true,
      workingDirectoryBaseline: "/workspace/old",
      defaultWorkingDirectory: "",
      platform: "darwin",
    });
    expect(model.configuration).toMatchObject({
      workingDirectoryMismatch: true,
      workingDirectoryMismatchMessage: expect.stringContaining("/workspace/old"),
    });
    expect(model.configuration.workingDirectoryMismatchMessage).toContain("/workspace/new");
  });
});
