import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export interface KtcAutoBuildScriptSyncFile {
  readonly source: string;
  readonly target: string;
}

export interface KtcAutoBuildScriptSyncResult extends KtcAutoBuildScriptSyncFile {
  readonly operation: "create" | "replace";
}

export interface KtcAutoBuildScriptSyncInspection {
  readonly status: "same" | "different" | "missing" | "unavailable";
  readonly source: string;
  readonly target: string;
  readonly sourceHash: string;
  readonly targetHash: string;
}

const ROOT_TOOL_FILES = Object.freeze([
  ["Invoke-AutoBuild.ps1"],
  ["Functions-Cleanup.ps1"],
  ["LinkWinb64Common.ps1"],
  ["buildErrorSummary.ps1"],
  ["buildFunction.ps1"],
  ["buildOutputEncoding.ps1"],
  ["caaAll.ps1"],
  ["clangfile.ps1"],
  ["cloneClangformat.ps1"],
  ["cmakeAll.ps1"],
  ["common.ps1"],
  ["commonCAAExport.ps1"],
  ["commonCmake.ps1"],
  ["commonExport.ps1"],
  ["commonLoad.ps1"],
  ["envSet-linux.sh"],
  ["envSet-macos.sh"],
  ["envSet.ps1"],
  ["exportAll.ps1"],
  ["exportCAAFramework.ps1"],
  ["fetchAll.ps1"],
  ["fetchPullDevelop.ps1"],
  ["invokeAll.ps1"],
  ["linkCAA.ps1"],
  ["linkFramework.ps1"],
  ["linkWinb64.ps1"],
  ["mk.ps1"],
  ["mkAll.ps1"],
  ["publish.ps1"],
  ["pullDevelop.ps1"],
  ["pullMaster.ps1"],
  ["rebuildAll.ps1"],
  ["run.ps1"],
  ["clang-format", ".clang-format"],
] as const);

const ROOT_SAMPLE_FILES = Object.freeze([
  "caaAll.ps1",
  "cleanup.ps1",
  "cleanup.toml",
  "cloneClangformat.ps1",
  "cmakeAll.ps1",
  "exportAll.ps1",
  "exportCAAFramework.ps1",
  "fetchAll.ps1",
  "fetchPullDevelop.ps1",
  "linkCAA.ps1",
  "linkFramework.ps1",
  "linkOut.ps1",
  "linkWinb64.ps1",
  "mk.ps1",
  "mkAll.ps1",
  "publish.ps1",
  "pullDevelop.ps1",
  "pullMaster.ps1",
  "rebuildAll.ps1",
  "run.ps1",
] as const);

export function ktcResolveAutoBuildScriptSyncFiles(
  extensionRoot: string,
  rootDirectory: string,
): readonly KtcAutoBuildScriptSyncFile[] {
  return [
    ...ROOT_TOOL_FILES.map((relativePath) => ({
      source: join(extensionRoot, "scripts", "auto-build", ...relativePath),
      target: join(rootDirectory, "tools", ...relativePath),
    })),
    ...ROOT_SAMPLE_FILES.map((name) => ({
      source: join(extensionRoot, "scripts", "sample", name),
      target: join(rootDirectory, "sample", name),
    })),
  ];
}

async function hashSyncFiles(
  files: readonly KtcAutoBuildScriptSyncFile[],
  side: "source" | "target",
): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.target.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file[side]));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function ktcInspectAutoBuildScriptSync(
  extensionRoot: string,
  rootDirectory: string,
): Promise<KtcAutoBuildScriptSyncInspection> {
  const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, rootDirectory);
  const source = join(extensionRoot, "scripts");
  const target = rootDirectory;
  let sourceHash = "";
  try {
    sourceHash = await hashSyncFiles(files, "source");
  } catch {
    return { status: "unavailable", source, target, sourceHash: "", targetHash: "" };
  }
  try {
    const targetHash = await hashSyncFiles(files, "target");
    return {
      status: sourceHash === targetHash ? "same" : "different",
      source,
      target,
      sourceHash,
      targetHash,
    };
  } catch {
    return { status: "missing", source, target, sourceHash, targetHash: "" };
  }
}

export async function ktcSyncAutoBuildScripts(
  extensionRoot: string,
  rootDirectory: string,
): Promise<readonly KtcAutoBuildScriptSyncResult[]> {
  const files = ktcResolveAutoBuildScriptSyncFiles(extensionRoot, rootDirectory);
  const results: KtcAutoBuildScriptSyncResult[] = [];
  for (const file of files) {
    let operation: KtcAutoBuildScriptSyncResult["operation"] = "replace";
    try {
      await access(file.target);
    } catch {
      operation = "create";
    }
    await mkdir(dirname(file.target), { recursive: true });
    await copyFile(file.source, file.target);
    results.push({ ...file, operation });
  }
  return results;
}
