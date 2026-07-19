export const LOCAL_EXTENSION_SNAPSHOT_PREFIX: string;
export const LOCAL_EXTENSION_SNAPSHOT_PREVIEW_ROOT: string;

export interface ExtensionSnapshotSource {
  readonly id: string;
  readonly path: string;
}

export function isLocalWingExtensionHostEnvironment(
  environment?: Record<string, string | undefined>,
): boolean;

export function shouldCopyExtensionSnapshotPath(
  extensionRoot: string,
  sourcePath: string,
): boolean;

export function snapshotExtensionPaths(
  extensions: readonly ExtensionSnapshotSource[],
  options?: { readonly temporaryDirectory?: string },
): {
  readonly snapshotRoot: string;
  readonly extensionRoot: string;
  readonly paths: readonly string[];
};
