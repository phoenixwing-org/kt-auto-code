import { basename, isAbsolute, relative } from "node:path";
import * as vscode from "vscode";
import {
  KTC_CODEGEN_APPLY_REPORT_DIRECTORY,
  ktcCodegenApplyReportFileName,
  ktcCodegenApplyReportSummary,
  ktcParseStoredCodegenApplyReport,
  ktcSerializeStoredCodegenApplyReport,
  type KtcCodegenApplyReportSummary,
  type KtcCodegenStoredApplyReport,
  type KtcCodegenStoredApplyReportIssue,
  type KtcCodegenStoredApplyReportItem,
  type KtcCodegenStoredLocation,
} from "./applyReportPersistence.js";
import {
  ktcCodegenBatchApplyReport,
  type KtcCodegenBatchApplyReport,
} from "./batchApplyReport.js";

export interface KtcCodegenApplyReportWorkspace {
  readonly name: string;
  readonly uri: vscode.Uri;
}

export interface KtcCodegenApplyReportIndex {
  readonly records: readonly KtcCodegenApplyReportRecord[];
  readonly invalidCount: number;
}

export interface KtcCodegenApplyReportRecord {
  readonly summary: KtcCodegenApplyReportSummary;
  readonly storageUri: string;
}

type ReportFileSystem = Pick<
  typeof vscode.workspace.fs,
  "createDirectory" | "readDirectory" | "readFile" | "writeFile" | "rename" | "delete"
>;

/** 持久报告 Host store；磁盘 schema 只含工作区相对路径，运行时 DTO 才恢复 URI。 */
export class KtcCodegenApplyReportStore {
  constructor(private readonly fs: ReportFileSystem = vscode.workspace.fs) {}

  async write(
    report: KtcCodegenBatchApplyReport,
    ownerRoot: vscode.Uri,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): Promise<KtcCodegenApplyReportRecord> {
    const stored = this.toStored(report, workspaces);
    const directory = this.directory(ownerRoot);
    const fileName = ktcCodegenApplyReportFileName(report);
    const target = vscode.Uri.joinPath(directory, fileName);
    const temporary = vscode.Uri.joinPath(directory, `.${fileName}.${report.reportId}.tmp`);
    await this.fs.createDirectory(directory);
    try {
      await this.fs.writeFile(temporary, ktcSerializeStoredCodegenApplyReport(stored));
      const verified = ktcParseStoredCodegenApplyReport(await this.fs.readFile(temporary));
      if (!verified || verified.reportId !== report.reportId) {
        throw new Error("临时报告复读校验失败");
      }
      await this.fs.rename(temporary, target, { overwrite: false });
    } catch (error) {
      try {
        await this.fs.delete(temporary);
      } catch {
        // 临时文件可能尚未建立；保留原始异常。
      }
      throw error;
    }
    return {
      summary: ktcCodegenApplyReportSummary(stored, fileName),
      storageUri: target.toString(),
    };
  }

  async list(roots: readonly vscode.Uri[]): Promise<KtcCodegenApplyReportIndex> {
    const records: KtcCodegenApplyReportRecord[] = [];
    let invalidCount = 0;
    const seen = new Set<string>();
    for (const root of roots) {
      const directory = this.directory(root);
      let entries: [string, vscode.FileType][];
      try {
        entries = await this.fs.readDirectory(directory);
      } catch (error) {
        if (isFileNotFound(error)) continue;
        invalidCount += 1;
        continue;
      }
      const files = entries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith(".json"))
        .map(([name]) => name)
        .sort((left, right) => right.localeCompare(left, "en"))
        .slice(0, 100);
      for (const fileName of files) {
        const uri = vscode.Uri.joinPath(directory, fileName);
        try {
          const report = ktcParseStoredCodegenApplyReport(await this.fs.readFile(uri));
          if (!report || seen.has(report.reportId)) {
            invalidCount += 1;
            continue;
          }
          seen.add(report.reportId);
          records.push({
            summary: ktcCodegenApplyReportSummary(report, fileName),
            storageUri: uri.toString(),
          });
        } catch {
          invalidCount += 1;
        }
      }
    }
    records.sort((left, right) => right.summary.startedAt.localeCompare(left.summary.startedAt));
    return { records, invalidCount };
  }

  async load(
    storageUri: string,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): Promise<KtcCodegenBatchApplyReport> {
    const report = ktcParseStoredCodegenApplyReport(await this.fs.readFile(vscode.Uri.parse(storageUri)));
    if (!report) throw new Error("报告 JSON 已损坏或 schema 不受支持");
    const items = report.items.map((item) => this.toRuntimeItem(item, workspaces));
    return ktcCodegenBatchApplyReport(items, report.elapsedMilliseconds, {
      reportId: report.reportId,
      applyKind: report.applyKind,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
    });
  }

  directory(root: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(root, ...KTC_CODEGEN_APPLY_REPORT_DIRECTORY.split("/"));
  }

  private toStored(
    report: KtcCodegenBatchApplyReport,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): KtcCodegenStoredApplyReport {
    const items = report.items.map((item): KtcCodegenStoredApplyReportItem => ({
      fileName: item.fileName,
      json: this.locationForUri(vscode.Uri.parse(item.documentId), workspaces),
      health: item.health,
      change: item.change,
      reasonCode: item.reasonCode,
      errorCount: item.errorCount,
      preflightRegionCount: item.preflightRegionCount,
      preflightArtifactCount: item.preflightArtifactCount,
      preflightDiagnosticCount: item.preflightDiagnosticCount,
      preflightErrorCount: item.preflightErrorCount,
      modifiedFileCount: item.modifiedFileCount,
      writtenRegionCount: item.writtenRegionCount,
      elapsedMilliseconds: item.elapsedMilliseconds,
      issues: item.issues.map((issue): KtcCodegenStoredApplyReportIssue => {
        const location = issue.path
          ? this.tryLocationForUri(vscode.Uri.file(issue.path), workspaces)
          : undefined;
          return {
            severity: issue.severity,
            code: issue.code,
            message: this.portableMessage(issue.message, workspaces),
          ...(location ? {
            location: {
              ...location,
              ...(issue.line === undefined ? {} : { line: issue.line }),
            },
          } : {}),
        };
      }),
    }));
    const health = items.some((item) => item.health === "error")
      ? "error"
      : items.some((item) => item.health === "warning") ? "warning" : "success";
    const changes = new Set(items.map((item) => item.change));
    const change = changes.has("partial") || (changes.has("updated") && changes.has("not-applied"))
      ? "partial"
      : changes.has("updated")
        ? "updated"
        : changes.has("not-applied")
          ? changes.has("unchanged") ? "partial" : "not-applied"
          : "unchanged";
    return {
      kind: report.kind,
      schemaVersion: report.schemaVersion,
      reportId: report.reportId,
      applyKind: report.applyKind,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      health,
      change,
      summary: {
        itemCount: items.length,
        modifiedFileCount: items.reduce((total, item) => total + item.modifiedFileCount, 0),
        writtenRegionCount: items.reduce((total, item) => total + item.writtenRegionCount, 0),
        errorCount: items.reduce((total, item) => total + item.issues.filter((issue) => issue.severity === "error").length, 0),
        warningCount: items.reduce((total, item) => total + item.issues.filter((issue) => issue.severity === "warning").length, 0),
      },
      elapsedMilliseconds: report.elapsedMilliseconds,
      items,
    };
  }

  private toRuntimeItem(
    item: KtcCodegenStoredApplyReportItem,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ) {
    const json = this.uriForLocation(item.json, workspaces);
    return {
      documentId: json.toString(),
      fileName: item.fileName,
      displayPath: json.toString(),
      health: item.health,
      change: item.change,
      reasonCode: item.reasonCode,
      errorCount: item.errorCount,
      preflightRegionCount: item.preflightRegionCount,
      preflightArtifactCount: item.preflightArtifactCount,
      preflightDiagnosticCount: item.preflightDiagnosticCount,
      preflightErrorCount: item.preflightErrorCount,
      modifiedFileCount: item.modifiedFileCount,
      writtenRegionCount: item.writtenRegionCount,
      elapsedMilliseconds: item.elapsedMilliseconds,
      issues: item.issues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        ...(issue.location ? {
          path: this.uriForLocation(issue.location, workspaces).fsPath,
          ...(issue.location.line === undefined ? {} : { line: issue.location.line }),
        } : {}),
      })),
    };
  }

  private locationForUri(
    uri: vscode.Uri,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): KtcCodegenStoredLocation {
    if (uri.scheme !== "file") throw new Error("报告只允许记录工作区内 file URI");
    const candidates = workspaces
      .filter((workspace) => workspace.uri.scheme === "file")
      .map((workspace) => ({ workspace, path: relative(workspace.uri.fsPath, uri.fsPath) }))
      .filter(({ path }) => path && path !== ".." && !path.startsWith(`..${separator(path)}`) && !isAbsolute(path))
      .sort((left, right) => right.workspace.uri.fsPath.length - left.workspace.uri.fsPath.length);
    const match = candidates[0];
    if (!match) throw new Error(`报告路径不在当前工作区：${basename(uri.fsPath)}`);
    return {
      workspaceFolder: match.workspace.name,
      path: match.path.replaceAll("\\", "/"),
    };
  }

  private tryLocationForUri(
    uri: vscode.Uri,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): KtcCodegenStoredLocation | undefined {
    try {
      return this.locationForUri(uri, workspaces);
    } catch {
      return undefined;
    }
  }

  private portableMessage(
    value: string,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): string {
    let result = value;
    for (const workspace of workspaces) {
      if (workspace.uri.scheme !== "file") continue;
      const replacement = `<workspace:${workspace.name}>`;
      result = result
        .replaceAll(workspace.uri.fsPath, replacement)
        .replaceAll(workspace.uri.fsPath.replaceAll("\\", "/"), replacement);
    }
    return result;
  }

  private uriForLocation(
    location: KtcCodegenStoredLocation,
    workspaces: readonly KtcCodegenApplyReportWorkspace[],
  ): vscode.Uri {
    const matches = workspaces.filter((workspace) => workspace.name === location.workspaceFolder);
    if (matches.length !== 1) throw new Error(`报告引用的工作区不可用：${location.workspaceFolder}`);
    return vscode.Uri.joinPath(matches[0]!.uri, ...location.path.split("/"));
  }
}

function separator(value: string): "/" | "\\" {
  return value.includes("\\") ? "\\" : "/";
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError
    ? error.code === "FileNotFound"
    : error instanceof Error && /file.?not.?found|enoent/iu.test(error.message);
}
