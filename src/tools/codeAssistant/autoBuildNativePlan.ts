import path from "node:path";
import { ktcCanAccessAutoBuildPathOnHost, ktcIsAutoBuildFilesystemRoot } from "./autoBuildProjectTable.js";

export const KTC_CMAKE_BUILD_TYPES = ["Debug", "Release"] as const;
export type KtcCmakeBuildType = typeof KTC_CMAKE_BUILD_TYPES[number];

export function ktcSelectCmakeBuildTypes(value?: readonly KtcCmakeBuildType[]): KtcCmakeBuildType[] {
  return KTC_CMAKE_BUILD_TYPES.filter((type) => value === undefined || value.includes(type));
}

/** Same configure/build arguments and output directories as Root/tools/commonCmake.ps1.
 * TODO(Wing): extract the portable build-profile planner into run-core with the runtime migration.
 */
export function ktcPlanNativeCmakeBuild(projectPath: string, types?: readonly KtcCmakeBuildType[], platform: NodeJS.Platform = process.platform) {
  if (!ktcCanAccessAutoBuildPathOnHost(projectPath, platform) || ktcIsAutoBuildFilesystemRoot(projectPath)) throw new Error("CMake 项目必须是本机绝对目录，且不能是文件系统根。");
  const selected = ktcSelectCmakeBuildTypes(types);
  if (!selected.length) throw new Error("请至少选择一种 CMake 配置：Debug 或 Release。");
  const api = platform === "win32" ? path.win32 : path.posix;
  const root = api.normalize(projectPath).replace(/[\\/]+$/u, "");
  return selected.map((type) => {
    const buildDirectory = api.join(api.dirname(root), "build", `${api.basename(root)}${type}`);
    return {
      type, cwd: root, buildDirectory,
      configure: [`-DCMAKE_BUILD_TYPE:STRING=${type}`, "-DCMAKE_EXPORT_COMPILE_COMMANDS:BOOL=TRUE", "--no-warn-unused-cli", "-S", root, "-B", buildDirectory],
      build: ["--build", buildDirectory, "--config", type],
    };
  });
}
