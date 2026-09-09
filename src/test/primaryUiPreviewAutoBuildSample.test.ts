import { describe, expect, it } from "vitest";
import autoBuildSampleJson from "../../ui-preview/fixtures/auto-build.sample.json";
import {
  parsePreviewAutoBuildSample,
  PREVIEW_AUTO_BUILD_SAMPLE,
} from "../../ui-preview/src/previewAutoBuildSample.js";
import {
  createDefaultPreviewAutoBuildState,
  derivePreviewAutoBuildState,
  reducePreviewAutoBuildState,
} from "../../ui-preview/src/previewAutoBuildState.js";

describe("Primary UI preview AutoBuild sample", () => {
  it("加载独立 JSON 的完整 ready 快照并冻结解析结果", () => {
    expect(PREVIEW_AUTO_BUILD_SAMPLE).toMatchObject({
      schemaVersion: 1,
      initial: {
        phase: "preflightPassed",
        tone: "success",
        parallelBuild: false,
        probeColumnsVisible: true,
      },
      configuration: {
        currentConfigName: "未保存",
        updateRootDirectory: false,
        updateThirdParty: true,
      },
      primaryBlocks: { environmentExpanded: true, maintenanceExpanded: true },
    });
    expect(PREVIEW_AUTO_BUILD_SAMPLE.repositories.map(({ kind }) => kind)).toEqual([
      "Root",
      "3rdParty",
      "项目",
      "项目",
    ]);
    expect(PREVIEW_AUTO_BUILD_SAMPLE.repositories.every(({ operations }) => operations.length > 0)).toBe(true);
    expect(PREVIEW_AUTO_BUILD_SAMPLE.tasks).toHaveLength(4);
    expect(Object.isFrozen(PREVIEW_AUTO_BUILD_SAMPLE)).toBe(true);
    expect(Object.isFrozen(PREVIEW_AUTO_BUILD_SAMPLE.configuration)).toBe(true);
    expect(Object.isFrozen(PREVIEW_AUTO_BUILD_SAMPLE.repositories)).toBe(true);
    expect(Object.isFrozen(PREVIEW_AUTO_BUILD_SAMPLE.repositories[0]?.operations)).toBe(true);
  });

  it("修改解析输入会改变 Primary/Right 共用的派生投影", () => {
    const customInput = cloneSample();
    customInput.configuration.currentConfigName = "team-ready.json";
    customInput.initial.parallelBuild = true;
    customInput.environment.parallelExecution = "并行样例";
    customInput.maintenance.rootCleanupPatternsYaml = "- Artifact*\n- *.obj";
    customInput.maintenance.rootCleanupPreviewCount = 7;
    customInput.repositories[2]!.enabled = false;
    customInput.tasks[0]!.tone = "error";
    customInput.tasks.push({ id: "archive", name: "归档", detail: "样例任务", status: "待命", tone: "idle" });

    const sample = parsePreviewAutoBuildSample(customInput);
    const state = createDefaultPreviewAutoBuildState(sample);
    const view = derivePreviewAutoBuildState(state, sample);

    expect(state.currentConfigName).toBe("team-ready.json");
    expect(state.parallelBuild).toBe(true);
    expect(view.enabledProjectMetric).toBe("1 / 2");
    expect(view.taskProgress).toBe("0 / 5");
    expect(view.environmentExecutionMode).toBe("并行样例");
    expect(view.rightModeLabel).toBe("1 个启用 · 并行执行");

    const cleaned = reducePreviewAutoBuildState(state, { type: "cleanRoot" }, sample);
    expect(cleaned.state.cleanupStatus).toBe("已模拟清理 7 项");
    expect(cleaned.output).toContain("直属目录/文件规则 · 7 项");
  });

  it("拒绝缺字段、额外字段和重复 id，避免样例静默漂移", () => {
    const missing = cloneSample();
    delete (missing.configuration as Record<string, unknown>).rootBranch;
    expect(() => parsePreviewAutoBuildSample(missing)).toThrow("configuration is missing field: rootBranch");

    const additional = cloneSample();
    (additional.initial as Record<string, unknown>).unexpected = true;
    expect(() => parsePreviewAutoBuildSample(additional)).toThrow("initial contains unsupported field: unexpected");

    const duplicate = cloneSample();
    duplicate.repositories[1]!.id = duplicate.repositories[0]!.id;
    expect(() => parsePreviewAutoBuildSample(duplicate)).toThrow("duplicate repository id");
  });
});

function cloneSample(): MutableSample {
  return JSON.parse(JSON.stringify(autoBuildSampleJson)) as MutableSample;
}

interface MutableSample {
  schemaVersion: number;
  initial: Record<string, unknown> & { parallelBuild: boolean };
  configuration: Record<string, unknown> & { currentConfigName: string };
  environment: Record<string, unknown> & { parallelExecution: string };
  maintenance: Record<string, unknown> & {
    rootCleanupPatternsYaml: string;
    rootCleanupPreviewCount: number;
  };
  primaryBlocks: Record<string, unknown>;
  repositories: Array<Record<string, unknown> & { id: string; enabled: boolean }>;
  tasks: Array<Record<string, unknown> & { id: string; name: string; detail: string; status: string }>;
}
