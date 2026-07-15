import * as vscode from "vscode";
import { relative } from "node:path";
import { pnwParseWorksetDocument, type PnwWorkset, type PnwWorksetParseResult } from "phoenix-wing/code-core";

export type KtcWorksetReadResult = PnwWorksetParseResult & { readonly relativePath: ".phoenix/worksets.json"; readonly exists: boolean };

/** Reads and validates the documented workspace-local workset file without expanding globs. */
export async function ktcReadWorkspaceWorksets(root: vscode.Uri): Promise<KtcWorksetReadResult> {
  const uri = vscode.Uri.joinPath(root, ".phoenix", "worksets.json");
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    return { ...pnwParseWorksetDocument(text), relativePath: ".phoenix/worksets.json", exists: true };
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return { valid: true, document: { version: 1, worksets: [] }, diagnostics: [], relativePath: ".phoenix/worksets.json", exists: false };
    }
    return { valid: false, diagnostics: [error instanceof Error ? `无法读取工作集：${error.message}` : "无法读取工作集"], relativePath: ".phoenix/worksets.json", exists: true };
  }
}

export async function ktcOpenWorkspaceWorksets(root: vscode.Uri): Promise<void> {
  const directory = vscode.Uri.joinPath(root, ".phoenix");
  const uri = vscode.Uri.joinPath(directory, "worksets.json");
  await vscode.workspace.fs.createDirectory(directory);
  try {
    await vscode.workspace.fs.stat(uri);
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound") throw error;
    const initial = {
      version: 1,
      worksets: [{
        id: "default",
        label: "默认代码工作集",
        roots: ["."],
        include: ["**/*.{h,hpp,hh,c,cc,cpp,cxx,CATDlg,CATNls}"],
        exclude: ["**/{.git,.phoenix,node_modules,dist,build,out,target}/**"],
      }],
    };
    await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify(initial, null, 2)}\n`, "utf8"));
  }
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
}

export async function ktcAddResultFilesToWorkset(
  root: vscode.Uri,
  relativePaths: readonly string[],
  title: string,
): Promise<number> {
  const loaded = await ktcReadWorkspaceWorksets(root);
  if (!loaded.valid || !loaded.document) throw new Error(`工作集配置无效：${loaded.diagnostics.join("；")}`);
  if (loaded.document.worksets.length === 0) {
    await ktcOpenWorkspaceWorksets(root);
    void vscode.window.showInformationMessage("尚无工作集；已打开配置，请添加并保存后重试。");
    return 0;
  }
  const uri = vscode.Uri.joinPath(root, ".phoenix", "worksets.json");
  const dirty = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString() && document.isDirty);
  if (dirty) throw new Error("worksets.json 有未保存修改，请先保存后再加入结果文件。");
  type WorksetItem = vscode.QuickPickItem & { readonly id: string };
  const selected = await vscode.window.showQuickPick<WorksetItem>(loaded.document.worksets.map((workset) => ({
    label: workset.label,
    description: `${workset.roots.join("、")} · ${workset.include.length} 条包含规则`,
    id: workset.id,
  })), { title: `${title}：加入工作集`, placeHolder: "选择接收当前结果文件的工作集", ignoreFocusOut: true });
  if (!selected) return 0;

  let added = 0;
  const worksets = loaded.document.worksets.map((workset) => {
    if (workset.id !== selected.id) return workset;
    const include = [...workset.include];
    for (const path of relativePaths) {
      const relativeToRoot = pathRelativeToWorksetRoot(path, workset.roots);
      if (relativeToRoot && !include.includes(relativeToRoot)) { include.push(relativeToRoot); added += 1; }
    }
    return { ...workset, include };
  });
  if (added > 0) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify({ version: 1, worksets }, null, 2)}\n`, "utf8"));
  }
  void vscode.window.showInformationMessage(added > 0
    ? `已向工作集“${selected.label}”加入 ${added} 个精确文件规则；命中 exclude 的文件仍会被排除。`
    : `当前结果已在工作集“${selected.label}”中，或不位于其 roots 下。`);
  return added;
}

function pathRelativeToWorksetRoot(path: string, roots: readonly string[]): string | undefined {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const candidates = roots.map((value) => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, ""))
    .sort((left, right) => right.length - left.length);
  for (const root of candidates) {
    if (root === ".") return normalizedPath;
    if (normalizedPath === root) return normalizedPath.split("/").pop();
    if (normalizedPath.startsWith(`${root}/`)) return normalizedPath.slice(root.length + 1);
  }
  return undefined;
}

export type KtcWorkspaceFileScope = {
  readonly kind: "workspace" | "workset";
  readonly label: string;
  readonly worksetId?: string;
  readonly fileUris?: ReadonlySet<string>;
  readonly relativeFiles?: readonly string[];
};

export type KtcWorkspaceFileScopeSummary = {
  readonly id: string;
  readonly kind: "workspace" | "workset";
  readonly label: string;
  readonly description: string;
};

const WORKSPACE_SCOPE_ID = "workspace";
const WORKSET_SCOPE_PREFIX = "workset:";

/** Lists scopes for an in-Block selector without expanding any workset globs. */
export async function ktcListWorkspaceFileScopes(root: vscode.Uri): Promise<readonly KtcWorkspaceFileScopeSummary[]> {
  const loaded = await ktcReadWorkspaceWorksets(root);
  if (!loaded.valid) throw new Error(`工作集配置无效：${loaded.diagnostics.join("；")}`);
  return [
    { id: WORKSPACE_SCOPE_ID, kind: "workspace", label: "整个工作区", description: root.fsPath },
    ...(loaded.document?.worksets ?? []).map((workset) => ({
      id: `${WORKSET_SCOPE_PREFIX}${workset.id}`,
      kind: "workset" as const,
      label: workset.label,
      description: `${workset.roots.join("、")} · ${workset.include.length} 条包含 / ${workset.exclude.length} 条排除`,
    })),
  ];
}

/** Resolves the scope selected in the Block. This function never opens QuickPick. */
export async function ktcResolveWorkspaceFileScope(
  root: vscode.Uri,
  selectedId: string | undefined,
): Promise<KtcWorkspaceFileScope> {
  if (!selectedId || selectedId === WORKSPACE_SCOPE_ID) {
    return { kind: "workspace", label: "整个工作区" };
  }
  if (!selectedId.startsWith(WORKSET_SCOPE_PREFIX)) {
    throw new Error(`未知扫描范围：${selectedId}`);
  }
  const worksetId = selectedId.slice(WORKSET_SCOPE_PREFIX.length);
  const loaded = await ktcReadWorkspaceWorksets(root);
  if (!loaded.valid) throw new Error(`工作集配置无效：${loaded.diagnostics.join("；")}`);
  const workset = loaded.document?.worksets.find((candidate) => candidate.id === worksetId);
  if (!workset) throw new Error(`工作集“${worksetId}”不存在；请在当前 Block 重新选择扫描范围。`);
  const fileUris = await ktcExpandWorkset(root, workset);
  return {
    kind: "workset",
    label: workset.label,
    worksetId: workset.id,
    fileUris,
    relativeFiles: [...fileUris]
      .map((value) => relative(root.fsPath, vscode.Uri.parse(value).fsPath).replace(/\\/g, "/"))
      .sort(),
  };
}

export function ktcFileInWorkspaceScope(uri: vscode.Uri, scope: KtcWorkspaceFileScope): boolean {
  return scope.kind === "workspace" || Boolean(scope.fileUris?.has(uri.toString()));
}

async function ktcExpandWorkset(root: vscode.Uri, workset: PnwWorkset): Promise<ReadonlySet<string>> {
  const included = new Set<string>();
  for (const relativeRoot of workset.roots) {
    const base = vscode.Uri.joinPath(root, relativeRoot);
    for (const pattern of workset.include) {
      assertSafeWorksetGlob(pattern, workset.label);
      for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(base, pattern), null)) {
        included.add(uri.toString());
      }
    }
    for (const pattern of workset.exclude) {
      assertSafeWorksetGlob(pattern, workset.label);
      for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(base, pattern), null)) {
        included.delete(uri.toString());
      }
    }
  }
  return included;
}

function assertSafeWorksetGlob(value: string, label: string): void {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)
    || normalized.split("/").includes("..") || /[\r\n\0]/.test(normalized)) {
    throw new Error(`工作集“${label}”包含可能越出工作区的 glob：${value}`);
  }
}
