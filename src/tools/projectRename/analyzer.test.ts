import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ktcAnalyzeProjectRename, KtcProjectRenameCancelledError } from "./analyzer.js";
import { ktcDeriveProjectRenameRules } from "./nameVariants.js";
import { ktcProjectRenameReportSummary, ktcProjectRenameResultPage } from "./viewModel.js";
import { runWorkspaceRename } from "../../core/workspaceRename.js";
import {
  ktcProjectRenameApplyOptions,
  ktcProjectRenameCompletionAfterApply,
  ktcProjectRenamePreviewDrift,
} from "./execution.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "phoenix-dev-hub-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, ".github", "workflows"), { recursive: true }),
    mkdir(join(root, ".storybook"), { recursive: true }),
    mkdir(join(root, ".vscode"), { recursive: true }),
    mkdir(join(root, "src", "phoenix-dev-hub-module"), { recursive: true }),
    mkdir(join(root, "node_modules", "ignored"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "package.json"), '{"name":"phoenix-dev-hub","env":"PHOENIX_DEV_HUB_PORT"}\n'),
    writeFile(join(root, ".github", "workflows", "phoenix-dev-hub.yml"), "name: Phoenix Dev Hub\n"),
    writeFile(join(root, ".storybook", "phoenix-dev-hub.ts"), "export const title = 'PhoenixDevHub';\n"),
    writeFile(join(root, ".vscode", "phoenix-dev-hub.json"), '{"service":"phoenix_dev_hub"}\n'),
    writeFile(join(root, "src", "PdhClient.ts"), "export const key = 'Pdh PHOENIX_DEV_HUB_TOKEN';\n"),
    writeFile(join(root, "src", "related.ts"), "export const related = 'dev-hub DevHub phoenix dev hub';\n"),
    writeFile(join(root, "src", "phoenix-dev-hub.config.ts"), "export const id = 'phoenix-dev-hub';\n"),
    writeFile(join(root, "src", "phoenix-hub.config.ts"), "export const id = 'existing';\n"),
    writeFile(join(root, "node_modules", "ignored", "phoenix-dev-hub.ts"), "PhoenixDevHub\n"),
  ]);
  return root;
}

describe("project rename analyzer", () => {
  it("只读扫描 Web 点目录、内容/文件/目录并标记风险和冲突", async () => {
    const root = await fixture();
    const before = await readFile(join(root, "package.json"), "utf8");
    const rules = [
      ...ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub"),
      { id: "custom-prefix", style: "custom" as const, search: "Pdh", replace: "Pnh", enabled: true },
    ];
    const report = await ktcAnalyzeProjectRename({
      reportId: 7,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules,
    });
    const paths = report.workspaceReport.hits.map((hit) => hit.relativePath);
    expect(paths).toEqual(expect.arrayContaining([
      ".github/workflows/phoenix-dev-hub.yml",
      ".storybook/phoenix-dev-hub.ts",
      ".vscode/phoenix-dev-hub.json",
      "src/phoenix-dev-hub-module",
      "src/PdhClient.ts",
      "package.json",
    ]));
    expect(paths.some((path) => path.startsWith("node_modules/"))).toBe(false);
    expect(report.workspaceReport.hits.find((hit) => hit.id === "text:package.json")?.status).toBe("preview");
    expect(report.assessments["text:package.json"]).toMatchObject({ category: "package-contract", risk: "high" });
    expect(report.workspaceReport.hits.find((hit) => hit.id === "file:src/phoenix-dev-hub.config.ts"))
      .toMatchObject({ status: "error" });
    expect(report.rootSuggestion?.suggestedName).toContain("phoenix-hub");
    expect(report.relatedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ search: "dev-hub", replace: "hub", occurrences: 1, matchedItems: 1 }),
      expect.objectContaining({ search: "DevHub", replace: "Hub", occurrences: 1, matchedItems: 1 }),
      expect.objectContaining({ search: "phoenix dev hub", replace: "phoenix hub", occurrences: 1, matchedItems: 1 }),
    ]));
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(before);
  });

  it("结果分页且可由摘要限制首屏", async () => {
    const root = await fixture();
    const report = await ktcAnalyzeProjectRename({
      reportId: 8,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules: ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub"),
    });
    const summary = ktcProjectRenameReportSummary(report, 1);
    expect(summary.page.rows).toHaveLength(1);
    expect(summary.relatedCandidates.length).toBeGreaterThan(0);
    expect(summary.page.nextOffset).toBe(1);
    expect(ktcProjectRenameResultPage(report, summary.page.nextOffset, 1).offset).toBe(1);
  });

  it("用户显式启用相关写法后不再把它重复列为候选", async () => {
    const root = await fixture();
    const report = await ktcAnalyzeProjectRename({
      reportId: 10,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules: [
        ...ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub"),
        { id: "approved-related", style: "custom", search: "dev-hub", replace: "hub", enabled: true },
      ],
    });
    expect(report.relatedCandidates.some((candidate) => candidate.search === "dev-hub")).toBe(false);
    expect(report.workspaceReport.hits.find((hit) => hit.id === "text:src/related.ts")?.ruleMatches)
      .toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "approved-related" })]));
  });

  it("冻结分析与写盘预检一致，并在写盘后重新扫描完成门禁", async () => {
    const root = await fixture();
    await rm(join(root, "src", "phoenix-hub.config.ts"));
    const rules = ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub");
    const report = await ktcAnalyzeProjectRename({
      reportId: 11,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules,
    });
    const options = ktcProjectRenameApplyOptions(report);
    const preview = runWorkspaceRename(options);
    expect(ktcProjectRenamePreviewDrift(report, preview)).toBeUndefined();
    const applied = runWorkspaceRename({ ...options, apply: true });
    expect(applied.summary.errors).toBe(0);
    expect(await readFile(join(root, ".github", "workflows", "phoenix-hub.yml"), "utf8"))
      .toContain("Phoenix Hub");
    const remaining = await ktcAnalyzeProjectRename({
      reportId: 12,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules,
    });
    expect(ktcProjectRenameCompletionAfterApply(preview, applied, remaining)).toMatchObject({
      allPlannedApplied: true,
      canFinish: true,
    });
    expect(remaining.workspaceReport.hits).toHaveLength(0);
  });

  it("响应已触发的取消信号", async () => {
    const root = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(ktcAnalyzeProjectRename({
      reportId: 9,
      root,
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules: ktcDeriveProjectRenameRules("Phoenix Dev Hub", "Phoenix Hub"),
      signal: controller.signal,
    })).rejects.toBeInstanceOf(KtcProjectRenameCancelledError);
  });
});
