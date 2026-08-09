import * as vscode from "vscode";
import { extname } from "node:path";
import {
  KtcCodegenDocumentService,
  type KtcDiscoveredCodegenDocument,
} from "./documentService.js";
import {
  KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT,
  ktcAssertCodegenDiscoveryComplete,
} from "./workspaceDiscoveryPolicy.js";

const ROOT_JSON_GLOB = "*.json";
const NESTED_JSON_GLOB = "**/*.json";
const ROOT_CSV_GLOB = "*.csv";
const NESTED_CSV_GLOB = "**/*.csv";
const CODEGEN_DISCOVERY_EXCLUDE = "**/{.git,.phoenix,node_modules,dist,build,out,target}/**";

export interface KtcCodegenWorkspaceDiscoveryResult {
  readonly documents: readonly KtcDiscoveredCodegenDocument[];
  readonly scannedJsonCount: number;
  readonly convertedCount: number;
  readonly deduplicatedCount: number;
  readonly conflictCount: number;
}

/** 工作区发现与旧 CSV 自动迁移 Service；不持有 View、会话或当前 JSON。 */
export class KtcCodegenWorkspaceDiscoveryService {
  constructor(private readonly documents: KtcCodegenDocumentService) {}

  async discover(
    roots: readonly vscode.Uri[],
    log: (message: string) => void,
    cancellationToken?: vscode.CancellationToken,
    reportProgress?: (message: string) => void,
  ): Promise<KtcCodegenWorkspaceDiscoveryResult> {
    if (cancellationToken?.isCancellationRequested) throw new vscode.CancellationError();
    const batches = await Promise.all(roots.map(async (root) => {
      const [rootJson, nestedJson, rootCsv, nestedCsv] = await Promise.all([
        vscode.workspace.findFiles(new vscode.RelativePattern(root, ROOT_JSON_GLOB), CODEGEN_DISCOVERY_EXCLUDE, KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT + 1, cancellationToken),
        vscode.workspace.findFiles(new vscode.RelativePattern(root, NESTED_JSON_GLOB), CODEGEN_DISCOVERY_EXCLUDE, KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT + 1, cancellationToken),
        vscode.workspace.findFiles(new vscode.RelativePattern(root, ROOT_CSV_GLOB), CODEGEN_DISCOVERY_EXCLUDE, KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT + 1, cancellationToken),
        vscode.workspace.findFiles(new vscode.RelativePattern(root, NESTED_CSV_GLOB), CODEGEN_DISCOVERY_EXCLUDE, KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT + 1, cancellationToken),
      ]);
      const json = [...new Map([...rootJson, ...nestedJson].map((uri) => [uri.toString(), uri])).values()];
      const csv = [...new Map([...rootCsv, ...nestedCsv].map((uri) => [uri.toString(), uri])).values()];
      ktcAssertCodegenDiscoveryComplete(root.fsPath, json.length, csv.length);
      return { json, csv };
    }));
    const foundJson = [...new Map(batches.flatMap((batch) => batch.json)
      .map((uri) => [uri.toString(), uri])).values()];
    const foundCsv = [...new Map(batches.flatMap((batch) => batch.csv)
      .map((uri) => [uri.toString(), uri])).values()];
    const jsonByUri = new Map(foundJson.map((uri) => [uri.toString(), uri]));
    if (cancellationToken?.isCancellationRequested) throw new vscode.CancellationError();
    reportProgress?.(`已定位 ${foundJson.length} 份 JSON、${foundCsv.length} 份 CSV，正在识别格式…`);
    let convertedCount = 0;
    let deduplicatedCount = 0;
    let conflictCount = 0;

    for (const csvUri of foundCsv) {
      if (cancellationToken?.isCancellationRequested) throw new vscode.CancellationError();
      try {
        const target = this.csvTargetUri(csvUri);
        const converted = await this.documents.convertCsv(csvUri, target, false);
        if (converted.kind === "converted") convertedCount += 1;
        else if (converted.kind === "deduplicated") deduplicatedCount += 1;
        else if (converted.kind === "conflict") conflictCount += 1;
        if (converted.kind === "converted" || converted.kind === "deduplicated") {
          jsonByUri.set(target.toString(), target);
          log(`[Codegen] ${converted.kind === "converted" ? "自动转换" : "清理重复 CSV"}：${csvUri.fsPath} → ${target.fsPath}`);
        }
      } catch (error) {
        conflictCount += 1;
        log(`[Codegen] CSV 自动转换失败，已保留源文件：${csvUri.fsPath}；${error instanceof Error ? error.message : String(error)}`);
      }
    }

    reportProgress?.(`正在点检 ${jsonByUri.size} 份 JSON 的 Codegen 数据模型…`);
    const inspected = await Promise.all(
      [...jsonByUri.values()].map((uri) => this.documents.inspect(uri)),
    );
    if (cancellationToken?.isCancellationRequested) throw new vscode.CancellationError();
    return {
      documents: inspected.filter((document): document is KtcDiscoveredCodegenDocument => !!document),
      scannedJsonCount: foundJson.length,
      convertedCount,
      deduplicatedCount,
      conflictCount,
    };
  }

  private csvTargetUri(csvUri: vscode.Uri): vscode.Uri {
    const suffix = extname(csvUri.fsPath);
    return vscode.Uri.file(`${csvUri.fsPath.slice(0, -suffix.length)}.json`);
  }
}
