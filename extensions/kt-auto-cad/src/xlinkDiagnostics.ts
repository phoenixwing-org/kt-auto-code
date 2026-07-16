import path from "node:path";
import {
  pnwCadXlinkRuleLabel,
  pnwResolveXlinkTarget,
  type PnwCadXlinkResolveStatus,
} from "@phoenix-wing/cad-core";

export interface KtcCadXlinkInput {
  readonly file: string;
  readonly label: string | null;
}

export interface KtcCadXlinkDiagnostic {
  readonly file: string;
  readonly label: string;
  readonly status: PnwCadXlinkResolveStatus;
  readonly targetRelativePath: string | null;
  readonly candidates: readonly string[];
  readonly message: string;
}

export interface KtcCadXlinkDiagnosticSummary {
  readonly items: readonly KtcCadXlinkDiagnostic[];
  readonly counts: Readonly<Record<PnwCadXlinkResolveStatus, number>>;
}

export function diagnoseCadXlinks(
  hostRelativePath: string,
  xlinks: readonly KtcCadXlinkInput[],
  workspaceRelativePaths: readonly string[],
): KtcCadXlinkDiagnosticSummary {
  const host = normalizeRelativePath(hostRelativePath);
  if (!host) throw new Error("XLink host must be a safe workspace relative path");
  const knownPaths = [...new Set(workspaceRelativePaths
    .map(normalizeRelativePath)
    .filter((value): value is string => Boolean(value)))];
  const knownByFoldedPath = new Map(knownPaths.map((value) => [value.toLocaleLowerCase("en-US"), value]));
  const counts: Record<PnwCadXlinkResolveStatus, number> = {
    resolved: 0,
    ambiguous: 0,
    missing: 0,
    self: 0,
    non_fcstd: 0,
  };
  const items = xlinks.map((xlink) => {
    const rawFile = String(xlink.file || "").trim().replaceAll("\\", "/");
    const targetBasename = path.posix.basename(rawFile);
    const candidateRels = knownPaths.filter((candidate) => (
      path.posix.basename(candidate).toLocaleLowerCase("en-US")
        === targetBasename.toLocaleLowerCase("en-US")
    ));
    const directTargetRel = directWorkspaceTarget(host, rawFile, knownByFoldedPath);
    const resolved = pnwResolveXlinkTarget({
      hostRel: host,
      xlinkFile: rawFile,
      candidateRels,
      existingCandidateRels: candidateRels,
      directTargetRel,
    });
    counts[resolved.status] += 1;
    const targetRelativePath = stripDotPrefix(resolved.targetRel);
    const candidates = resolved.candidates.map(stripDotPrefix).filter((value): value is string => Boolean(value));
    const label = String(xlink.label || "").trim()
      || pnwCadXlinkRuleLabel(undefined, rawFile, targetRelativePath);
    return Object.freeze({
      file: rawFile,
      label,
      status: resolved.status,
      targetRelativePath,
      candidates: Object.freeze(candidates),
      message: diagnosticMessage(resolved.status, targetRelativePath, candidates),
    });
  });
  return Object.freeze({
    items: Object.freeze(items),
    counts: Object.freeze(counts),
  });
}

function normalizeRelativePath(value: string): string | null {
  const raw = String(value || "").trim().replaceAll("\\", "/").replace(/^(\.\/)+/, "");
  if (!raw || raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) return null;
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function directWorkspaceTarget(
  hostRelativePath: string,
  xlinkFile: string,
  knownByFoldedPath: ReadonlyMap<string, string>,
): string | null {
  if (!xlinkFile || xlinkFile.startsWith("/") || /^[A-Za-z]:\//.test(xlinkFile)) return null;
  const joined = normalizeRelativePath(path.posix.join(path.posix.dirname(hostRelativePath), xlinkFile));
  return joined ? knownByFoldedPath.get(joined.toLocaleLowerCase("en-US")) ?? null : null;
}

function stripDotPrefix(value: string | null): string | null {
  return value ? value.replace(/^\.\//, "") : null;
}

function diagnosticMessage(
  status: PnwCadXlinkResolveStatus,
  targetRelativePath: string | null,
  candidates: readonly string[],
): string {
  switch (status) {
    case "resolved": return `已解析到 ${targetRelativePath}`;
    case "self": return "引用指向当前 FCStd 自身";
    case "ambiguous": return `存在多个候选，建议检查 ${candidates.join("、")}`;
    case "missing": return candidates.length
      ? `候选文件当前不可用：${candidates.join("、")}`
      : "工作区中未找到匹配的 FCStd";
    case "non_fcstd": return "不是 FCStd 引用";
  }
}
