import type { KtcPnwRunLogicalTarget, KtcPnwRunTarget } from "./KtcRunWingAdapter.js";

export interface KtcRunDisplayTarget {
  readonly target: KtcPnwRunTarget;
  readonly alternatives: readonly KtcPnwRunTarget[];
}

export interface KtcRunExecutionProviderOptions {
  readonly requireBundledCaaBuild: boolean;
}

/**
 * Keeps the recommended logical provider visible while also retaining the two
 * product-owned CAA bundled targets as explicit rows in the Built-in group.
 */
export function KtcSelectRunDisplayTargets(
  plainTargets: readonly KtcPnwRunTarget[],
  logicalTargets: readonly KtcPnwRunLogicalTarget[],
): KtcRunDisplayTarget[] {
  const result: KtcRunDisplayTarget[] = plainTargets.map((target) => ({ target, alternatives: [] }));
  const seen = new Set(result.map((item) => item.target.id));
  for (const logical of logicalTargets) {
    const providers = KtcUniqueProviders([logical.recommended, ...logical.alternatives]);
    KtcAppendProvider(result, seen, logical.recommended, providers);
    if (logical.action !== "caa-build" && logical.action !== "caa-run") continue;
    for (const bundled of providers.filter((target) => target.sourceKind === "bundled")) {
      KtcAppendProvider(result, seen, bundled, providers);
    }
  }
  return result;
}

/**
 * Resolves an execution-only provider without changing the row's stable id or
 * the source grouping used by the Primary UI.
 */
export function KtcSelectRunExecutionProvider(
  selected: KtcRunDisplayTarget,
  options: KtcRunExecutionProviderOptions,
): KtcRunDisplayTarget {
  if (!options.requireBundledCaaBuild
    || selected.target.action !== "caa-build"
    || selected.target.sourceKind === "bundled") {
    return selected;
  }
  const bundled = selected.alternatives.find((target) => target.action === "caa-build"
    && target.sourceKind === "bundled");
  if (!bundled) {
    throw new Error("关联工程需要内置 CAA MK runner，但当前发现结果中没有该 provider。");
  }
  return {
    target: bundled,
    alternatives: [selected.target, ...selected.alternatives.filter((target) => target.id !== bundled.id)],
  };
}

function KtcAppendProvider(
  result: KtcRunDisplayTarget[],
  seen: Set<string>,
  target: KtcPnwRunTarget,
  providers: readonly KtcPnwRunTarget[],
): void {
  if (seen.has(target.id)) return;
  seen.add(target.id);
  result.push({ target, alternatives: providers.filter((candidate) => candidate.id !== target.id) });
}

function KtcUniqueProviders(targets: readonly KtcPnwRunTarget[]): KtcPnwRunTarget[] {
  const byId = new Map<string, KtcPnwRunTarget>();
  for (const target of targets) if (!byId.has(target.id)) byId.set(target.id, target);
  return [...byId.values()];
}
