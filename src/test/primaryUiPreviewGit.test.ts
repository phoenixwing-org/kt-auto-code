// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@phoenix-wing/code-core/ui", () => ({
  pnwCodeDefineNavigationTree() {},
}));

import { createPreviewGitSurface } from "../../ui-preview/src/previewGitSurface.js";

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
});

function currentPanel(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>("ktc-git-primary-panel")!;
}

function currentTree(root: HTMLElement): NavigationTreeFixture {
  return currentPanel(root).shadowRoot!.querySelector<NavigationTreeFixture>("pnw-navigation-tree")!;
}

describe("Git Primary preview surface", () => {
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
