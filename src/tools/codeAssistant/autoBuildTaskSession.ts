import type {
  KtcAutoBuildTask,
  KtcAutoBuildTaskChild,
} from "./autoBuildContracts.js";

function normalizePath(value: string | undefined): string {
  let normalized = (value?.trim() || "").replace(/\\/gu, "/");
  if (!normalized) return "";
  if (/^\/+$/u.test(normalized)) normalized = "/";
  else if (/^[A-Za-z]:\/+$/u.test(normalized)) normalized = `${normalized.slice(0, 2)}/`;
  else normalized = normalized.replace(/\/+$/u, "");
  const windowsStyle = /^[A-Za-z]:\//u.test(normalized) || /^\/\/[^/]/u.test(normalized);
  return windowsStyle ? normalized.toLowerCase() : normalized;
}

/** Stable session identity. Planner ids may be index-based and collide across one-project plans. */
export function ktcAutoBuildTaskSessionKey(task: KtcAutoBuildTask): string {
  return `${task.phase}:${normalizePath(task.path) || task.id}`;
}

function preserveChildStatuses(
  previous: readonly KtcAutoBuildTaskChild[] | undefined,
  planned: readonly KtcAutoBuildTaskChild[] | undefined,
): KtcAutoBuildTaskChild[] | undefined {
  if (!planned) return undefined;
  const previousById = new Map((previous ?? []).map((child) => [child.id, child]));
  return planned.map((child) => ({
    ...child,
    status: previousById.get(child.id)?.status ?? child.status,
  }));
}

/** Rebuild a complete plan without erasing outcomes for tasks that still represent the same work. */
export function ktcReconcileAutoBuildTaskPlan(
  previous: readonly KtcAutoBuildTask[],
  planned: readonly KtcAutoBuildTask[],
): KtcAutoBuildTask[] {
  const previousByKey = new Map(previous.map((task) => [ktcAutoBuildTaskSessionKey(task), task]));
  return planned.map((task) => {
    const prior = previousByKey.get(ktcAutoBuildTaskSessionKey(task));
    if (!prior) return structuredClone(task);
    return {
      ...structuredClone(task),
      id: prior.id,
      status: prior.status,
      children: preserveChildStatuses(prior.children, task.children),
    };
  });
}

function uniqueTaskId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
}

/** Replace matching task rows and append genuinely new work while retaining every unrelated outcome. */
export function ktcUpsertAutoBuildSessionTasks(
  previous: readonly KtcAutoBuildTask[],
  incoming: readonly KtcAutoBuildTask[],
): KtcAutoBuildTask[] {
  const result = previous.map((task) => structuredClone(task));
  const indexByKey = new Map(result.map((task, index) => [ktcAutoBuildTaskSessionKey(task), index]));
  const usedIds = new Set(result.map(({ id }) => id));
  for (const task of incoming) {
    const key = ktcAutoBuildTaskSessionKey(task);
    const index = indexByKey.get(key);
    if (index !== undefined) {
      const id = result[index]!.id;
      result[index] = { ...structuredClone(task), id };
      continue;
    }
    const id = uniqueTaskId(task.id, usedIds);
    usedIds.add(id);
    indexByKey.set(key, result.length);
    result.push({ ...structuredClone(task), id });
  }
  return result;
}
