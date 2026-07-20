import * as vscode from "vscode";
import { PNW_WORKSPACE_DATABASE_FILENAME } from "@phoenix-wing/workspace-schema";
import {
  inspectCadNativeTools,
  KTC_CAD_NATIVE_TOOLS,
  selectDeskToolsProvider,
  type KtcCadNativeStatus,
} from "./nativeProtocol.js";
import { describeCadFilename } from "./cadFilename.js";
import { analyzeFcstdBytes, type KtcTsFcstdAnalysis } from "./fcstdTsReader.js";
import { readFcstdWithNativeV1, type KtcCadReadSuccess } from "./nativeRead.js";
import {
  queryCadWorkspaceSummary,
  type KtcCadDatabaseSummary,
} from "./workspaceDatabaseQuery.js";
import { describeCadWorkspaceFiles, type KtcCadWorkspaceEntry } from "./workspaceScan.js";
import {
  buildCadWorkspaceIndex,
  searchCadWorkspaceIndex,
  writeCadWorkspaceIndex,
  type KtcCadIndexRecord,
  type KtcCadIndexSearchRow,
  type KtcCadWorkspaceIndexResult,
} from "./workspaceIndex.js";
import {
  diagnoseCadXlinks,
  type KtcCadXlinkDiagnosticSummary,
} from "./xlinkDiagnostics.js";
import {
  ktcGetCadDetailTool,
  type KtcCadDetailToolId,
} from "./detailTools.js";
import type {
  KtcAutoCodeShellApiV2,
  KtcModuleBlockContent,
  KtcModuleBlockRegistration,
} from "../../../src/moduleShellContract.js";

interface ShellConnection {
  api?: KtcAutoCodeShellApiV2;
  error?: string;
}

interface NativeConnection {
  status?: KtcCadNativeStatus;
  checking?: Promise<void>;
  reading?: Promise<void>;
  readResult?: {
    readonly filePath: string;
    readonly relativePath?: string;
    readonly workspaceFolderUri?: string;
    readonly response: KtcCadReadSuccess;
  };
  xlinkDiagnostics?: KtcCadXlinkDiagnosticSummary;
  readError?: string;
  lightReading?: Promise<void>;
  lightReadResult?: {
    readonly filePath: string;
    readonly relativePath?: string;
    readonly analysis: KtcTsFcstdAnalysis;
    readonly xlinkDiagnostics?: KtcCadXlinkDiagnosticSummary;
  };
  lightReadError?: string;
  querying?: Promise<void>;
  queryResult?: {
    readonly databasePath: string;
    readonly relativePath: string;
    readonly summary: KtcCadDatabaseSummary;
  };
  queryError?: string;
  scanning?: Promise<void>;
  workspaceFiles?: readonly {
    readonly uri: vscode.Uri;
    readonly entry: KtcCadWorkspaceEntry;
  }[];
  scanError?: string;
  indexResults?: readonly KtcCadWorkspaceIndexResult[];
  indexError?: string;
  searching?: Promise<void>;
  searchResult?: {
    readonly text: string;
    readonly source: "sqlite" | "vscode";
    readonly items: readonly {
      readonly workspaceFolder: vscode.WorkspaceFolder;
      readonly row: KtcCadIndexSearchRow;
    }[];
  };
  searchError?: string;
}

const AUTO_CODE_EXTENSION_ID = "kuntai.kt-auto-code";
const FCSTD_GLOB = "**/*.[Ff][Cc][Ss][Tt][Dd]";
const FCSTD_EXCLUDE_GLOB = "**/{.git,node_modules}/**";

class CadBlockProvider {
  constructor(
    private readonly connection: ShellConnection,
    private readonly native: NativeConnection,
    private readonly onDidChange: () => void,
  ) {}

  refresh(): void {
    this.onDidChange();
  }

  render(toolId: string): KtcModuleBlockContent {
    const tool = ktcGetCadDetailTool(toolId);
    const nativeReady = this.native.status?.ready === true;
    const status = tool.requirement === "desk-provider"
      ? (nativeReady ? "CAD 读取器已就绪" : "需要 CAD 读取器")
      : tool.requirement === "optional-desk-provider"
        ? (nativeReady ? "TS 可用 · CAD 读取器已就绪" : "TS 轻量读取可用")
      : tool.requirement === "workspace-database"
        ? "只读数据库"
        : "直接可用";
    const headerActions = (() => {
      if (tool.id === "cadScan") return [
        { id: "scanWorkspace", title: "扫描并更新 SQLite 索引", icon: "↻" },
        { id: "searchIndex", title: "搜索文件索引", icon: "⌕" },
      ];
      if (tool.id === "cadRead") return [
        { id: "readFcstdLight", title: "TS 轻量读取", icon: "📄" },
        { id: "readFcstd", title: "Desk 深度读取", icon: "◈" },
        ...(!nativeReady ? [{ id: "openDeskToolsSettings", title: "Desk Tools 设置", icon: "⚙" }] : []),
      ];
      if (tool.id === "cadQuery") return [{ id: "queryDatabase", title: "查询 BOM 与引用", icon: "⌕" }];
      if (tool.id === "cadDiagnostics") return [{ id: "runDiagnostics", title: "刷新诊断", icon: "↻" }];
      return [];
    })();
    return {
      title: tool.title,
      description: tool.summary,
      status,
      statusKind: tool.requirement === "desk-provider" && !nativeReady ? "warning" : "success",
      headerActions,
      html: this.html(tool.id),
    };
  }

  async handleAction(_toolId: string, actionId: string): Promise<void> {
    const commands: Record<string, string> = {
      scanWorkspace: "ktAutoCad.scanWorkspace",
      searchIndex: "ktAutoCad.searchWorkspaceIndex",
      readFcstdLight: "ktAutoCad.readFcstdLight",
      readFcstd: "ktAutoCad.readFcstd",
      queryDatabase: "ktAutoCad.queryWorkspaceDatabase",
      openDeskToolsSettings: "ktAutoCode.deskTools.openSettings",
      runDiagnostics: "ktAutoCad.diagnostics",
    };
    const command = commands[actionId];
    if (command) await vscode.commands.executeCommand(command);
  }

  private html(activeToolId: KtcCadDetailToolId): string {
    const shellReady = Boolean(this.connection.api);
    const nativeReady = this.native.status?.ready === true;
    const nativeErrors = this.native.status
      ? KTC_CAD_NATIVE_TOOLS
        .map((tool) => this.native.status?.tools[tool].error)
        .filter((error): error is string => Boolean(error))
        .join("；")
      : "未发现 CAD 深度读取器";
    const detail = !shellReady
      ? this.connection.error ?? "正在连接 KT Auto Code…"
      : nativeReady
        ? `Wing CAD Core 已就绪；CAD 深度读取器 protocol v1 与 workspace Schema v${this.native.status?.workspaceSchemaVersion} 已就绪。`
        : `Wing CAD Core 已就绪，文件名分析、扫描入库、索引搜索和基础 BOM 查询可直接使用；只有 FCStd 深度读取需要 Desk Tools 安装的本机读取器。${nativeErrors ? ` ${nativeErrors}` : ""}`;
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const filenameHint = activeUri?.scheme === "file"
      ? describeCadFilename(vscode.workspace.asRelativePath(activeUri, false))
      : undefined;
    const filenameDetail = filenameHint
      ? `${filenameHint.documentKind} · ${filenameHint.partKey || "未识别零件号"}${filenameHint.partName ? ` · ${filenameHint.partName}` : ""}`
      : "打开 FCStd 文件后，这里会用 Wing CAD Core 预览文件名语义。";
    const readDocument = this.native.readResult?.response.result;
    const bomItems = readDocument?.objects.filter((object) => object.is_valid_bom_item) ?? [];
    const readDetail = readDocument
      ? `${this.native.readResult?.filePath.split(/[\\/]/).at(-1)} · ${readDocument.objects.length} 个对象 · ${bomItems.length} 个 BOM 项 · ${readDocument.xlinks.length} 个 XLink · 根节点 ${readDocument.root_names.join(", ") || "无"}`
      : this.native.readError ?? "尚未读取 FCStd；此操作不会创建数据库或写回文件。";
    const lightRead = this.native.lightReadResult;
    const lightReadDetail = this.native.lightReading
      ? "正在用 TypeScript 读取 FCStd 的 Document.xml…"
      : this.native.lightReadError
        ? `TS 轻量读取失败：${this.native.lightReadError}`
        : lightRead
          ? `${lightRead.filePath.split(/[\\/]/).at(-1)} · ${lightRead.analysis.objectCount} 个对象 · ${lightRead.analysis.xlinks.length} 个 XLink · XML ${lightRead.analysis.documentXmlBytes.toLocaleString()} bytes`
          : "无需 Desk Tools：读取 ZIP 中的 Document.xml，提取对象数量与 XLink。";
    const lightDiagnostics = lightRead?.xlinkDiagnostics;
    const lightDiagnosticDetail = !lightRead
      ? "轻量读取工作区内文件后会直接解析 XLink 目标。"
      : !lightDiagnostics
        ? "文件不在当前工作区中，仅显示原始 XLink。"
        : `已解析 ${lightDiagnostics.counts.resolved}，缺失 ${lightDiagnostics.counts.missing}，歧义 ${lightDiagnostics.counts.ambiguous}，自引用 ${lightDiagnostics.counts.self}。`;
    const xlinkDiagnostics = this.native.xlinkDiagnostics;
    const xlinkDetail = !readDocument
      ? "读取 FCStd 后按 Wing CAD Core 规则诊断 XLink。"
      : readDocument.xlinks.length === 0
        ? "当前文档没有 XLink。"
        : !xlinkDiagnostics
          ? "当前文件不在已打开的本机工作区中，无法执行工作区目标解析。"
          : `已解析 ${xlinkDiagnostics.counts.resolved}，缺失 ${xlinkDiagnostics.counts.missing}，歧义 ${xlinkDiagnostics.counts.ambiguous}，自引用 ${xlinkDiagnostics.counts.self}。`;
    const indexedFiles = this.native.indexResults?.reduce((sum, result) => sum + result.files, 0) ?? 0;
    const indexedReferences = this.native.indexResults?.reduce((sum, result) => sum + result.references, 0) ?? 0;
    const indexedBomLines = this.native.indexResults?.reduce((sum, result) => sum + result.bomLines, 0) ?? 0;
    const scanDetail = this.native.scanning
      ? "正在扫描 FCStd、解析 Document.xml 并更新 SQLite 索引…"
      : this.native.scanError
        ? `扫描失败：${this.native.scanError}`
        : this.native.workspaceFiles
          ? this.native.indexError
            ? `发现 ${this.native.workspaceFiles.length} 个 FCStd；SQLite 入库未完成：${this.native.indexError}`
            : `发现 ${this.native.workspaceFiles.length} 个 FCStd；已入库 ${indexedFiles} 个文件、${indexedReferences} 条引用和 ${indexedBomLines} 条基础 BOM。`
          : "尚未扫描工作区。";
    const searchDetail = this.native.searching
      ? "正在搜索 SQLite 文件索引…"
      : this.native.searchError
        ? `索引搜索失败：${this.native.searchError}`
        : this.native.searchResult
          ? `“${this.native.searchResult.text || "全部"}”命中 ${this.native.searchResult.items.length} 个文件（${this.native.searchResult.source === "sqlite" ? "SQLite 索引" : "VS Code 扫描回退"}）。`
          : "扫描入库后，可按路径、文件名、零件号或名称搜索。";
    const queryResult = this.native.queryResult;
    const queryDetail = this.native.querying
      ? "正在通过 VS Code 内置 SQLite 只读查询 Schema v13…"
      : this.native.queryError
        ? `查询失败：${this.native.queryError}`
        : queryResult
          ? `${queryResult.relativePath} · ${queryResult.summary.counts.flat_lines} 条 BOM · ${queryResult.summary.counts.incoming} 个入向引用 · ${queryResult.summary.counts.outgoing} 个出向引用`
          : "尚未查询；扫描工作区可由本插件创建或更新 Schema v13 数据库，不需要 CAD 深度读取器。";
    const queryItems = queryResult
      ? [
        ...queryResult.summary.bom.slice(0, 4).map((row) => `${row.part_key} × ${row.quantity}`),
        ...queryResult.summary.incoming.slice(0, 2).map((row) => `被 ${row.host_filename} 引用`),
        ...queryResult.summary.outgoing.slice(0, 2).map((row) => `引用 ${row.target_filename}`),
      ]
      : [];
    const tool = ktcGetCadDetailTool(activeToolId);
    const section = (title: string, body: string, items: readonly string[] = []): string => `
      <section>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </section>`;
    const directNotice = `
      <div class="notice success">
        <strong>无需 Desk Tools</strong>
        <p>此能力由插件内 TypeScript / Wing CAD Core 直接提供。</p>
      </div>`;
    const deskNotice = `
      <div class="notice warning">
        <strong>${nativeReady ? "CAD 读取器已就绪" : "需要 CAD 深度读取器"}</strong>
        <p>读取 FCStd 内部对象时会直接调用 Desk Tools 安装目录中的读取程序；不要求 Desk Tools 桌面窗口正在运行。路径可在 Auto Code 的 Desk Tools 设置中管理。</p>
        <p class="notice-detail">当前状态：${escapeHtml(nativeReady ? "读取器可用" : nativeErrors || "未发现读取器")}</p>
      </div>`;
    const databaseNotice = `
      <div class="notice info">
        <strong>TypeScript + SQLite</strong>
        <p>“检索”会创建或更新 .phoenix 下的 Schema v13 文件索引与基础 BOM；查询保持只读，不需要 Desk Tools。</p>
      </div>`;
    const providerItems = this.native.status
      ? KTC_CAD_NATIVE_TOOLS.map((nativeTool) => {
        const status = this.native.status!.tools[nativeTool];
        return `${nativeTool}：${status.ready ? "protocol v1 已就绪" : status.error || "不可用"}`;
      })
      : [];
    let toolContent = "";
    if (tool.id === "cadFilename") {
      toolContent = directNotice
        + section("当前 FCStd", filenameDetail)
        + section("原型说明", "后续可在此增加零件号规则校验、命名建议和批量重命名预览。");
    } else if (tool.id === "cadScan") {
      toolContent = directNotice
        + section("扫描与入库", scanDetail, this.native.workspaceFiles?.slice(0, 8)
          .map((file) => `${file.entry.filename} · ${file.entry.partKey || "未识别零件号"}`) ?? [])
        + section("文件搜索", searchDetail, this.native.searchResult?.items.slice(0, 12)
          .map(({ row }) => `${row.repo_rel_path} · ${[row.part_number, row.part_version].filter(Boolean).join(".") || "未识别零件号"}`) ?? [])
        + section("轻量边界", "VS Code API 负责发现文件；TypeScript 只解压 Document.xml，提取文件名语义和 XLink。复杂对象属性与精确数量留给可选 Rust 读取器。");
    } else if (tool.id === "cadRead") {
      toolContent = directNotice
        + section("TS 轻量读取", lightReadDetail, lightRead?.analysis.xlinks.slice(0, 12)
          .map((xlink) => `${xlink.label || "XLink"} · ${xlink.file}`) ?? [])
        + section("TS XLink 诊断", lightDiagnosticDetail, lightDiagnostics?.items.slice(0, 12)
          .map((item) => `${item.label || item.file}：${item.message}`) ?? [])
        + deskNotice
        + section("Desk 深度读取", readDetail, bomItems.slice(0, 8)
          .map((object) => `BOM · ${object.label || object.name}`))
        + section("深度 XLink 规则诊断", xlinkDetail, xlinkDiagnostics?.items.slice(0, 8)
          .map((item) => `${item.label || item.file}：${item.message}`) ?? []);
    } else if (tool.id === "cadQuery") {
      toolContent = databaseNotice
        + section("数据库查询", queryDetail, queryItems)
        + section("分析边界", "查询 BOM、入向引用和出向引用；TS 索引提供 XLink 基础 BOM，Rust 增强数据可继续写入同一 Schema。");
    } else {
      const capabilityItems = [
        "文件名语义：TypeScript / Wing CAD Core，直接可用",
        "工作区检索：VS Code 文件 API，直接可用",
        "索引入库：TypeScript + node:sqlite，创建或更新 Schema v13",
        "基础 BOM：TypeScript 解压 Document.xml 并分析 XLink",
        "BOM 与引用查询：node:sqlite，只读索引结果",
        `FCStd 内容读取：${nativeReady ? "CAD 深度读取器已就绪" : "未发现 CAD 深度读取器"}`,
      ];
      toolContent = section("连接总览", detail, capabilityItems)
        + section("Native 诊断", nativeErrors || "没有发现 native provider 错误。", providerItems)
        + section("最近 XLink 诊断", xlinkDetail, xlinkDiagnostics?.items.slice(0, 8)
          .map((item) => `${item.file}：${item.status} · ${item.message}`) ?? []);
    }
    return toolContent;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isShellApiV2(value: unknown): value is KtcAutoCodeShellApiV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<KtcAutoCodeShellApiV2>;
  return candidate.version === 2
    && typeof candidate.getModuleState === "function"
    && typeof candidate.activateModule === "function"
    && typeof candidate.toggleModule === "function"
    && typeof candidate.registerModuleBlockProvider === "function"
    && typeof candidate.refreshModuleBlock === "function"
    && typeof candidate.showModuleTool === "function"
    && typeof candidate.closeModuleTool === "function";
}

async function collectWorkspaceFcstdFiles(
  workspaceFolder?: vscode.WorkspaceFolder,
): Promise<NonNullable<NativeConnection["workspaceFiles"]>> {
  const include = workspaceFolder
    ? new vscode.RelativePattern(workspaceFolder, FCSTD_GLOB)
    : FCSTD_GLOB;
  const uris = await vscode.workspace.findFiles(include, FCSTD_EXCLUDE_GLOB, 5_000);
  return uris.flatMap((uri) => {
    const relativePath = vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/");
    const entry = describeCadWorkspaceFiles([relativePath])[0];
    return entry ? [{ uri, entry }] : [];
  }).sort((left, right) => left.entry.relativePath.localeCompare(
    right.entry.relativePath,
    undefined,
    { numeric: true, sensitivity: "base" },
  ));
}

async function indexCadWorkspaceFiles(
  files: readonly { readonly uri: vscode.Uri; readonly entry: KtcCadWorkspaceEntry }[],
): Promise<readonly KtcCadWorkspaceIndexResult[]> {
  const results: KtcCadWorkspaceIndexResult[] = [];
  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    if (workspaceFolder.uri.scheme !== "file") continue;
    const folderFiles = files.filter((file) => (
      vscode.workspace.getWorkspaceFolder(file.uri)?.uri.toString() === workspaceFolder.uri.toString()
    ));
    const records = await mapConcurrent(folderFiles, 4, async ({ uri, entry }): Promise<KtcCadIndexRecord> => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const analysis = analyzeFcstdBytes(bytes);
        return {
          relativePath: entry.relativePath,
          filename: entry.filename,
          documentKind: entry.documentKind,
          sizeBytes: bytes.byteLength,
          objectCount: analysis.objectCount,
          xlinks: analysis.xlinks,
        };
      } catch (error) {
        let sizeBytes = 0;
        try { sizeBytes = Number((await vscode.workspace.fs.stat(uri)).size); } catch { /* keep searchable */ }
        return {
          relativePath: entry.relativePath,
          filename: entry.filename,
          documentKind: entry.documentKind,
          sizeBytes,
          objectCount: 0,
          xlinks: [],
          parseError: error instanceof Error ? error.message : String(error),
        };
      }
    });
    const databaseDirectory = vscode.Uri.joinPath(workspaceFolder.uri, ".phoenix");
    await vscode.workspace.fs.createDirectory(databaseDirectory);
    const databaseUri = vscode.Uri.joinPath(databaseDirectory, PNW_WORKSPACE_DATABASE_FILENAME);
    results.push(await writeCadWorkspaceIndex(
      databaseUri.fsPath,
      workspaceFolder.uri.fsPath,
      buildCadWorkspaceIndex(records),
    ));
  }
  return Object.freeze(results);
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, worker));
  return results;
}

function searchWorkspaceFilesInMemory(
  files: readonly { readonly uri: vscode.Uri; readonly entry: KtcCadWorkspaceEntry }[],
  searchText: string,
): { workspaceFolder: vscode.WorkspaceFolder; row: KtcCadIndexSearchRow }[] {
  const term = searchText.trim().toLocaleLowerCase("en-US");
  return files.flatMap(({ uri, entry }) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const searchable = [entry.relativePath, entry.filename, entry.partKey, entry.partName]
      .filter(Boolean)
      .join("\n")
      .toLocaleLowerCase("en-US");
    if (!workspaceFolder || (term && !searchable.includes(term))) return [];
    const partSegments = entry.partKey?.split(".") ?? [];
    return [{
      workspaceFolder,
      row: {
        repo_rel_path: entry.relativePath,
        filename: entry.filename,
        asset_kind: entry.documentKind.toLocaleLowerCase("en-US"),
        part_number: partSegments[0] || null,
        part_version: partSegments.slice(1).join(".") || null,
        part_name: entry.partName || null,
        label: entry.partName || null,
      },
    }];
  });
}

function updateXlinkDiagnostics(native: NativeConnection): void {
  const read = native.readResult;
  if (!read?.relativePath || !read.workspaceFolderUri || !native.workspaceFiles) {
    native.xlinkDiagnostics = undefined;
    return;
  }
  const workspaceRelativePaths = native.workspaceFiles
    .filter((file) => vscode.workspace.getWorkspaceFolder(file.uri)?.uri.toString() === read.workspaceFolderUri)
    .map((file) => file.entry.relativePath);
  native.xlinkDiagnostics = diagnoseCadXlinks(
    read.relativePath,
    read.response.result.xlinks,
    workspaceRelativePaths,
  );
}

async function connectAutoCodeShell(): Promise<ShellConnection> {
  const extension = vscode.extensions.getExtension(AUTO_CODE_EXTENSION_ID);
  if (!extension) return { error: "未安装 KT Auto Code。请先安装基础插件，再安装 KT Auto CAD。" };
  try {
    const exports: unknown = await extension.activate();
    if (!isShellApiV2(exports)) return { error: "KT Auto Code Shell API 版本不兼容，请升级基础插件。" };
    return { api: exports };
  } catch (error) {
    return { error: `KT Auto Code 激活失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const connection = await connectAutoCodeShell();
  const native: NativeConnection = {};
  const output = vscode.window.createOutputChannel("KT Auto CAD");
  const blockProvider = new CadBlockProvider(connection, native, () => {
    void connection.api?.refreshModuleBlock("cad");
  });
  let blockRegistration: KtcModuleBlockRegistration | undefined;
  let connectionRefresh: Promise<void> | undefined;

  const registerBlockProvider = (): void => {
    blockRegistration?.dispose();
    blockRegistration = connection.api?.registerModuleBlockProvider("cad", blockProvider);
  };
  registerBlockProvider();

  if (!connection.api) {
    void vscode.window.showWarningMessage(connection.error ?? "KT Auto Code Shell API 不可用，请升级基础插件。");
  }

  const refreshConnection = async (): Promise<void> => {
    if (connectionRefresh) return connectionRefresh;
    connectionRefresh = (async () => {
      const next = await connectAutoCodeShell();
      connection.api = next.api;
      connection.error = next.error;
      registerBlockProvider();
      blockProvider.refresh();
    })();
    try { await connectionRefresh; }
    finally { connectionRefresh = undefined; }
  };

  const refreshNative = async (): Promise<void> => {
    if (native.checking) return native.checking;
    native.checking = (async () => {
      native.status = await inspectCadNativeTools();
      blockProvider.refresh();
    })();
    try { await native.checking; }
    finally { native.checking = undefined; }
  };

  const requireShell = async (): Promise<KtcAutoCodeShellApiV2 | undefined> => {
    if (!connection.api) await refreshConnection();
    if (connection.api) return connection.api;
    void vscode.window.showErrorMessage(connection.error ?? "KT Auto Code Shell API 不可用。");
    return undefined;
  };

  const openOverview = async (toolId: string): Promise<boolean> => {
    const shell = await requireShell();
    if (!shell) return false;
    const opened = await shell.showModuleTool("cad", toolId);
    if (!opened) {
      void vscode.window.showErrorMessage("KT Auto Code 尚未识别 CAD 模块，请重试或重新加载窗口。");
      return false;
    }
    return true;
  };

  context.subscriptions.push(
    output,
    { dispose: () => blockRegistration?.dispose() },
    vscode.commands.registerCommand("ktAutoCad.open", async () => {
      await openOverview("cadFilename");
    }),
    ...([
      ["ktAutoCad.block.filename", "cadFilename"],
      ["ktAutoCad.block.scan", "cadScan"],
      ["ktAutoCad.block.read", "cadRead"],
      ["ktAutoCad.block.query", "cadQuery"],
      ["ktAutoCad.block.provider", "cadRead"],
      ["ktAutoCad.block.diagnostics", "cadDiagnostics"],
    ] as const).map(([command, toolId]) => vscode.commands.registerCommand(command, async () => {
      await openOverview(toolId);
    })),
    vscode.commands.registerCommand("ktAutoCad.module.show", async () => {
      const shell = await requireShell();
      if (!shell) return false;
      return shell.getModuleState().visible.includes("cad") || await shell.toggleModule("cad");
    }),
    vscode.commands.registerCommand("ktAutoCad.module.hide", async () => {
      const shell = await requireShell();
      if (!shell) return false;
      return !shell.getModuleState().visible.includes("cad") || await shell.toggleModule("cad");
    }),
    vscode.commands.registerCommand("ktAutoCad.selectDeskToolsProvider", async () => {
      if (!await openOverview("cadRead")) return;
      if (await selectDeskToolsProvider()) {
        await refreshNative();
        if (native.status?.ready) void vscode.window.showInformationMessage("CAD 深度读取器已就绪。");
        else void vscode.window.showErrorMessage("CAD 深度读取器校验失败，请运行能力诊断。");
      }
    }),
    vscode.commands.registerCommand("ktAutoCad.scanWorkspace", async () => {
      if (!await openOverview("cadScan")) return;
      if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showErrorMessage("请先打开一个工作区再扫描 FCStd。");
        return;
      }
      native.scanning = Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "扫描并索引工作区 FCStd",
      }, async () => {
        try {
          native.workspaceFiles = await collectWorkspaceFcstdFiles();
          updateXlinkDiagnostics(native);
          native.scanError = undefined;
          try {
            native.indexResults = await indexCadWorkspaceFiles(native.workspaceFiles);
            native.indexError = undefined;
          } catch (error) {
            native.indexResults = undefined;
            native.indexError = error instanceof Error ? error.message : String(error);
          }
        } catch (error) {
          native.workspaceFiles = undefined;
          native.indexResults = undefined;
          native.scanError = error instanceof Error ? error.message : String(error);
        } finally {
          native.scanning = undefined;
          blockProvider.refresh();
        }
      }));
      blockProvider.refresh();
      await native.scanning;
      if (native.workspaceFiles && !native.scanError) {
        const indexed = native.indexResults?.reduce((sum, result) => sum + result.files, 0) ?? 0;
        const references = native.indexResults?.reduce((sum, result) => sum + result.references, 0) ?? 0;
        const bomLines = native.indexResults?.reduce((sum, result) => sum + result.bomLines, 0) ?? 0;
        output.appendLine(`[检索] 工作区共 ${native.workspaceFiles.length} 个 FCStd；SQLite ${indexed} 文件 / ${references} 引用 / ${bomLines} BOM（不使用 Desk Tools）`);
        for (const file of native.workspaceFiles.slice(0, 200)) output.appendLine(`  ${file.entry.relativePath}`);
        if (native.workspaceFiles.length > 200) output.appendLine(`  …其余 ${native.workspaceFiles.length - 200} 项省略`);
        if (native.indexError) {
          output.appendLine(`[SQLite] ${native.indexError}`);
          void vscode.window.showWarningMessage(`KT Auto CAD：找到 ${native.workspaceFiles.length} 个 FCStd，但 SQLite 入库未完成。`);
        } else {
          void vscode.window.showInformationMessage(`KT Auto CAD：已扫描并索引 ${native.workspaceFiles.length} 个 FCStd。`);
        }
      }
    }),
    vscode.commands.registerCommand("ktAutoCad.searchWorkspaceIndex", async () => {
      if (!await openOverview("cadScan")) return;
      const searchText = await vscode.window.showInputBox({
        title: "搜索 CAD 文件索引",
        prompt: "支持路径、文件名、零件号、版本和名称；留空列出前 200 项",
        value: native.searchResult?.text ?? "",
      });
      if (searchText === undefined) return;
      native.searching = Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `搜索 CAD 索引${searchText ? `：${searchText}` : ""}`,
      }, async () => {
        try {
          const items: { workspaceFolder: vscode.WorkspaceFolder; row: KtcCadIndexSearchRow }[] = [];
          let searchedDatabases = 0;
          let sqliteFailed = false;
          for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
            if (workspaceFolder.uri.scheme !== "file") continue;
            const databaseUri = vscode.Uri.joinPath(workspaceFolder.uri, ".phoenix", PNW_WORKSPACE_DATABASE_FILENAME);
            try { await vscode.workspace.fs.stat(databaseUri); } catch { continue; }
            try {
              const rows = await searchCadWorkspaceIndex(databaseUri.fsPath, searchText);
              searchedDatabases += 1;
              items.push(...rows.map((row) => ({ workspaceFolder, row })));
            } catch {
              sqliteFailed = true;
            }
          }
          const fallback = searchedDatabases === 0 && (sqliteFailed || native.workspaceFiles?.length)
            ? searchWorkspaceFilesInMemory(native.workspaceFiles ?? [], searchText)
            : undefined;
          native.searchResult = {
            text: searchText,
            source: fallback ? "vscode" : "sqlite",
            items: Object.freeze((fallback ?? items).slice(0, 200)),
          };
          native.searchError = undefined;
        } catch (error) {
          native.searchResult = undefined;
          native.searchError = error instanceof Error ? error.message : String(error);
        } finally {
          native.searching = undefined;
          blockProvider.refresh();
        }
      }));
      blockProvider.refresh();
      await native.searching;
      if (native.searchError) {
        void vscode.window.showErrorMessage(native.searchError);
        return;
      }
      const items = native.searchResult?.items ?? [];
      if (!items.length) {
        void vscode.window.showInformationMessage("CAD 文件索引没有匹配项；可先执行“扫描并更新 SQLite 索引”。");
        return;
      }
      const picks = items.map((item) => ({
        label: item.row.filename,
        description: [item.row.part_number, item.row.part_version].filter(Boolean).join("."),
        detail: `${item.workspaceFolder.name} · ${item.row.repo_rel_path}`,
        item,
      }));
      const selected = await vscode.window.showQuickPick(picks, {
        title: `CAD 文件索引：${items.length} 项`,
        placeHolder: "选择文件后在资源管理器中定位；Esc 仅保留 Block 结果",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (selected) {
        const uri = vscode.Uri.joinPath(selected.item.workspaceFolder.uri, ...selected.item.row.repo_rel_path.split("/"));
        await vscode.commands.executeCommand("revealInExplorer", uri);
      }
    }),
    vscode.commands.registerCommand("ktAutoCad.readFcstdLight", async (resource?: vscode.Uri) => {
      if (!await openOverview("cadRead")) return;
      let selectedUri = resource?.scheme === "file" && /\.fcstd$/i.test(resource.fsPath)
        ? resource
        : undefined;
      if (!selectedUri) {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          filters: { "FreeCAD 文档": ["FCStd", "fcstd"] },
          openLabel: "TS 轻量读取",
          title: "选择要轻量读取的 FCStd 文件",
        });
        selectedUri = selected?.[0];
      }
      if (!selectedUri) return;
      native.lightReading = Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `TS 读取 ${selectedUri.fsPath.split(/[\\/]/).at(-1)}`,
      }, async () => {
        try {
          const bytes = await vscode.workspace.fs.readFile(selectedUri);
          const analysis = analyzeFcstdBytes(bytes);
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(selectedUri);
          const relativePath = workspaceFolder
            ? vscode.workspace.asRelativePath(selectedUri, false).replaceAll("\\", "/")
            : undefined;
          let diagnostics: KtcCadXlinkDiagnosticSummary | undefined;
          if (workspaceFolder && relativePath) {
            const otherFolders = native.workspaceFiles?.filter((file) => (
              vscode.workspace.getWorkspaceFolder(file.uri)?.uri.toString() !== workspaceFolder.uri.toString()
            )) ?? [];
            const folderFiles = await collectWorkspaceFcstdFiles(workspaceFolder);
            native.workspaceFiles = [...otherFolders, ...folderFiles];
            diagnostics = diagnoseCadXlinks(
              relativePath,
              analysis.xlinks,
              folderFiles.map((file) => file.entry.relativePath),
            );
          }
          native.lightReadResult = {
            filePath: selectedUri.fsPath,
            relativePath,
            analysis,
            xlinkDiagnostics: diagnostics,
          };
          native.lightReadError = undefined;
        } catch (error) {
          native.lightReadResult = undefined;
          native.lightReadError = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(native.lightReadError);
        } finally {
          native.lightReading = undefined;
          blockProvider.refresh();
        }
      }));
      blockProvider.refresh();
      await native.lightReading;
      if (native.lightReadResult) {
        output.appendLine(`[TS 读取] ${native.lightReadResult.filePath} · objects=${native.lightReadResult.analysis.objectCount} xlinks=${native.lightReadResult.analysis.xlinks.length}`);
      }
    }),
    vscode.commands.registerCommand("ktAutoCad.readFcstd", async (resource?: vscode.Uri) => {
      if (!await openOverview("cadRead")) return;
      await refreshNative();
      const readTool = native.status?.tools["fcstd-read"];
      if (!native.status?.ready || !readTool?.ready) {
        void vscode.window.showErrorMessage("未发现通过校验的 CAD 深度读取器；请打开 Desk Tools 设置。");
        return;
      }
      let selectedUri = resource?.scheme === "file" ? resource : undefined;
      if (!selectedUri) {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          filters: { "FreeCAD 文档": ["FCStd", "fcstd"] },
          openLabel: "只读分析",
          title: "选择要读取的 FCStd 文件",
        });
        selectedUri = selected?.[0];
      }
      if (!selectedUri) return;
      const selectedPath = selectedUri.fsPath;
      native.reading = Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `读取 ${selectedPath.split(/[\\/]/).at(-1)}`,
      }, async () => {
        try {
          const response = await readFcstdWithNativeV1(readTool.binaryPath, selectedPath);
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(selectedUri);
          const relativePath = workspaceFolder
            ? vscode.workspace.asRelativePath(selectedUri, false).replaceAll("\\", "/")
            : undefined;
          native.readResult = {
            filePath: selectedPath,
            relativePath,
            workspaceFolderUri: workspaceFolder?.uri.toString(),
            response,
          };
          if (workspaceFolder && !native.workspaceFiles?.some((file) => (
            vscode.workspace.getWorkspaceFolder(file.uri)?.uri.toString() === workspaceFolder.uri.toString()
          ))) {
            const otherFolders = native.workspaceFiles?.filter((file) => (
              vscode.workspace.getWorkspaceFolder(file.uri)?.uri.toString() !== workspaceFolder.uri.toString()
            )) ?? [];
            native.workspaceFiles = [...otherFolders, ...await collectWorkspaceFcstdFiles(workspaceFolder)];
          }
          updateXlinkDiagnostics(native);
          native.readError = undefined;
        } catch (error) {
          native.readResult = undefined;
          native.xlinkDiagnostics = undefined;
          native.readError = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(native.readError);
        } finally {
          native.reading = undefined;
          blockProvider.refresh();
        }
      }));
      blockProvider.refresh();
      await native.reading;
    }),
    vscode.commands.registerCommand("ktAutoCad.queryWorkspaceDatabase", async (resource?: vscode.Uri) => {
      if (!await openOverview("cadQuery")) return;
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      let selectedUri = resource?.scheme === "file" && /\.fcstd$/i.test(resource.fsPath)
        ? resource
        : activeUri?.scheme === "file" && /\.fcstd$/i.test(activeUri.fsPath)
          ? activeUri
          : native.readResult
            ? vscode.Uri.file(native.readResult.filePath)
            : native.searchResult?.items[0]
              ? vscode.Uri.joinPath(
                native.searchResult.items[0].workspaceFolder.uri,
                ...native.searchResult.items[0].row.repo_rel_path.split("/"),
              )
            : undefined;
      if (!selectedUri) {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          filters: { "FreeCAD 文档": ["FCStd", "fcstd"] },
          openLabel: "查询 BOM 与引用",
          title: "选择要查询基础 BOM 与引用的 FCStd",
        });
        selectedUri = selected?.[0];
      }
      if (!selectedUri) return;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(selectedUri);
      if (!workspaceFolder || workspaceFolder.uri.scheme !== "file") {
        void vscode.window.showErrorMessage("只能查询本机工作区内的 FCStd 数据。请将文件加入当前工作区。");
        return;
      }
      const databaseUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        ".phoenix",
        PNW_WORKSPACE_DATABASE_FILENAME,
      );
      try {
        await vscode.workspace.fs.stat(databaseUri);
      } catch {
        const message = `未找到 ${databaseUri.fsPath}；请先在“检索”Block 执行“扫描并更新 SQLite 索引”。`;
        native.queryError = message;
        blockProvider.refresh();
        void vscode.window.showErrorMessage(message);
        return;
      }
      const relativePath = vscode.workspace.asRelativePath(selectedUri, false).replaceAll("\\", "/");
      native.querying = Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `查询 ${relativePath} 的 BOM 与引用`,
      }, async () => {
        try {
          const summary = await queryCadWorkspaceSummary(
            databaseUri.fsPath,
            relativePath,
          );
          native.queryResult = {
            databasePath: databaseUri.fsPath,
            relativePath,
            summary,
          };
          native.queryError = undefined;
        } catch (error) {
          native.queryResult = undefined;
          native.queryError = error instanceof Error ? error.message : String(error);
          void vscode.window.showErrorMessage(native.queryError);
        } finally {
          native.querying = undefined;
          blockProvider.refresh();
        }
      }));
      blockProvider.refresh();
      await native.querying;
      if (native.queryResult && !native.queryError) {
        const counts = native.queryResult.summary.counts;
        output.appendLine(`[数据库] ${relativePath} · BOM ${counts.flat_lines} · 入向 ${counts.incoming} · 出向 ${counts.outgoing}（node:sqlite 只读）`);
      }
    }),
    vscode.commands.registerCommand("ktAutoCad.diagnostics", async () => {
      if (!await openOverview("cadDiagnostics")) return;
      if (!connection.api) await refreshConnection();
      await refreshNative();
      const state = connection.api?.getModuleState();
      output.appendLine(`[KT Auto Code] ${connection.api ? "Shell API v2 已连接" : connection.error}`);
      if (state) output.appendLine(`[模块] installed=${state.installed.join(",")} visible=${state.visible.join(",")} active=${state.active}`);
      if (native.status) {
        output.appendLine(`[Native] platform=${native.status.platformKey} ready=${native.status.ready} provider=${native.status.providerPath || "未配置"} workspace_schema=${native.status.workspaceSchemaVersion ?? "未知"}`);
        for (const tool of KTC_CAD_NATIVE_TOOLS) {
          const status = native.status.tools[tool];
          output.appendLine(`  ${tool}: ${status.ready ? "protocol v1 已就绪" : status.error}`);
        }
      }
      if (native.xlinkDiagnostics) {
        const counts = native.xlinkDiagnostics.counts;
        output.appendLine(`[XLink] resolved=${counts.resolved} missing=${counts.missing} ambiguous=${counts.ambiguous} self=${counts.self}`);
        for (const item of native.xlinkDiagnostics.items) {
          output.appendLine(`  ${item.file}: ${item.status} · ${item.message}`);
        }
      }
      output.show(true);
      blockProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("ktAutoCode.deskTools.nativeProviderManifest")
          || event.affectsConfiguration("ktAutoCad.deskToolsProviderManifest")) void refreshNative();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => blockProvider.refresh()),
  );

}
