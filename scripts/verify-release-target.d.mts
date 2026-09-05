export interface ReleaseTargetArguments {
  readonly help: false;
  readonly expectedVersion: string;
  readonly expectedCommit: string;
}

export interface ReleaseTargetState {
  readonly packageVersion: unknown;
  readonly changelogVersion: string;
  readonly headCommit: string;
  readonly detachedHead: boolean;
  readonly worktreeStatus: string;
  readonly nodeVersion: string;
  readonly packageManager: unknown;
  readonly pnpmVersion: string;
  readonly leakedEnvironmentVariables: string[];
}

export const RELEASE_TARGET_USAGE: string;

export function parseReleaseTargetArgs(
  argv: readonly string[],
): ReleaseTargetArguments | { readonly help: true };

export function readFirstChangelogVersion(changelog: string): string;

export function pnpmVersionInvocation(
  platform?: NodeJS.Platform,
  environment?: Record<string, string | undefined>,
): { readonly command: string; readonly args: readonly string[] };

export function inspectReleaseTarget(options?: {
  readonly root?: string;
  readonly environment?: Record<string, string | undefined>;
  readonly platform?: NodeJS.Platform;
  readonly nodeVersion?: string;
  readonly pnpmVersion?: string;
}): ReleaseTargetState;

export function validateReleaseTarget(
  target: ReleaseTargetState,
  expected: { readonly expectedVersion: string; readonly expectedCommit: string },
): void;

export function runReleaseTargetPreflight(options?: {
  readonly root?: string;
  readonly argv?: readonly string[];
  readonly environment?: Record<string, string | undefined>;
  readonly platform?: NodeJS.Platform;
  readonly nodeVersion?: string;
  readonly pnpmVersion?: string;
}): { readonly help: true } | {
  readonly help: false;
  readonly target: ReleaseTargetState;
  readonly expectedVersion: string;
  readonly expectedCommit: string;
};
