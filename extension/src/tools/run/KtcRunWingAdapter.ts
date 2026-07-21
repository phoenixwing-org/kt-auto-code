import * as KtcRunCoreImport from "@phoenix-wing/run-core";
import * as KtcRunNodeImport from "@phoenix-wing/run-node";
import type { KtcRunPlatform } from "../../../../src/run/KtcRunModel.js";

export interface KtcPnwRunProject {
  readonly id: string;
  readonly workspaceFolderUri: string;
  readonly rootUri: string;
  readonly relativePath: string;
  readonly label: string;
  readonly kinds: readonly string[];
  readonly evidence: readonly { readonly path: string; readonly kind: string; readonly weight: number; readonly reason: string }[];
}

export interface KtcPnwRunTarget {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly action: string;
  readonly sourceKind: string;
  readonly sourceUri?: string;
  readonly platforms: readonly KtcRunPlatform[];
  readonly cwd: string;
  readonly program?: string;
  readonly args: readonly string[];
  readonly envKeys: readonly string[];
  readonly problemMatchers: readonly string[];
  readonly matcherFidelity: string;
  readonly risk: string;
  readonly priority: number;
  readonly disabledReason?: string;
}

export interface KtcPnwRunDiscoveryResult {
  readonly workspaceRoot: string;
  readonly projects: readonly KtcPnwRunProject[];
  readonly targets: readonly KtcPnwRunTarget[];
  readonly diagnostics: readonly { readonly code: string; readonly path?: string; readonly message: string }[];
  readonly incomplete: boolean;
  readonly scannedFiles: number;
}

export interface KtcPnwRunLaunchPlan {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly problemMatchers: readonly string[];
}

export interface KtcPnwRunLogicalTarget {
  readonly projectId: string;
  readonly action: string;
  readonly recommended: KtcPnwRunTarget;
  readonly alternatives: readonly KtcPnwRunTarget[];
}

interface KtcPnwRunCoreModule {
  pnwResolveRunCaaVersion(input: {
    readonly explicit?: string;
    readonly target?: string;
    readonly environment?: string;
    readonly suggested?: string;
  }): { readonly value: string; readonly source: "explicit" | "target" | "environment" | "suggested" };
  pnwGroupRunTargets(targets: readonly KtcPnwRunTarget[]): KtcPnwRunLogicalTarget[];
}

interface KtcPnwRunNodeModule {
  pnwDiscoverRunWorkspace(
    workspaceRoot: string,
    options: { readonly platform: KtcRunPlatform; readonly maxFiles?: number; readonly maxTaskFiles?: number },
  ): Promise<KtcPnwRunDiscoveryResult>;
  pnwCreateBundledCaaLaunchPlan(
    target: KtcPnwRunTarget,
    options: {
      readonly platform: KtcRunPlatform;
      readonly resourceRoot: string;
      readonly caaVersion: string;
      readonly relatedProjectRoots?: readonly string[];
    },
  ): KtcPnwRunLaunchPlan;
  pnwCreateBundledClangFormatLaunchPlan(
    target: KtcPnwRunTarget,
    options: { readonly resourceRoot: string; readonly runtimeProgram: string },
  ): KtcPnwRunLaunchPlan;
}

const KtcRunCore = KtcRunCoreImport as KtcPnwRunCoreModule;
const KtcRunNode = KtcRunNodeImport as KtcPnwRunNodeModule;

export class KtcRunWingAdapter {
  discover(workspaceRoot: string, platform: KtcRunPlatform): Promise<KtcPnwRunDiscoveryResult> {
    return KtcRunNode.pnwDiscoverRunWorkspace(workspaceRoot, { platform });
  }

  resolveCaaVersion(input: Parameters<KtcPnwRunCoreModule["pnwResolveRunCaaVersion"]>[0]):
  ReturnType<KtcPnwRunCoreModule["pnwResolveRunCaaVersion"]> {
    return KtcRunCore.pnwResolveRunCaaVersion(input);
  }

  groupTargets(targets: readonly KtcPnwRunTarget[]): KtcPnwRunLogicalTarget[] {
    return KtcRunCore.pnwGroupRunTargets(targets);
  }

  createBundledCaaLaunchPlan(
    target: KtcPnwRunTarget,
    options: Parameters<KtcPnwRunNodeModule["pnwCreateBundledCaaLaunchPlan"]>[1],
  ): KtcPnwRunLaunchPlan {
    return KtcRunNode.pnwCreateBundledCaaLaunchPlan(target, options);
  }

  createBundledClangFormatLaunchPlan(
    target: KtcPnwRunTarget,
    options: Parameters<KtcPnwRunNodeModule["pnwCreateBundledClangFormatLaunchPlan"]>[1],
  ): KtcPnwRunLaunchPlan {
    return KtcRunNode.pnwCreateBundledClangFormatLaunchPlan(target, options);
  }
}
