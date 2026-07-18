import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_WING_ENV = "PHOENIX_WING_ROOT";
export const LOCAL_WING_MODE_ENV = "PHOENIX_WING_DEV_MODE";

export const LOCAL_WING_CODE_PACKAGES = Object.freeze([
  "@phoenix-wing/code-core",
  "@phoenix-wing/kt-codegen",
]);

export const LOCAL_WING_CAD_PACKAGES = Object.freeze([
  "@phoenix-wing/cad-core",
  "@phoenix-wing/cad-contracts",
  "@phoenix-wing/workspace-schema",
]);

export const LOCAL_WING_ALL_PACKAGES = Object.freeze([
  ...LOCAL_WING_CODE_PACKAGES,
  ...LOCAL_WING_CAD_PACKAGES,
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function selectExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  for (const condition of ["import", "node", "default", "require"]) {
    const selected = selectExportTarget(value[condition]);
    if (selected) return selected;
  }
  return undefined;
}

export function getDefaultLocalWingRoot(repoRoot) {
  return resolve(repoRoot, "..", "phoenix-wing");
}

export function resolveLocalWingRoot({ repoRoot, environment = process.env, cwd = process.cwd() }) {
  const configured = String(environment[LOCAL_WING_ENV] ?? "").trim();
  const root = configured
    ? resolve(isAbsolute(configured) ? configured : resolve(cwd, configured))
    : getDefaultLocalWingRoot(repoRoot);
  const manifestPath = resolve(root, "package.json");
  const packagesPath = resolve(root, "packages");
  if (!existsSync(manifestPath) || !existsSync(packagesPath)) {
    const source = configured ? LOCAL_WING_ENV + "=" + configured : "默认并列目录 ../phoenix-wing";
    throw new Error(
      "[local-wing] " + source + " 不可用：" + root + "\n"
      + "请将 kt-auto-code 与 phoenix-wing 并列安装，或设置 PHOENIX_WING_ROOT。\n"
      + "如需测试 npm Registry 正式包，请改用 pnpm dev:registry。",
    );
  }
  const manifest = readJson(manifestPath);
  if (manifest.name !== "phoenix-wing") {
    throw new Error(
      "[local-wing] 目录不是 phoenix-wing 仓库：" + root
      + "（package.json name=" + String(manifest.name ?? "<missing>") + "）",
    );
  }
  return root;
}

export function discoverLocalWingPackages(wingRoot) {
  const packagesRoot = resolve(wingRoot, "packages");
  const packages = new Map();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = resolve(packagesRoot, entry.name);
    const manifestPath = resolve(packageRoot, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@phoenix-wing/")) continue;
    packages.set(manifest.name, { manifest, packageRoot });
  }
  return packages;
}

export function resolveLocalWingImport(specifier, packages) {
  const match = /^(@phoenix-wing\/[^/]+)(\/.*)?$/u.exec(specifier);
  if (!match) return undefined;
  const [, packageName, suffix = ""] = match;
  const localPackage = packages.get(packageName);
  if (!localPackage) {
    throw new Error("本地 phoenix-wing 缺少包 " + packageName + "（import: " + specifier + "）");
  }
  const exportKey = suffix ? "." + suffix : ".";
  const exportsField = localPackage.manifest.exports;
  const exportValue = typeof exportsField === "string"
    ? (exportKey === "." ? exportsField : undefined)
    : exportsField?.[exportKey];
  const target = selectExportTarget(exportValue)
    ?? (exportKey === "." ? localPackage.manifest.module ?? localPackage.manifest.main : undefined);
  if (!target || typeof target !== "string") {
    throw new Error(packageName + " 未声明本地入口 " + exportKey + "（import: " + specifier + "）");
  }
  const resolvedTarget = resolve(localPackage.packageRoot, target);
  if (!existsSync(resolvedTarget)) {
    throw new Error(
      specifier + " 的本地构建入口不存在：" + resolvedTarget + "\n"
      + "请先执行 pnpm ext:dev:prepare，或直接执行 pnpm dev。",
    );
  }
  return resolvedTarget;
}

export function validateRequiredLocalWingPackages(wingRoot, requiredPackages = LOCAL_WING_ALL_PACKAGES) {
  const packages = discoverLocalWingPackages(wingRoot);
  const missing = requiredPackages.filter((packageName) => !packages.has(packageName));
  if (missing.length > 0) {
    throw new Error("[local-wing] 缺少必需包：" + missing.join("、"));
  }
  for (const packageName of requiredPackages) {
    const manifest = packages.get(packageName).manifest;
    if (typeof manifest.scripts?.build !== "string" || !manifest.scripts.build.trim()) {
      throw new Error("[local-wing] " + packageName + " 未声明 scripts.build");
    }
    const rootTarget = selectExportTarget(
      typeof manifest.exports === "string" ? manifest.exports : manifest.exports?.["."],
    ) ?? manifest.module ?? manifest.main;
    if (typeof rootTarget !== "string" || !rootTarget.startsWith("./dist/")) {
      throw new Error("[local-wing] " + packageName + " 未声明 dist 主入口");
    }
  }
  const codegen = packages.get("@phoenix-wing/kt-codegen");
  if (codegen && !selectExportTarget(codegen.manifest.exports?.["./table"])) {
    throw new Error("[local-wing] @phoenix-wing/kt-codegen 未声明 ./table 入口");
  }
  return packages;
}

export function createLocalWingEsbuildPlugin(wingRoot) {
  const packages = discoverLocalWingPackages(wingRoot);
  return {
    name: "phoenix-wing-local-dist",
    setup(build) {
      build.onResolve({ filter: /^@phoenix-wing\// }, (args) => {
        try {
          return { path: resolveLocalWingImport(args.path, packages) };
        } catch (error) {
          return { errors: [{ text: error instanceof Error ? error.message : String(error) }] };
        }
      });
    },
  };
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(".." + sep) && path !== ".." && !isAbsolute(path));
}

export function verifyLocalWingBuildResults({
  results,
  wingRoot,
  expectedPackages,
  buildRoot = process.cwd(),
}) {
  const inputs = results.flatMap((result) => Object.keys(result.metafile?.inputs ?? {}))
    .map((input) => resolve(buildRoot, input));
  const registryInputs = inputs.filter((input) => {
    const normalized = input.split(sep).join("/");
    return /\/node_modules\/(?:\.pnpm\/@phoenix-wing\+|@phoenix-wing\/)/u.test(normalized);
  });
  if (registryInputs.length > 0) {
    throw new Error(
      "[local-wing] 构建混入 consumer node_modules 中的 Wing：\n" + registryInputs.join("\n"),
    );
  }
  const packages = discoverLocalWingPackages(wingRoot);
  const missing = expectedPackages.filter((packageName) => {
    const localPackage = packages.get(packageName);
    return !localPackage || !inputs.some((input) => isInside(localPackage.packageRoot, input));
  });
  if (missing.length > 0) {
    throw new Error("[local-wing] 构建未消费预期本地包：" + missing.join("、"));
  }
  console.log(
    "[local-wing] 解析门禁通过："
    + expectedPackages.join("、")
    + " 均来自并列仓库；consumer node_modules 命中 0",
  );
}

export function localWingBuildContextFromEnvironment({
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  environment = process.env,
} = {}) {
  const configured = String(environment[LOCAL_WING_ENV] ?? "").trim();
  const enabled = String(environment[LOCAL_WING_MODE_ENV] ?? "").trim() === "1";
  if (!configured && !enabled) return undefined;
  if (configured && !enabled) {
    throw new Error(
      "[local-wing] 检测到 PHOENIX_WING_ROOT，但未处于受控本地开发模式。\n"
      + "请使用 pnpm dev；正式 npm 包对照请使用 pnpm dev:registry。",
    );
  }
  if (enabled && !configured) {
    throw new Error("[local-wing] PHOENIX_WING_DEV_MODE=1 时必须同时设置 PHOENIX_WING_ROOT");
  }
  const wingRoot = resolveLocalWingRoot({ repoRoot, environment });
  console.log("[local-wing] 构建来源：本地 " + wingRoot);
  return {
    wingRoot,
    plugins: [createLocalWingEsbuildPlugin(wingRoot)],
  };
}
