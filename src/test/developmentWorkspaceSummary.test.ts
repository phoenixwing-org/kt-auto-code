import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDevelopmentWorkspaceStatus } from "../../scripts/development-workspace-summary.mjs";

describe("local development workspace summary", () => {
  it("把路径、版本、分支关系和未提交数量压缩为一行", () => {
    expect(formatDevelopmentWorkspaceStatus({
      label: "Wing",
      root: "/workspace/phoenix-wing",
      version: "0.7.2",
      gitStatusOutput: "## v0.7.3...origin/v0.7.3 [ahead 2]\n M docs/plan.md\n?? notes.md\n",
    })).toBe(
      "Wing: /workspace/phoenix-wing · v0.7.2 · Git v0.7.3...origin/v0.7.3 [ahead 2] · 未提交 2 项",
    );
  });

  it("在 pnpm dev 的最终启动阶段打印 Auto、CAD、Wing 和来源门禁", async () => {
    const [developSource, launchSource] = await Promise.all([
      readFile(path.resolve("scripts/develop-local-wing.mjs"), "utf8"),
      readFile(path.resolve("scripts/launch-extension-host.mjs"), "utf8"),
    ]);
    expect(developSource).toContain('launchArgs.push("--local-dev-summary")');
    expect(launchSource).toContain("联调工作目录（启动前最终状态）");
    expect(launchSource).toContain('readDevelopmentWorkspaceStatus("Auto"');
    expect(launchSource).toContain('readDevelopmentWorkspaceStatus("CAD"');
    expect(launchSource).toContain('readDevelopmentWorkspaceStatus("Wing"');
    expect(launchSource).toContain("Wing 来源门禁: 本地 dist 已嵌入");
  });
});
