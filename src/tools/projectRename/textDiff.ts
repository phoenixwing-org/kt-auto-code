import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import iconv from "iconv-lite";
import { detectFileEncoding, type DetectedEncoding } from "../../core/fileEncoding.js";
import {
  replaceBufferByRules,
  resolveReplacementRules,
  type ReplacementTextEncoding,
  type ResolvedReplacementRule,
} from "../../core/replacementRules.js";
import { ktcIsPathInsideWorkspace } from "../../core/workspace/workspacePath.js";
import type { KtcProjectRenameAnalysisReport } from "./contracts.js";

const KTC_PROJECT_RENAME_DIFF_MAX_BYTES = 8 * 1024 * 1024;

export interface KtcProjectRenameTextDiff {
  readonly reportId: number;
  readonly rowId: string;
  readonly relativePath: string;
  readonly originalText: string;
  readonly targetText: string;
}

/** Builds both Diff Editor sides from one frozen report without writing to disk. */
export async function ktcBuildProjectRenameTextDiff(
  report: KtcProjectRenameAnalysisReport,
  rowId: string,
): Promise<KtcProjectRenameTextDiff> {
  const hit = report.workspaceReport.hits.find((candidate) => candidate.id === rowId);
  if (!hit || hit.level !== "text" || hit.status === "error" || hit.status === "skipped") {
    throw new Error("所选结果不是可预览的文本改名项。");
  }
  if (!hit.sourceHash || !/^[0-9a-f]{64}$/u.test(hit.sourceHash)) {
    throw new Error("当前报告没有冻结文件指纹，请重新分析。");
  }
  if (!ktcIsPathInsideWorkspace(report.root, hit.originalFullPath)) {
    throw new Error("冻结文件已超出分析目录，请重新分析。");
  }
  const fileStat = await lstat(hit.originalFullPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error("冻结文件已变化或成为符号链接，请重新分析。");
  }
  if (fileStat.size > KTC_PROJECT_RENAME_DIFF_MAX_BYTES) {
    throw new Error("冻结文件已超过 8 MiB 安全上限，请重新分析或缩小范围。");
  }
  const bytes = await readFile(hit.originalFullPath);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  if (sourceHash !== hit.sourceHash) {
    throw new Error("文件内容已变化，不能显示旧计划；请重新分析。");
  }
  const detected = detectFileEncoding(bytes).detected;
  if (detected !== hit.detectedEncoding) {
    throw new Error("文件编码已变化，不能显示旧计划；请重新分析。");
  }
  const rules = resolveReplacementRules(report.rules.map((rule) => ({
    id: rule.id,
    search: rule.search,
    replace: rule.replace,
    enabled: rule.enabled,
  })), false);
  const encoding = ktcProjectRenameDiffEncoding(detected, rules);
  if (!encoding) throw new Error(`暂不支持 ${detected} 文件的写盘前差异。`);
  const replaced = replaceBufferByRules(bytes, rules, encoding);
  if (replaced.offsets.length !== hit.occurrences) {
    throw new Error("文本命中次数与冻结报告不一致，请重新分析。");
  }
  const originalText = ktcDecodeProjectRenameDiff(bytes, detected, encoding, false);
  const targetText = ktcDecodeProjectRenameDiff(replaced.output, detected, encoding, true);
  if (originalText === undefined || targetText === undefined) {
    throw new Error(`无法解码 ${detected} 文件的写盘前差异。`);
  }
  return {
    reportId: report.reportId,
    rowId,
    relativePath: hit.relativePath,
    originalText,
    targetText,
  };
}

function ktcProjectRenameDiffEncoding(
  detected: DetectedEncoding,
  rules: readonly ResolvedReplacementRule[],
): ReplacementTextEncoding | undefined {
  if (detected === "ascii") {
    return rules.some((rule) => !/^[\x00-\x7f]*$/u.test(rule.replace)) ? "utf8" : "ascii";
  }
  if (detected === "utf8" || detected === "utf8-bom") return "utf8";
  if (detected === "gbk") return "gbk";
  return undefined;
}

function ktcDecodeProjectRenameDiff(
  bytes: Buffer,
  detected: DetectedEncoding,
  replacementEncoding: ReplacementTextEncoding,
  replaced: boolean,
): string | undefined {
  if (replacementEncoding === "gbk") return iconv.decode(bytes, "gbk");
  if (detected === "utf8-bom" && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return bytes.subarray(3).toString("utf8");
  }
  if (detected === "ascii" || detected === "utf8" || detected === "utf8-bom" || replaced) {
    return bytes.toString("utf8");
  }
  return undefined;
}
