import { describe, expect, it } from "vitest";
import { KtcRenameHistoryStore, ktcNormalizeHistoryDocument } from "./renameHistory.js";

function memory(initial?: unknown) {
  let value = initial;
  return {
    get: <T>() => value as T | undefined,
    update: async (_key: string, next: unknown) => { value = next; },
  };
}

describe("rename history", () => {
  it("用户级成对历史按最近使用倒序并精确去重", async () => {
    const store = new KtcRenameHistoryStore(memory() as never);
    await store.rememberPair("Phoenix Hub", "Phoenix Desk");
    await store.rememberPair("KtRoot", "KtCore");
    const snapshot = await store.rememberPair("Phoenix Hub", "Phoenix Desk");

    expect(snapshot.pairs.map(({ source, target }) => [source, target])).toEqual([
      ["Phoenix Hub", "Phoenix Desk"],
      ["KtRoot", "KtCore"],
    ]);
  });

  it("项目方案按根目录隔离，恢复多变体规则且不写项目文件", async () => {
    const store = new KtcRenameHistoryStore(memory() as never);
    await store.rememberProjectPlan("/repos/project-a", {
      sourceName: "Phoenix Open Issue",
      targetName: "Phoenix Issue",
      sourcePrefix: "POI",
      targetPrefix: "PI",
      rules: [{ id: "kebab", style: "kebab", search: "phoenix-open-issue", replace: "phoenix-issue", enabled: true }],
    });

    expect(store.snapshot("/repos/project-b").projectPlans).toEqual([]);
    expect(store.snapshot("/repos/project-a").projectPlans[0]).toMatchObject({
      sourceName: "Phoenix Open Issue",
      targetName: "Phoenix Issue",
      sourcePrefix: "POI",
      rules: [{ style: "kebab", search: "phoenix-open-issue" }],
    });
    expect(store.snapshot("/repos/project-a").pairs[0]).toMatchObject({
      source: "Phoenix Open Issue",
      target: "Phoenix Issue",
    });
  });

  it("支持精确删除、分类清空和隐私清空全部本机历史", async () => {
    const store = new KtcRenameHistoryStore(memory() as never);
    await store.rememberPair("Sensitive Old", "Safe New");
    await store.rememberPair("Keep Old", "Keep New");
    await store.rememberProjectPlan("/repos/project-a", {
      sourceName: "Project Secret",
      targetName: "Project Public",
      sourcePrefix: "PS",
      targetPrefix: "PP",
      rules: [{ id: "display", style: "display", search: "Project Secret", replace: "Project Public", enabled: true }],
    });

    await store.forgetPair("Sensitive Old", "Safe New");
    expect(store.snapshot("/repos/project-a").pairs.map(({ source }) => source)).not.toContain("Sensitive Old");
    const projectId = store.snapshot("/repos/project-a").projectPlans[0]!.id;
    await store.forgetProjectPlan("/repos/project-a", projectId);
    expect(store.snapshot("/repos/project-a").projectPlans).toEqual([]);

    await store.clearPairs();
    expect(store.snapshot().pairs).toEqual([]);
    await store.rememberProjectPlan("/repos/project-b", {
      sourceName: "Another Old",
      targetName: "Another New",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [],
    });
    await store.clearAll();
    expect(store.snapshot("/repos/project-b")).toEqual({ pairs: [], projectPlans: [] });
  });

  it("损坏或越界的持久状态安全降级", () => {
    expect(ktcNormalizeHistoryDocument({ version: 99, pairs: [{ source: "a", target: "b" }] }))
      .toEqual({ version: 1, pairs: [], projectPlans: [] });
    expect(ktcNormalizeHistoryDocument({
      version: 1,
      pairs: [{ source: "", target: "b", updatedAt: "now" }],
      projectPlans: [{ id: "x", root: "/repo", updatedAt: "now", sourceName: "a" }],
    })).toEqual({ version: 1, pairs: [], projectPlans: [] });
  });
});
