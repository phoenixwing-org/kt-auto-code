export const LOCAL_WING_ENV: "PHOENIX_WING_ROOT";
export const LOCAL_WING_MODE_ENV: "PHOENIX_WING_DEV_MODE";
export const LOCAL_WING_CODE_PACKAGES: readonly string[];
export const LOCAL_WING_CAD_PACKAGES: readonly string[];
export const LOCAL_WING_ALL_PACKAGES: readonly string[];

export interface LocalWingPackage {
  manifest: Record<string, any>;
  packageRoot: string;
}

export function getDefaultLocalWingRoot(repoRoot: string): string;
export function resolveLocalWingRoot(options: {
  repoRoot: string;
  environment?: Record<string, string | undefined>;
  cwd?: string;
}): string;
export function discoverLocalWingPackages(wingRoot: string): Map<string, LocalWingPackage>;
export function resolveLocalWingImport(
  specifier: string,
  packages: Map<string, LocalWingPackage>,
): string | undefined;
export function validateRequiredLocalWingPackages(
  wingRoot: string,
  requiredPackages?: readonly string[],
): Map<string, LocalWingPackage>;
export function createLocalWingEsbuildPlugin(wingRoot: string): unknown;
export function verifyLocalWingBuildResults(options: {
  results: Array<{ metafile?: { inputs?: Record<string, unknown> } }>;
  wingRoot: string;
  expectedPackages: readonly string[];
  buildRoot?: string;
}): void;
export function localWingBuildContextFromEnvironment(options?: {
  repoRoot?: string;
  environment?: Record<string, string | undefined>;
}): { wingRoot: string; plugins: unknown[] } | undefined;
