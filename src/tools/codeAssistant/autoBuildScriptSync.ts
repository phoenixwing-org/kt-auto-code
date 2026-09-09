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

const AUTO_BUILD_SCRIPT_SYNC_LAYOUT = Object.freeze([
  { source: ["scripts", "auto-build", "Invoke-AutoBuild.ps1"], target: ["tools", "Invoke-AutoBuild.ps1"] },
  { source: ["scripts", "auto-build", "Functions-Cleanup.ps1"], target: ["tools", "Functions-Cleanup.ps1"] },
  { source: ["scripts", "sample", "cleanup.ps1"], target: ["sample", "cleanup.ps1"] },
  { source: ["scripts", "sample", "cleanup.yaml"], target: ["sample", "cleanup.yaml"] },
] as const);

export function ktcResolveAutoBuildScriptSyncFiles(
  extensionRoot: string,
  rootDirectory: string,
): readonly KtcAutoBuildScriptSyncFile[] {
  return AUTO_BUILD_SCRIPT_SYNC_LAYOUT.map((entry) => ({
    source: join(extensionRoot, ...entry.source),
    target: join(rootDirectory, ...entry.target),
  }));
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
