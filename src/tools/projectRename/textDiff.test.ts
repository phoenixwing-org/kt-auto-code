import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it } from "vitest";
import type { DetectedEncoding } from "../../core/fileEncoding.js";
import type { KtcProjectRenameAnalysisReport } from "./contracts.js";
import { ktcBuildProjectRenameTextDiff } from "./textDiff.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project rename text diff", () => {
  it("用冻结原文与同一组规则生成只读计划文本", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-project-diff-"));
    roots.push(root);
    const file = join(root, "src.ts");
    const bytes = Buffer.from("export const name = 'PhoenixOpenIssue';\n", "utf8");
    await writeFile(file, bytes);

    const diff = await ktcBuildProjectRenameTextDiff(report(root, file, bytes), "text:src.ts");
    expect(diff.originalText).toContain("PhoenixOpenIssue");
    expect(diff.targetText).toContain("PhoenixIssue");
    expect(diff.relativePath).toBe("src.ts");
  });

  it.each([
    [
      "UTF-8 BOM",
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("export const label = '中文 PhoenixOpenIssue';\r\n", "utf8"),
      ]),
      "utf8-bom" as const,
    ],
    [
      "GBK",
      iconv.encode("export const label = '中文 PhoenixOpenIssue';\r\n", "gbk"),
      "gbk" as const,
    ],
  ])("用冻结的 %s 字节生成差异且不修改磁盘", async (_label, bytes, detectedEncoding) => {
    const root = await mkdtemp(join(tmpdir(), "ktc-project-diff-"));
    roots.push(root);
    const file = join(root, "encoded.ts");
    await writeFile(file, bytes);

    const diff = await ktcBuildProjectRenameTextDiff(
      report(root, file, bytes, detectedEncoding, "text:encoded.ts", "encoded.ts"),
      "text:encoded.ts",
    );
    expect(diff.originalText).toBe("export const label = '中文 PhoenixOpenIssue';\r\n");
    expect(diff.targetText).toBe("export const label = '中文 PhoenixIssue';\r\n");
    expect(await readFile(file)).toEqual(bytes);
  });

  it("磁盘内容漂移后拒绝伪造新的计划差异", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-project-diff-"));
    roots.push(root);
    const file = join(root, "src.ts");
    const bytes = Buffer.from("PhoenixOpenIssue\n", "utf8");
    const frozen = report(root, file, bytes);
    await writeFile(file, "prefix PhoenixOpenIssue\n");

    await expect(ktcBuildProjectRenameTextDiff(frozen, "text:src.ts"))
      .rejects.toThrow("文件内容已变化");
  });
});

function report(
  root: string,
  file: string,
  bytes: Buffer,
  detectedEncoding: DetectedEncoding = "ascii",
  id = "text:src.ts",
  relativePath = "src.ts",
): KtcProjectRenameAnalysisReport {
  return {
    reportId: 7,
    root,
    sourceName: "Phoenix Open Issue",
    targetName: "Phoenix Issue",
    rules: [{
      id: "pascal",
      style: "pascal",
      search: "PhoenixOpenIssue",
      replace: "PhoenixIssue",
      enabled: true,
    }],
    ignorePatterns: [],
    useBuiltInIgnore: true,
    workspaceReport: {
      root,
      applied: false,
      hits: [{
        id,
        relativePath,
        fullPath: file,
        originalFullPath: file,
        plannedFullPath: file,
        level: "text",
        occurrences: 1,
        detectedEncoding,
        sourceHash: createHash("sha256").update(bytes).digest("hex"),
        status: "preview",
      }],
      summary: { rules: 1, matchedRules: 1, directories: 0, files: 0, textFiles: 1, replacements: 1, skipped: 0, errors: 0 },
    },
    assessments: {},
    riskSummary: { high: 0, medium: 1, low: 0 },
    stats: { scannedDirectories: 0, scannedFiles: 1, skippedBinaryFiles: 0, skippedLargeFiles: 0, skippedUnsupportedEncodingFiles: 0, truncated: false },
    relatedCandidates: [],
  };
}
