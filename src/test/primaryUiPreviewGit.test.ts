// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@phoenix-wing/code-core/ui", () => ({
  pnwCodeDefineNavigationTree() {},
}));

import { createPreviewGitSurface } from "../../ui-preview/src/previewGitSurface.js";
import { createPreviewGitSquash } from "../../ui-preview/src/previewGitSquash.js";

interface NavigationTreeFixture extends HTMLElement {
  model?: {
    readonly nodes: readonly {
      readonly children?: readonly { readonly id: string; readonly label: string }[];
    }[];
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  document.querySelectorAll('meta[name="phoenix-preview-script-nonce"]').forEach((meta) => meta.remove());
});

function currentPanel(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>("ktc-git-primary-panel")!;
}

function currentTree(root: HTMLElement): NavigationTreeFixture {
  return currentPanel(root).shadowRoot!.querySelector<NavigationTreeFixture>("pnw-navigation-tree")!;
}

describe("Git Primary preview surface", () => {
  it("Right成功切换同步同仓库Primary快照，取消不变、重开不重复，且不切走其他仓库", () => {
    vi.useFakeTimers();
    const nonce = document.createElement("meta"); nonce.name = "phoenix-preview-script-nonce"; nonce.content = "a".repeat(32); document.head.append(nonce);
    const surface = createPreviewGitSurface({ log: vi.fn(), openSquash: (repository, selected) => right.open(repository, selected) });
    const right = createPreviewGitSquash({ log: vi.fn(), visibilityChanged: vi.fn(), repositoryChanged: (repository) => surface.applyRepositorySnapshot(repository) });
    const root = surface.createPrimary(); document.body.append(root, right.element);
    const send = (value: unknown) => { const frame = right.element.querySelector("iframe")!; window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, data: { channel: frame.dataset.channel, value } })); };
    const button = (text: string) => Array.from(right.element.querySelectorAll("button")).find((item) => item.textContent === text)!;
    const open = () => Array.from(currentPanel(root).shadowRoot!.querySelectorAll("button")).find((item) => item.textContent === "合并区间")!.click();
    const rendered = () => currentPanel(root).shadowRoot!.textContent ?? "";
    try {
      currentTree(root).dispatchEvent(new CustomEvent("pnw-navigation-tree-action", { detail: { kind: "select", nodeId: "git-action:searchRepositories" } }));
      vi.advanceTimersByTime(240); open();
      send({ type: "selectBranch", branchName: "topic/demo" }); button("取消").click();
      expect(rendered()).not.toContain("topic/demo");
      send({ type: "selectBranch", branchName: "topic/demo" }); button("切换分支（模拟）").click(); vi.advanceTimersByTime(200);
      expect(rendered()).toContain("topic/demo");
      expect(rendered()).toContain("示例 topic：第二条修订");
      expect(right.state()!.expectedHeadOid).toBe("c2".padEnd(40, "0"));
      right.close(); open();
      expect(right.state()!.branchLabel).toBe("topic/demo");
      expect(right.state()!.commits.map(({ oid }) => oid)).toEqual(expect.arrayContaining(["c2".padEnd(40, "0"), "c1".padEnd(40, "0")]));
      expect(new Set(right.state()!.commits.map(({ oid }) => oid)).size).toBe(5);
      root.querySelector<HTMLButtonElement>('[aria-label="登记已有 Git 仓库"]')!.click();
      send({ type: "selectBranch", branchName: "develop" }); button("切换分支（模拟）").click(); vi.advanceTimersByTime(200);
      expect(root.querySelector<HTMLSelectElement>("select")!.value).toBe("/workspace/shared/phoenix-wing");
      expect(rendered()).not.toContain("topic/demo");
      expect(rendered()).not.toContain("示例 topic：第二条修订");
      const select = root.querySelector<HTMLSelectElement>("select")!; select.value = "/workspace/phoenix/kt-auto-code"; select.dispatchEvent(new Event("change"));
      expect(rendered()).toContain("develop");
      expect(rendered()).not.toContain("topic/demo");
      const unknown = { id: "/workspace/unknown", name: "must-not-register", branch: "topic/demo" };
      surface.applyRepositorySnapshot(unknown);
      expect(root.querySelector<HTMLSelectElement>("select")!.options).toHaveLength(2);
      expect(rendered()).not.toContain("must-not-register");
    } finally { right.dispose(); surface.dispose(); }
  });

  it("合并区间按钮打开内存Right，带入选择的消息保留仓库身份与OID", () => {
    vi.useFakeTimers();
    const openSquash = vi.fn();
    const surface = createPreviewGitSurface({ log: vi.fn(), openSquash });
    const root = surface.createPrimary(); document.body.append(root);
    currentTree(root).dispatchEvent(new CustomEvent("pnw-navigation-tree-action", { detail: { kind: "select", nodeId: "git-action:searchRepositories" } }));
    vi.advanceTimersByTime(240);
    const panel = currentPanel(root);
    Array.from(panel.shadowRoot!.querySelectorAll("button")).find((button) => button.textContent === "合并区间")!.click();
    expect(openSquash).toHaveBeenCalledWith(expect.objectContaining({ id: "/workspace/phoenix/kt-auto-code" }), []);
    panel.dispatchEvent(new CustomEvent("ktc-git-primary-action", { detail: { action: "openSquashWithSelection", repositoryId: "/workspace/phoenix/kt-auto-code", expectedHeadOid: "a".repeat(40), selectedOids: ["a".repeat(40), "b".repeat(40)] } }));
    expect(openSquash).toHaveBeenLastCalledWith(expect.objectContaining({ id: "/workspace/phoenix/kt-auto-code" }), ["a".repeat(40), "b".repeat(40)]);
    surface.dispose();
  });
  it("starts without a misleading workspace verdict and exposes recursive discovery in Git Tree", () => {
    const log = vi.fn();
    const surface = createPreviewGitSurface({ log });
    const root = surface.createPrimary();
    document.body.append(root);

    const rendered = currentPanel(root).shadowRoot!.textContent ?? "";
    expect(rendered).not.toContain("当前工作区未发现 Git 仓库");
    expect(root.querySelector<HTMLSelectElement>(".preview-git-repository-select")!.title).toBe("请选择 Git 仓库");
    expect(rendered).not.toContain("新建 Git 仓库");
    expect(rendered).not.toContain("可以在工作区根目录新建仓库");
    expect(currentTree(root).model?.nodes[0]?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "git-action:searchRepositories", label: "搜索所有子目录" }),
    ]));
  });

  it("simulates recursive discovery, shows two commits, and keeps fifteen under More", () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const surface = createPreviewGitSurface({ log });
    const root = surface.createPrimary();
    document.body.append(root);

    currentTree(root).dispatchEvent(new CustomEvent("pnw-navigation-tree-action", {
      detail: { kind: "select", nodeId: "git-action:searchRepositories" },
    }));
    expect(log).toHaveBeenCalledWith("[Git] 开始搜索所有子目录（模拟）");
    expect(JSON.stringify(currentTree(root).model)).toContain("停止搜索所有子目录");
    vi.advanceTimersByTime(240);

    const panel = currentPanel(root);
    const latest = panel.shadowRoot!.querySelector<HTMLElement>(".project > .commits")!;
    expect(latest.querySelectorAll(".commit")).toHaveLength(2);
    expect(panel.shadowRoot!.querySelector(".disclosure > summary")?.textContent).toBe(
      "更多 commit（已加载 15）",
    );
    const select = root.querySelector<HTMLSelectElement>(".preview-git-repository-select")!;
    expect(select.title).toBe("kt-auto-code · /workspace/phoenix/kt-auto-code");
    expect(select.options[0]?.title).toBe("kt-auto-code · /workspace/phoenix/kt-auto-code");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("搜索完成：新发现 1 个仓库"));
    surface.dispose();
  });

  it("registers and removes only the in-memory external entry without deleting a repository", () => {
    const log = vi.fn();
    const surface = createPreviewGitSurface({ log });
    const root = surface.createPrimary();
    document.body.append(root);

    root.querySelector<HTMLButtonElement>('[aria-label="登记已有 Git 仓库"]')!.click();
    const select = root.querySelector<HTMLSelectElement>(".preview-git-repository-select")!;
    expect(select.title).toBe("phoenix-wing · /workspace/shared/phoenix-wing");
    const remove = root.querySelector<HTMLButtonElement>('[aria-label="从我的仓库移除（不删除磁盘）"]')!;
    expect(remove.hidden).toBe(false);
    remove.click();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("未删除磁盘仓库"));
    expect(currentPanel(root).shadowRoot!.textContent).not.toContain("当前工作区未发现 Git 仓库");
    expect(root.querySelector<HTMLSelectElement>(".preview-git-repository-select")!.title).toBe("请选择 Git 仓库");
  });

  it("logs the newly selected repository path rather than the stale select title", () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const surface = createPreviewGitSurface({ log });
    const root = surface.createPrimary();
    document.body.append(root);

    currentTree(root).dispatchEvent(new CustomEvent("pnw-navigation-tree-action", {
      detail: { kind: "select", nodeId: "git-action:searchRepositories" },
    }));
    vi.advanceTimersByTime(240);
    root.querySelector<HTMLButtonElement>('[aria-label="登记已有 Git 仓库"]')!.click();
    const select = root.querySelector<HTMLSelectElement>(".preview-git-repository-select")!;
    select.value = "/workspace/phoenix/kt-auto-code";
    select.dispatchEvent(new Event("change"));

    expect(log).toHaveBeenCalledWith("[Git] 切换仓库：kt-auto-code · /workspace/phoenix/kt-auto-code（模拟）");
    surface.dispose();
  });
});
