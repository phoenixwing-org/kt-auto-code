import {
  pnwIsCadNativeProtocolInfo,
  pnwIsCadNativeProviderManifestV1,
  pnwIsCadNativeV1Compatible,
  type PnwCadNativeProtocolInfo,
  type PnwCadNativeProviderManifestV1,
} from "@phoenix-wing/cad-contracts";
import {
  PNW_WORKSPACE_DATABASE_FILENAME,
  PNW_WORKSPACE_SCHEMA_ID,
  PNW_WORKSPACE_SCHEMA_V13_SHA256,
  PNW_WORKSPACE_SCHEMA_VERSION,
} from "@phoenix-wing/workspace-schema";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
const QUERY_TIMEOUT_MS = 5_000;
const PROVIDER_FILENAME = "native-provider.json";
const PROVIDER_SETTING = "deskToolsProviderManifest";

export const KTC_CAD_NATIVE_TOOLS = ["fcstd-read", "fcstd-xlink"] as const;
export type KtcCadNativeTool = (typeof KTC_CAD_NATIVE_TOOLS)[number];

const REQUIRED_CAPABILITY: Readonly<Record<KtcCadNativeTool, string>> = {
  "fcstd-read": "read",
  "fcstd-xlink": "scan",
};

export interface KtcCadNativeToolStatus {
  readonly tool: KtcCadNativeTool;
  readonly binaryPath: string;
  readonly ready: boolean;
  readonly info?: PnwCadNativeProtocolInfo;
  readonly error?: string;
}

export interface KtcCadNativeStatus {
  readonly platformKey: string;
  readonly providerPath: string;
  readonly providerVersion?: string;
  readonly workspaceSchemaVersion?: number;
  readonly ready: boolean;
  readonly tools: Readonly<Record<KtcCadNativeTool, KtcCadNativeToolStatus>>;
}

export function configuredDeskToolsProvider(): string {
  return vscode.workspace.getConfiguration("ktAutoCad").get<string>(PROVIDER_SETTING, "").trim();
}

export async function selectDeskToolsProvider(): Promise<string | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "使用此 Desk Tools provider",
    title: "选择 Desk Tools 安装目录或 native-provider.json",
  });
  if (!selected?.[0]) return undefined;
  const providerPath = await resolveProviderPath(selected[0].fsPath);
  if (!providerPath) {
    void vscode.window.showErrorMessage("所选位置未找到 Desk Tools runtime/native-provider.json");
    return undefined;
  }
  await vscode.workspace.getConfiguration("ktAutoCad").update(
    PROVIDER_SETTING,
    providerPath,
    vscode.ConfigurationTarget.Global,
  );
  return providerPath;
}

export async function inspectCadNativeTools(
  configuredPath = configuredDeskToolsProvider(),
): Promise<KtcCadNativeStatus> {
  const platformKey = `${process.platform}-${process.arch}`;
  const unavailable = (error: string, providerPath = ""): KtcCadNativeStatus => ({
    platformKey,
    providerPath,
    ready: false,
    tools: Object.fromEntries(KTC_CAD_NATIVE_TOOLS.map((tool) => [tool, {
      tool,
      binaryPath: "",
      ready: false,
      error,
    }])) as Record<KtcCadNativeTool, KtcCadNativeToolStatus>,
  });

  if (vscode.env.remoteName) {
    return unavailable(`远程 ${vscode.env.remoteName} 工作区不能使用本机 Desk Tools provider`);
  }
  if (!configuredPath) return unavailable("尚未配置 Desk Tools native provider");

  const providerPath = await resolveProviderPath(configuredPath);
  if (!providerPath) return unavailable("Desk Tools native-provider.json 路径已失效", configuredPath);

  let manifest: PnwCadNativeProviderManifestV1;
  try {
    const value: unknown = JSON.parse(await readFile(providerPath, "utf8"));
    manifest = validateProviderManifest(value, platformKey);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error), providerPath);
  }

  const providerRoot = path.dirname(providerPath);
  const entries = await Promise.all(KTC_CAD_NATIVE_TOOLS.map(async (tool) => (
    [tool, await inspectTool(providerRoot, manifest, tool)] as const
  )));
  const tools = Object.fromEntries(entries) as Record<KtcCadNativeTool, KtcCadNativeToolStatus>;
  return {
    platformKey,
    providerPath,
    providerVersion: manifest.provider_version,
    workspaceSchemaVersion: manifest.workspace_schema.schema_version,
    ready: KTC_CAD_NATIVE_TOOLS.every((tool) => tools[tool].ready),
    tools,
  };
}

async function resolveProviderPath(selectedPath: string): Promise<string | undefined> {
  const resolved = path.resolve(selectedPath);
  const candidates = [
    resolved,
    path.join(resolved, PROVIDER_FILENAME),
    path.join(resolved, "runtime", PROVIDER_FILENAME),
    path.join(resolved, "resources", "runtime", PROVIDER_FILENAME),
    path.join(resolved, "Contents", "Resources", "runtime", PROVIDER_FILENAME),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile() && path.basename(candidate) === PROVIDER_FILENAME) return candidate;
    } catch {
      // Try the next supported Desk Tools layout.
    }
  }
  return undefined;
}

function validateProviderManifest(value: unknown, platformKey: string): PnwCadNativeProviderManifestV1 {
  if (!pnwIsCadNativeProviderManifestV1(value) || value.provider_id !== "phoenix-desk-tools") {
    throw new Error("不是受支持的 Desk Tools provider manifest v1");
  }
  if (`${value.platform}-${value.arch}` !== platformKey) {
    throw new Error(`Desk Tools provider 平台不匹配：${value.platform}-${value.arch}`);
  }
  const schema = value.workspace_schema;
  if (schema.schema_id !== PNW_WORKSPACE_SCHEMA_ID
      || schema.schema_version !== PNW_WORKSPACE_SCHEMA_VERSION
      || schema.ddl_sha256 !== PNW_WORKSPACE_SCHEMA_V13_SHA256
      || schema.database_filename !== PNW_WORKSPACE_DATABASE_FILENAME) {
    throw new Error(`Desk Tools provider 的 workspace Schema 与插件契约不一致（需要 v${PNW_WORKSPACE_SCHEMA_VERSION}）`);
  }
  return value;
}

async function inspectTool(
  providerRoot: string,
  manifest: PnwCadNativeProviderManifestV1,
  tool: KtcCadNativeTool,
): Promise<KtcCadNativeToolStatus> {
  const declared = manifest.tools[tool];
  const binaryPath = path.resolve(providerRoot, declared.relative_path);
  const relative = path.relative(providerRoot, binaryPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { tool, binaryPath, ready: false, error: "provider 工具路径越界" };
  }
  try {
    await access(binaryPath);
    const hash = createHash("sha256").update(await readFile(binaryPath)).digest("hex");
    if (hash !== declared.sha256) return { tool, binaryPath, ready: false, error: "provider 工具 SHA-256 不匹配" };
    const { stdout, stderr } = await execFileAsync(binaryPath, ["--protocol-version"], {
      encoding: "utf8",
      timeout: QUERY_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    if (stderr.trim()) return { tool, binaryPath, ready: false, error: `能力查询写入 stderr：${stderr.trim()}` };
    const info: unknown = JSON.parse(stdout.trim());
    if (!pnwIsCadNativeProtocolInfo(info) || info.tool !== tool || !pnwIsCadNativeV1Compatible(info)) {
      return { tool, binaryPath, ready: false, error: "工具 native protocol v1 握手失败" };
    }
    if (!info.capabilities.includes(REQUIRED_CAPABILITY[tool])) {
      return { tool, binaryPath, ready: false, info, error: `缺少能力：${REQUIRED_CAPABILITY[tool]}` };
    }
    return { tool, binaryPath, ready: true, info };
  } catch (error) {
    return { tool, binaryPath, ready: false, error: error instanceof Error ? error.message : String(error) };
  }
}
