import ts from "typescript";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverLocalWingPackages,
  localWingBuildContextFromEnvironment,
  resolveLocalWingImport,
} from "./local-wing-resolution.mjs";

/** Resolve declarations from the same built public entry points as local esbuild. */
export function createLocalWingTypecheckHost(options, packages) {
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, containingFile) => names.map((name) => {
    const local = name.startsWith("@phoenix-wing/");
    const target = local ? resolveLocalWingImport(name, packages) : name;
    const resolved = ts.resolveModuleName(target, containingFile, options, host).resolvedModule;
    const typedLocal = resolved && (resolved.resolvedFileName.endsWith(".d.ts")
      || (target.endsWith(".json") && resolved.extension === ts.Extension.Json));
    if (local && !typedLocal) {
      throw new Error(`[local-wing] ${name} 缺少已构建的类型声明；不回退 Registry 类型`);
    }
    return resolved;
  });
  return host;
}

export function runTypecheck(repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const context = localWingBuildContextFromEnvironment({ repoRoot });
  const configPath = resolve(repoRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, repoRoot);
  const options = { ...parsed.options, noEmit: true };
  const host = context
    ? createLocalWingTypecheckHost(options, discoverLocalWingPackages(context.wingRoot))
    : ts.createCompilerHost(options);
  const program = ts.createProgram(parsed.fileNames, options, host);
  const diagnostics = [
    ...(config.error ? [config.error] : []),
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(program),
  ];
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => repoRoot,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }));
    return 1;
  }
  console.log(`[typecheck] ${context ? "本地 Wing dist 声明（未写入路径配置）" : "Registry / 当前 lockfile"} 通过`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runTypecheck();
}
