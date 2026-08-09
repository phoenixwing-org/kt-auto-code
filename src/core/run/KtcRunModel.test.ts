import { describe, expect, it } from "vitest";
import { KtcCreateRunModel, type KtcRunTargetInput } from "./KtcRunModel.js";

const target = (overrides: Partial<KtcRunTargetInput>): KtcRunTargetInput => ({
  id: "target",
  projectId: "project",
  title: "Build",
  action: "cmake-build",
  sourceKind: "bundled",
  relativePath: "CMakeLists.txt",
  platforms: ["win32", "darwin", "linux"],
  cwd: "/workspace/KtCore",
  args: [],
  envKeys: [],
  problemMatchers: [],
  matcherFidelity: "none",
  risk: "normal",
  ...overrides,
});

describe("Run Primary model", () => {
  it("按真实来源归入四组，并保留其他平台目标用于界面检查", () => {
    const model = KtcCreateRunModel({
      platform: "darwin",
      trusted: true,
      projects: [{
        id: "project",
        name: "PNX",
        relativePath: ".",
        kinds: ["caa", "cmake-cpp"],
        caaVersion: "19",
        relatedProjectCount: 2,
        relatedProjectSummary: "PNXOneWsp、PNXTwoWsp",
        targets: [
          target({ id: "cmake", action: "cmake-build" }),
          target({ id: "task", action: "task", sourceKind: "native-task" }),
          target({ id: "script", action: "script", sourceKind: "project-script" }),
          target({ id: "caa", action: "caa-build", platforms: ["win32"] }),
        ],
      }],
    });

    expect(model.platformLabel).toBe("macOS");
    expect(model.projects[0]?.groups.map((group) => group.targets.length)).toEqual([1, 1, 1, 1]);
    expect(model.projects[0]?.groups[3]?.targets[0]).toMatchObject({ availability: "other-platform" });
    expect(model.projects[0]).toMatchObject({ relatedProjectCount: 2, relatedProjectSummary: "PNXOneWsp、PNXTwoWsp" });
  });

  it("未信任工作区只读发现，所有目标禁止执行", () => {
    const model = KtcCreateRunModel({
      platform: "win32",
      trusted: false,
      projects: [{ id: "project", name: "CAA", relativePath: ".", kinds: ["caa"], targets: [target({})] }],
    });
    expect(model.projects[0]?.groups[0]?.targets[0]?.availability).toBe("untrusted");
  });
});
