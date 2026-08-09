import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_REGISTRATION_BYTES = 64 * 1024;

export type KtcDeskToolsServiceRegistration = {
  readonly schema_version: 1;
  readonly service: "phoenix-desk-tools";
  readonly protocol_version: 1;
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly pid: number;
  readonly instance_id: string;
  readonly started_at: string;
  readonly health_path: "/api/caa/health";
  readonly caa_open_path: "/api/caa/dialog/open";
};

export type KtcDeskToolsInstallationRegistration = {
  readonly schema_version: 1;
  readonly product: "phoenix-desk-tools";
  readonly product_version: string;
  readonly native_provider_manifest: string;
  readonly updated_at: string;
};

function platformConfigRoot(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  homeDirectory: string,
): string {
  if (platform === "darwin") return path.join(homeDirectory, "Library", "Application Support");
  if (platform === "win32") {
    const local = String(env.LOCALAPPDATA || "").trim();
    return local || path.join(homeDirectory, "AppData", "Local");
  }
  const xdg = String(env.XDG_CONFIG_HOME || "").trim();
  return xdg ? path.resolve(xdg) : path.join(homeDirectory, ".config");
}

export function ktcDeskToolsRegistrationDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory = os.homedir(),
): string {
  const override = String(env.PHOENIX_DESK_TOOLS_REGISTRY_DIR || "").trim();
  if (override) return path.resolve(override);
  return path.join(platformConfigRoot(platform, env, homeDirectory), "phoenix-wing", "phoenix", "services", "desk-tools");
}

function readRegistration(filePath: string): unknown {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_REGISTRATION_BYTES) return undefined;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function ktcIsDeskToolsServiceRegistration(value: unknown): value is KtcDeskToolsServiceRegistration {
  const item = objectValue(value);
  return item?.schema_version === 1
    && item.service === "phoenix-desk-tools"
    && item.protocol_version === 1
    && item.host === "127.0.0.1"
    && Number.isInteger(item.port) && Number(item.port) >= 1 && Number(item.port) <= 65_535
    && Number.isInteger(item.pid) && Number(item.pid) > 0
    && typeof item.instance_id === "string" && item.instance_id.length >= 8 && item.instance_id.length <= 200
    && typeof item.started_at === "string" && Number.isFinite(Date.parse(item.started_at))
    && item.health_path === "/api/caa/health"
    && item.caa_open_path === "/api/caa/dialog/open";
}

export function ktcIsDeskToolsInstallationRegistration(value: unknown): value is KtcDeskToolsInstallationRegistration {
  const item = objectValue(value);
  return item?.schema_version === 1
    && item.product === "phoenix-desk-tools"
    && typeof item.product_version === "string"
    && item.product_version.length > 0 && item.product_version.length <= 100
    && typeof item.native_provider_manifest === "string"
    && item.native_provider_manifest.length > 0 && item.native_provider_manifest.length <= 16_384
    && path.isAbsolute(item.native_provider_manifest)
    && path.basename(item.native_provider_manifest) === "native-provider.json"
    && typeof item.updated_at === "string" && Number.isFinite(Date.parse(item.updated_at));
}

export function ktcReadDeskToolsServiceRegistration(
  directory = ktcDeskToolsRegistrationDirectory(),
): KtcDeskToolsServiceRegistration | undefined {
  const value = readRegistration(path.join(directory, "service.v1.json"));
  return ktcIsDeskToolsServiceRegistration(value) ? value : undefined;
}

export function ktcReadDeskToolsInstallationRegistration(
  directory = ktcDeskToolsRegistrationDirectory(),
): KtcDeskToolsInstallationRegistration | undefined {
  const value = readRegistration(path.join(directory, "installation.v1.json"));
  return ktcIsDeskToolsInstallationRegistration(value) ? value : undefined;
}

export function ktcDeskToolsOpenEndpoint(registration: KtcDeskToolsServiceRegistration): string {
  return `http://127.0.0.1:${registration.port}${registration.caa_open_path}`;
}
