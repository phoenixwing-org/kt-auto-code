import { cpSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { LOCAL_WING_ENV, LOCAL_WING_MODE_ENV } from "./local-wing-resolution.mjs";

export const LOCAL_EXTENSION_SNAPSHOT_PREFIX = "kt-auto-code-local-host-";
export const LOCAL_EXTENSION_SNAPSHOT_PREVIEW_ROOT = join(
  tmpdir(),
  `${LOCAL_EXTENSION_SNAPSHOT_PREFIX}<runtime>`,
  "extensions",
);

const SKIPPED_DIRECTORY_NAMES = new Set([".git", "node_modules"]);

/** 本地 Wing 的两个环境变量必须成对出现，避免把普通 Registry 启动误判为本地模式。 */
export function isLocalWingExtensionHostEnvironment(environment = process.env) {
  const enabled = String(environment[LOCAL_WING_MODE_ENV] ?? "").trim() === "1";
  const root = String(environment[LOCAL_WING_ENV] ?? "").trim();
  if (enabled !== Boolean(root)) {
    throw new Error(
      `[local-wing] ${LOCAL_WING_MODE_ENV} 与 ${LOCAL_WING_ENV} 必须同时设置后才能启动本地 Host`,
    );
  }
  return enabled;
}

/** 复制运行扩展所需内容；依赖树、Git 元数据和旧 VSIX 不进入临时快照。 */
export function shouldCopyExtensionSnapshotPath(extensionRoot, sourcePath) {
  const path = relative(extensionRoot, sourcePath);
  if (!path) return true;
  const parts = path.split(sep);
  if (parts.some((part) => SKIPPED_DIRECTORY_NAMES.has(part))) return false;
  const name = parts.at(-1) ?? "";
  return name !== ".DS_Store" && !name.endsWith(".vsix");
}

export function snapshotExtensionPaths(
  extensions,
  { temporaryDirectory = tmpdir() } = {},
) {
  const snapshotRoot = mkdtempSync(join(temporaryDirectory, LOCAL_EXTENSION_SNAPSHOT_PREFIX));
  const extensionRoot = join(snapshotRoot, "extensions");
  mkdirSync(extensionRoot, { recursive: true });

  const paths = extensions.map((extension) => {
    const target = join(extensionRoot, extension.id);
    cpSync(extension.path, target, {
      recursive: true,
      preserveTimestamps: true,
      filter: (source) => shouldCopyExtensionSnapshotPath(extension.path, source),
    });
    if (!existsSync(join(target, "dist", "extension.js"))) {
      throw new Error(`[local-wing] 扩展快照缺少 dist/extension.js：${target}`);
    }
    return target;
  });

  return { snapshotRoot, extensionRoot, paths };
}
