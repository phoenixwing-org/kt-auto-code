import { describe, expect, it } from "vitest";
import {
  createDefaultPreviewAutoBuildState,
  derivePreviewAutoBuildState,
  reducePreviewAutoBuildState,
} from "../../ui-preview/src/previewAutoBuildState.js";

describe("Primary UI preview AutoBuild state", () => {
  it("固定执行顺序，并把预检成功与任务完成分开", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const initialView = derivePreviewAutoBuildState(initial);

    expect(initialView.executionActions).toEqual([
      { actionId: "openScript", label: "脚本", primary: false, disabled: false },
      { actionId: "preflight", label: "预检配置", primary: false, disabled: false },
      { actionId: "start", label: "启动", primary: true, disabled: false },
      { actionId: "stop", label: "停止", primary: false, disabled: true },
      { actionId: "openCleanup", label: "清理", primary: false, disabled: false },
    ]);
    expect(initialView.taskProgress).toBe("0 / 4");
    expect(initial).toMatchObject({ environmentExpanded: true, maintenanceExpanded: true });

    const preflight = reducePreviewAutoBuildState(initial, { type: "preflight" });
    expect(preflight.state).toMatchObject({
      phase: "preflightPassed",
      status: "预检通过",
      tone: "success",
    });
    expect(preflight.output).toContain("预检通过：2 个项目");
    expect(derivePreviewAutoBuildState(preflight.state).taskProgress).toBe("0 / 4");
  });

  it("按当前模式启动、锁定运行期动作，并只允许运行中的任务停止", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const running = reducePreviewAutoBuildState(initial, { type: "start" });
    const runningView = derivePreviewAutoBuildState(running.state);

    expect(running.state).toMatchObject({ phase: "running", status: "运行中", tone: "progress" });
    expect(running.output).toContain("CMake → CAA（顺序执行）");
    expect(runningView.taskProgress).toBe("1 / 4");
    expect(runningView.executionActions.map(({ disabled }) => disabled)).toEqual([false, true, true, false, true]);
    expect(runningView.parallelDisabled).toBe(true);
    expect(runningView.recentConfigDisabled).toBe(true);
    expect(runningView.maintenanceActionsDisabled).toBe(true);
    expect(runningView.rightRunLabel).toBe("停止");
    expect(runningView.rightTaskStatus).toBe("进行中");

    const repeatedStart = reducePreviewAutoBuildState(running.state, { type: "start" });
    const runningPreflight = reducePreviewAutoBuildState(running.state, { type: "preflight" });
    expect(repeatedStart.state).toBe(running.state);
    expect(repeatedStart.output).toBeUndefined();
    expect(runningPreflight.state).toBe(running.state);
    expect(runningPreflight.output).toBeUndefined();

    const stopped = reducePreviewAutoBuildState(running.state, { type: "stop" });
    expect(stopped.state).toMatchObject({ phase: "stopped", status: "已停止", tone: "warning" });
    expect(stopped.output).toContain("停止全部任务");
    expect(derivePreviewAutoBuildState(stopped.state).rightRunLabel).toBe("运行");

    const repeatedStop = reducePreviewAutoBuildState(stopped.state, { type: "stop" });
    expect(repeatedStop.state).toBe(stopped.state);
    expect(repeatedStop.output).toBeUndefined();
  });

  it("并行选择同时投影到 Primary 工程环境、Right 摘要与启动输出", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const parallel = reducePreviewAutoBuildState(initial, { type: "setParallel", enabled: true });
    const parallelView = derivePreviewAutoBuildState(parallel.state);

    expect(parallel.state.parallelBuild).toBe(true);
    expect(parallel.output).toContain("并行编译");
    expect(parallelView.environmentExecutionMode).toBe("并行：CMake + CAA");
    expect(parallelView.rightModeLabel).toBe("2 个启用 · 并行执行");

    const running = reducePreviewAutoBuildState(parallel.state, { type: "start" });
    expect(running.output).toContain("CMake + CAA（并行执行）");

    const rejectedChange = reducePreviewAutoBuildState(running.state, { type: "setParallel", enabled: false });
    expect(rejectedChange.state).toBe(running.state);
    expect(rejectedChange.output).toBeUndefined();
  });

  it("最近配置忽略空值和运行期切换，合法选择回到 idle，保存沿用原型行为", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const empty = reducePreviewAutoBuildState(initial, { type: "selectRecent", name: "   " });
    expect(empty.state).toBe(initial);

    const running = reducePreviewAutoBuildState(initial, { type: "start" }).state;
    const whileRunning = reducePreviewAutoBuildState(running, {
      type: "selectRecent",
      name: "auto-build.release.json",
    });
    expect(whileRunning.state).toBe(running);
    expect(whileRunning.output).toBeUndefined();

    const stopped = reducePreviewAutoBuildState(running, { type: "stop" }).state;
    const selected = reducePreviewAutoBuildState(stopped, {
      type: "selectRecent",
      name: "  auto-build.release.json  ",
    });
    expect(selected.state).toMatchObject({
      phase: "idle",
      currentConfigName: "auto-build.release.json",
      status: "配置已切换",
      tone: "idle",
    });
    expect(selected.output).toContain("打开最近配置：auto-build.release.json");

    const saved = reducePreviewAutoBuildState(selected.state, { type: "saveConfig" });
    expect(saved.state.currentConfigName).toBe("auto-build.local.json");
    expect(saved.output).toContain("未写盘");
  });

  it("手动清理 Root 要求结构化 YAML、固定按钮文案、限制长度且运行期绝不执行", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const whitespace = reducePreviewAutoBuildState(initial, { type: "setCleanupPatternsYaml", value: "   " }).state;
    expect(derivePreviewAutoBuildState(whitespace).cleanupPreviewDisabled).toBe(true);
    const missingRules = reducePreviewAutoBuildState(whitespace, { type: "cleanRoot" });
    expect(missingRules.state).toBe(whitespace);
    expect(missingRules.output).toBeUndefined();

    const limited = reducePreviewAutoBuildState(initial, {
      type: "setCleanupPatternsYaml",
      value: "A".repeat(4_200),
    }).state;
    expect(limited.cleanupPatternsYaml).toHaveLength(4_096);

    const entered = reducePreviewAutoBuildState(initial, {
      type: "setCleanupPatternsYaml",
      value: "- Core*\n- *.obj",
    }).state;
    expect(derivePreviewAutoBuildState(entered).cleanupPreviewDisabled).toBe(false);
    const previewed = reducePreviewAutoBuildState(entered, { type: "cleanRoot" });
    expect(previewed.state.cleanupStatus).toBe("已模拟清理 12 项");
    expect(previewed.output).toContain("直属目录/文件规则 · 12 项；未删除真实文件");

    const edited = reducePreviewAutoBuildState(previewed.state, {
      type: "setCleanupPatternsYaml",
      value: "- CAA*",
    });
    expect(edited.state.cleanupStatus).toBe("待确认规则");
    expect(derivePreviewAutoBuildState(edited.state).cleanupActionLabel).toBe("清理");

    const running = reducePreviewAutoBuildState(entered, { type: "start" }).state;
    const blockedCleanup = reducePreviewAutoBuildState(running, { type: "cleanRoot" });
    const blockedSync = reducePreviewAutoBuildState(running, { type: "syncScript" });
    const blockedRepositoryCleanup = reducePreviewAutoBuildState(running, { type: "cleanRepositories" });
    expect(blockedCleanup.state).toBe(running);
    expect(blockedCleanup.output).toBeUndefined();
    expect(blockedSync.state).toBe(running);
    expect(blockedSync.output).toBeUndefined();
    expect(blockedRepositoryCleanup.state).toBe(running);
    expect(blockedRepositoryCleanup.output).toBeUndefined();
  });

  it("仓库清理与 Root 规则清理分离，并让探测列/更新选项共享状态守卫", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const repositoryCleanup = reducePreviewAutoBuildState(initial, { type: "cleanRepositories" });
    expect(repositoryCleanup.state.repositoryCleanupStatus).toBe("已模拟");
    expect(repositoryCleanup.state.cleanupStatus).toBe(initial.cleanupStatus);
    expect(repositoryCleanup.output).toContain("手动触发仓库清理（模拟）");

    const hiddenProbeColumns = reducePreviewAutoBuildState(repositoryCleanup.state, {
      type: "setProbeColumnsVisible",
      visible: false,
    });
    expect(hiddenProbeColumns.state.probeColumnsVisible).toBe(false);
    expect(hiddenProbeColumns.output).toContain("隐藏 Commit / Origin / 状态探测列");

    const updateRoot = reducePreviewAutoBuildState(hiddenProbeColumns.state, {
      type: "setRepositoryUpdate",
      target: "root",
      enabled: true,
    });
    expect(updateRoot.state).toMatchObject({ updateRootDirectory: true, updateThirdParty: true });

    const running = reducePreviewAutoBuildState(updateRoot.state, { type: "start" }).state;
    const blockedUpdate = reducePreviewAutoBuildState(running, {
      type: "setRepositoryUpdate",
      target: "thirdParty",
      enabled: false,
    });
    expect(blockedUpdate.state).toBe(running);
    expect(blockedUpdate.output).toBeUndefined();
  });

  it("Root 与 3rdParty 固定行可以独立反选，且运行中锁定", () => {
    const initial = createDefaultPreviewAutoBuildState();
    const disabledRoot = reducePreviewAutoBuildState(initial, {
      type: "setRepositoryEnabled",
      target: "root",
      enabled: false,
    });
    expect(disabledRoot.state).toMatchObject({ rootEnabled: false, thirdPartyEnabled: true });
    expect(disabledRoot.output).toContain("停用仓库 ROOT_DIR");

    const reenabledRoot = reducePreviewAutoBuildState(disabledRoot.state, {
      type: "setRepositoryEnabled",
      target: "root",
      enabled: true,
    });
    expect(reenabledRoot.state.rootEnabled).toBe(true);

    const running = reducePreviewAutoBuildState(disabledRoot.state, { type: "start" }).state;
    const blocked = reducePreviewAutoBuildState(running, {
      type: "setRepositoryEnabled",
      target: "thirdParty",
      enabled: false,
    });
    expect(blocked.state).toBe(running);
    expect(blocked.output).toBeUndefined();
  });

});
