import { describe, expect, it } from "vitest";
import { ktcPlanNativeCmakeBuild, ktcSelectCmakeBuildTypes } from "./autoBuildNativePlan.js";
import { ktcCloneAutoBuildConfiguration, ktcIsAutoBuildConfiguration } from "./autoBuildDraftContracts.js";

describe("native CMake plan", () => {
  it.each(["darwin", "linux", "win32"] as const)("uses direct configure/build argv on %s", (platform) => {
    const project = platform === "win32" ? "C:\\work space\\Demo" : "/work space/Demo";
    const plans = ktcPlanNativeCmakeBuild(project, undefined, platform);
    expect(plans.map(({ type }) => type)).toEqual(["Debug", "Release"]);
    expect(plans[0]!.buildDirectory.replaceAll("\\", "/")).toContain("/build/DemoDebug");
    expect(plans[0]!.configure).toContain("-DCMAKE_BUILD_TYPE:STRING=Debug");
    expect(plans[1]!.build).toEqual(["--build", plans[1]!.buildDirectory, "--config", "Release"]);
    expect(JSON.stringify(plans)).not.toContain("ps1");
  });
  it("Release only never configures Debug; empty selection and filesystem roots are rejected", () => {
    expect(ktcPlanNativeCmakeBuild("/tmp/Demo", ["Release"], "darwin")).toHaveLength(1);
    expect(() => ktcPlanNativeCmakeBuild("/tmp/Demo", [], "darwin")).toThrow("至少选择");
    expect(() => ktcPlanNativeCmakeBuild("/", ["Release"], "darwin")).toThrow("文件系统根");
  });
  it("validates/preserves the JSON profile, while legacy files default to both", () => {
    const config = { schemaVersion: 2 as const, rootDirectory: "/root", thirdPartyDirectory: "/third", rootBranch: "main", branch: "main", cmakeBranch: "main", projects: [], clean: false };
    expect(ktcIsAutoBuildConfiguration({ ...config, cmakeBuildTypes: ["Release"] })).toBe(true);
    expect(ktcIsAutoBuildConfiguration({ ...config, cmakeBuildTypes: ["Debug", "Debug"] })).toBe(false);
    expect(ktcIsAutoBuildConfiguration({ ...config, cmakeBuildTypes: ["Unknown"] })).toBe(false);
    expect(ktcSelectCmakeBuildTypes(ktcCloneAutoBuildConfiguration(config).cmakeBuildTypes)).toEqual(["Debug", "Release"]);
    expect(ktcCloneAutoBuildConfiguration({ ...config, cmakeBuildTypes: ["Release"] }).cmakeBuildTypes).toEqual(["Release"]);
  });
});
