import * as vscode from "vscode";
import { extname } from "node:path";

export type KtcCodegenWorkspaceFileEvent = "created" | "changed" | "deleted";
export type KtcCodegenWorkspaceFileKind = "json" | "csv" | "source";

const SOURCE_EXTENSIONS = new Set([
  ".h", ".hpp", ".hh", ".hxx", ".c", ".cc", ".cpp", ".cxx",
]);

export function ktcClassifyCodegenWorkspaceFile(
  uri: Pick<vscode.Uri, "fsPath">,
): KtcCodegenWorkspaceFileKind | undefined {
  const path = uri.fsPath.replaceAll("\\", "/");
  if (/(^|\/)\.(git|phoenix)(\/|$)|\/(node_modules|dist|build|out|target)\//.test(path)) {
    return undefined;
  }
  const suffix = extname(path).toLowerCase();
  if (suffix === ".json") return "json";
  if (suffix === ".csv") return "csv";
  return SOURCE_EXTENSIONS.has(suffix) ? "source" : undefined;
}

export interface KtcCodegenWorkspaceWatchCallbacks {
  readonly onJson: (uri: vscode.Uri, event: KtcCodegenWorkspaceFileEvent) => void;
  readonly onDiscoveryRefresh: () => void;
  /** 返回 true 时，Service 会合并触发候选索引刷新。 */
  readonly onSource: (uri: vscode.Uri, event: KtcCodegenWorkspaceFileEvent) => boolean;
  readonly onCandidateRefresh: () => void;
}

/** VS Code 文件监听端口：集中管理 watcher 生命周期、过滤与 debounce。 */
export class KtcCodegenWorkspaceWatchService implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private discoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private candidateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly callbacks: KtcCodegenWorkspaceWatchCallbacks) {}

  start(): void {
    if (this.watchers.length) return;
    for (const pattern of [
      "**/*.{json,csv}",
      "**/*.{h,hpp,hh,hxx,c,cc,cpp,cxx}",
    ]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate((uri) => this.handle(uri, "created"));
      watcher.onDidChange((uri) => this.handle(uri, "changed"));
      watcher.onDidDelete((uri) => this.handle(uri, "deleted"));
      this.watchers.push(watcher);
    }
  }

  dispose(): void {
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers.length = 0;
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    if (this.candidateTimer) clearTimeout(this.candidateTimer);
    this.discoveryTimer = undefined;
    this.candidateTimer = undefined;
  }

  private handle(uri: vscode.Uri, event: KtcCodegenWorkspaceFileEvent): void {
    const kind = ktcClassifyCodegenWorkspaceFile(uri);
    if (kind === "json") {
      this.callbacks.onJson(uri, event);
      this.scheduleDiscovery();
    } else if (kind === "csv") {
      this.scheduleDiscovery();
    } else if (kind === "source" && this.callbacks.onSource(uri, event)) {
      this.scheduleCandidates();
    }
  }

  private scheduleDiscovery(): void {
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = undefined;
      this.callbacks.onDiscoveryRefresh();
    }, 500);
  }

  private scheduleCandidates(): void {
    if (this.candidateTimer) clearTimeout(this.candidateTimer);
    this.candidateTimer = setTimeout(() => {
      this.candidateTimer = undefined;
      this.callbacks.onCandidateRefresh();
    }, 750);
  }
}
