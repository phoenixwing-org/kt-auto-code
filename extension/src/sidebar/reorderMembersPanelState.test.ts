import { describe, expect, it } from "vitest";
import {
  ktcNextReorderSelection,
  ktcProjectReorderMembersPanel,
  ktcSetReorderSelection,
  type KtcReorderMembersPanelModel,
  type KtcReorderMembersPanelRow,
} from "./reorderMembersPanelState.js";

function row(uri: string, state: KtcReorderMembersPanelRow["state"]): KtcReorderMembersPanelRow {
  return {
    uri,
    relativePath: `very/long/project/path/${uri}.cpp`,
    kind: "source",
    encoding: "UTF-8",
    changed: state !== "unchanged",
    state,
    warnings: [],
  };
}

function model(
  reorderResults: readonly KtcReorderMembersPanelRow[] | undefined,
  extra: Partial<KtcReorderMembersPanelModel> = {},
): KtcReorderMembersPanelModel {
  return { presentation: "ribbon", status: "done", reorderResults, ...extra };
}

describe("reorder members panel state", () => {
  it("新 revision 默认选择全部 pending，但过滤 applied 与 unchanged", () => {
    const next = ktcNextReorderSelection(
      { selectedUris: [], revision: 1 },
      model([row("one", "pending"), row("two", "applied"), row("three", "unchanged")], {
        reorderRevision: 2,
      }),
    );
    expect(next).toEqual({ selectedUris: ["one"], revision: 2 });
  });

  it("同 revision 显式空选择由 Host 覆盖本地 optimistic，不能恢复默认勾选", () => {
    const next = ktcNextReorderSelection(
      { selectedUris: ["one", "two"], revision: 5 },
      model([row("one", "pending"), row("two", "pending")], {
        reorderRevision: 5,
        reorderSelectedUris: [],
      }),
    );
    expect(next).toEqual({ selectedUris: [], revision: 5 });
  });

  it("同 revision 缺少 Host 选择时保留本地取消，只剔除不再 pending 的 URI", () => {
    const next = ktcNextReorderSelection(
      { selectedUris: ["one", "two"], revision: 5 },
      model([row("one", "blocked"), row("two", "pending"), row("three", "pending")], {
        reorderRevision: 5,
      }),
    );
    expect(next).toEqual({ selectedUris: ["two"], revision: 5 });
  });

  it("无缓存快照不清空已有选择或 revision", () => {
    expect(ktcNextReorderSelection(
      { selectedUris: ["one"], revision: 3 },
      model(undefined),
    )).toEqual({ selectedUris: ["one"], revision: 3 });
  });

  it("本地选择只能包含当前 pending，重复 URI 去重", () => {
    expect(ktcSetReorderSelection(
      { selectedUris: [], revision: 8 },
      model([row("one", "pending"), row("two", "blocked")]),
      ["two", "one", "one", "missing"],
    )).toEqual({ selectedUris: ["one"], revision: 8 });
  });

  it("投影隔离 cancelled、保留 blocked/applied 行，并只将 pending 送入批量 Apply", () => {
    const projected = ktcProjectReorderMembersPanel(
      model([
        row("pending", "pending"),
        row("blocked", "blocked"),
        row("applied", "applied"),
        row("same", "unchanged"),
        row("cancelled", "cancelled"),
      ]),
      { selectedUris: ["pending", "blocked", "cancelled"], revision: 1 },
    );
    expect(projected.changedRows.map((entry) => entry.uri)).toEqual(["pending", "blocked", "applied"]);
    expect(projected.unchangedRows.map((entry) => entry.uri)).toEqual(["same"]);
    expect(projected.selectedPendingUris).toEqual(["pending"]);
    expect(projected.allPendingSelected).toBe(true);
    expect(projected.somePendingSelected).toBe(false);
    expect(projected.applyLabel).toBe("应用所选（1）");
    expect(projected.applyDisabled).toBe(false);
  });

  it("两条 pending 的单选投影为组半选，双选投影为组全选", () => {
    const twoPending = model([row("one", "pending"), row("two", "pending")]);
    const partial = ktcProjectReorderMembersPanel(twoPending, { selectedUris: ["one"], revision: 1 });
    expect(partial.allPendingSelected).toBe(false);
    expect(partial.somePendingSelected).toBe(true);
    const all = ktcProjectReorderMembersPanel(twoPending, { selectedUris: ["one", "two"], revision: 1 });
    expect(all.allPendingSelected).toBe(true);
    expect(all.somePendingSelected).toBe(false);
  });

  it("运行中同时禁用批量 Apply 与工作集，缓存缺失也禁用工作集", () => {
    const running = ktcProjectReorderMembersPanel(
      model([row("one", "pending")], { status: "running" }),
      { selectedUris: ["one"], revision: 1 },
    );
    expect(running.applyDisabled).toBe(true);
    expect(running.worksetDisabled).toBe(true);
    expect(ktcProjectReorderMembersPanel(
      model(undefined),
      { selectedUris: [], revision: undefined },
    ).worksetDisabled).toBe(true);
  });
});
