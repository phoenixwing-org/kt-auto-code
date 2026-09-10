import {
  KtcCreateGitModel,
  type KtcGitCommitInput,
  type KtcGitDiscoveryState,
  type KtcGitRepositoryInput,
} from "../../src/core/git/KtcGitModel.js";
import type {
  KtcGitPrimaryActionDetail,
  KtcGitPrimaryPanel,
} from "../../src/tools/git/KtcGitPrimaryPanel.js";
import "../../src/tools/git/KtcGitPrimaryPanelEntry.js";

const PREVIEW_GIT_STYLE = `
  .preview-git-primary { display: grid; min-width: 0; }
  .preview-git-repository-bar { display: flex; min-width: 0; align-items: center; gap: 5px; padding: 5px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .preview-git-repository-label { flex: 0 0 auto; color: var(--vscode-descriptionForeground); }
  .preview-git-repository-select { flex: 1 1 auto; min-width: 0; height: 27px; color: var(--vscode-input-foreground); background: var(--vscode-dropdown-background, var(--vscode-input-background)); border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border))); text-overflow: ellipsis; }
  .preview-git-repository-action { display: inline-grid; flex: 0 0 27px; width: 27px; height: 27px; place-items: center; padding: 0; color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground, transparent); border: 1px solid var(--vscode-panel-border); cursor: pointer; font-size: 16px; }
  .preview-git-repository-action:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); border-color: var(--vscode-focusBorder); }
  .preview-git-repository-action:disabled { opacity: .48; cursor: not-allowed; }
  .preview-git-repository-action[hidden] { display: none; }
  ktc-git-primary-panel { display: block; min-width: 0; }
`;

const PREVIEW_GIT_IDENTITY = {
  name: "Phoenix Wing",
  email: "dev@example.com",
  date: "1784357700 +0800",
  dateLabel: "2026-09-09 10:00",
} as const;

function createPreviewCommits(prefix: string, count = 17): readonly KtcGitCommitInput[] {
  const oid = (index: number) => `${prefix}${String(index).padStart(6, "0")}${"0".repeat(33)}`;
  return Array.from({ length: count }, (_, index) => ({
    oid: oid(index),
    parentOids: index === 0
      ? []
      : [oid(index - 1)],
    subject: index === count - 1 ? "调整 Git Primary 交互" : `阶段提交 ${index + 1}`,
    body: "",
    author: PREVIEW_GIT_IDENTITY,
    committer: PREVIEW_GIT_IDENTITY,
    isHead: index === count - 1,
  }));
}

const WORKSPACE_REPOSITORY: KtcGitRepositoryInput = {
  id: "/workspace/phoenix/kt-auto-code",
  name: "kt-auto-code",
  relativePath: "phoenix/kt-auto-code",
  branch: "develop",
  upstream: "origin/develop",
  remoteUrl: "https://example.invalid/phoenix/kt-auto-code.git",
  head: "a000016000000000000000000000000000000000",
  clean: false,
  sourceGroup: "workspace",
  commits: createPreviewCommits("a"),
  recentCommitLimit: 17,
  hasMoreCommits: true,
};

const EXTERNAL_REPOSITORY: KtcGitRepositoryInput = {
  id: "/workspace/shared/phoenix-wing",
  name: "phoenix-wing",
  relativePath: "shared/phoenix-wing",
  branch: "develop",
  upstream: "origin/develop",
  remoteUrl: "https://example.invalid/phoenix/phoenix-wing.git",
  head: "b000016000000000000000000000000000000000",
  clean: true,
  sourceGroup: "external",
  commits: createPreviewCommits("b"),
  recentCommitLimit: 17,
  hasMoreCommits: true,
};

/** Shared production Git panel with a preview-only, in-memory Host adapter. */
export function createPreviewGitSurface(options: {
  readonly log: (line: string) => void;
  readonly openSquash?: (repository: KtcGitRepositoryInput, selectedOids: readonly string[]) => void;
}): { createPrimary(): HTMLElement; applyRepositorySnapshot(repository: KtcGitRepositoryInput): void; dispose(): void } {
  let repositories: readonly KtcGitRepositoryInput[] = [];
  let selectedRepositoryId: string | undefined;
  let discovery: KtcGitDiscoveryState = { status: "idle", scannedDirectories: 0, foundRepositories: 0 };
  let currentRoot: HTMLElement | undefined;
  let searchTimer: number | undefined;

  const model = () => KtcCreateGitModel({
    repositories,
    ...(selectedRepositoryId ? { selectedRepositoryId } : {}),
    workspaceFolderCount: 1,
    discovery,
  });

  const stopSearchTimer = (): void => {
    if (searchTimer === undefined) return;
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
  };

  const render = (): void => {
    if (!currentRoot) return;
    const viewModel = model();
    selectedRepositoryId = viewModel.selectedRepositoryId;
    const style = document.createElement("style");
    style.textContent = PREVIEW_GIT_STYLE;
    const bar = document.createElement("div");
    bar.className = "preview-git-repository-bar";
    const label = document.createElement("span");
    label.className = "preview-git-repository-label";
    label.textContent = "仓库：";
    const select = document.createElement("select");
    select.className = "preview-git-repository-select";
    select.setAttribute("aria-label", "Git 仓库");
    if (viewModel.projects.length === 0) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "请选择 Git 仓库";
      select.append(empty);
      select.disabled = true;
      select.title = "请选择 Git 仓库";
    } else {
      for (const project of viewModel.projects) {
        const option = document.createElement("option");
        option.value = project.repository.id;
        option.textContent = project.repository.name;
        option.title = `${project.repository.name} · ${project.repository.id}`;
        select.append(option);
      }
      select.value = viewModel.selectedRepositoryId ?? "";
      const selected = viewModel.projects.find(({ repository }) => repository.id === select.value)?.repository;
      select.title = selected ? `${selected.name} · ${selected.id}` : "Git 仓库";
      select.setAttribute("aria-label", selected ? `Git 仓库：${selected.name} · ${selected.id}` : "Git 仓库");
      select.onchange = () => {
        selectedRepositoryId = select.value || undefined;
        const next = viewModel.projects.find(({ repository }) => repository.id === selectedRepositoryId)?.repository;
        options.log(`[Git] 切换仓库：${next ? `${next.name} · ${next.id}` : "未选择仓库"}（模拟）`);
        render();
      };
    }

    const add = repositoryAction("＋", "登记已有 Git 仓库", () => {
      if (!repositories.some(({ id }) => id === EXTERNAL_REPOSITORY.id)) {
        repositories = [...repositories, EXTERNAL_REPOSITORY];
      }
      selectedRepositoryId = EXTERNAL_REPOSITORY.id;
      options.log(`[Git] 登记已有仓库：${EXTERNAL_REPOSITORY.id}（模拟）`);
      render();
    });
    const refresh = repositoryAction("↻", "重新发现并刷新仓库", () => {
      options.log(`[Git] 重新发现并刷新 ${repositories.length} 个仓库（模拟）`);
      render();
    });
    const selected = viewModel.projects.find(({ repository }) => repository.id === selectedRepositoryId)?.repository;
    const remove = repositoryAction("−", "从我的仓库移除（不删除磁盘）", () => {
      if (!selected?.external) return;
      repositories = repositories.filter(({ id }) => id !== selected.id);
      selectedRepositoryId = repositories[0]?.id;
      options.log(`[Git] 已从“我的仓库”移除 ${selected.id}（模拟）；未删除磁盘仓库`);
      render();
    });
    remove.hidden = selected?.external !== true;
    bar.append(label, select, add, refresh, remove);

    const panel = document.createElement("ktc-git-primary-panel") as KtcGitPrimaryPanel;
    panel.model = viewModel;
    panel.addEventListener("ktc-git-primary-action", (event) => {
      const detail = (event as CustomEvent<KtcGitPrimaryActionDetail>).detail;
      if (!detail) return;
      if (detail.action === "searchRepositories") {
        stopSearchTimer();
        discovery = { status: "searching", scannedDirectories: 0, foundRepositories: 0 };
        options.log("[Git] 开始搜索所有子目录（模拟）");
        render();
        searchTimer = window.setTimeout(() => {
          searchTimer = undefined;
          repositories = repositories.some(({ id }) => id === WORKSPACE_REPOSITORY.id)
            ? repositories
            : [WORKSPACE_REPOSITORY, ...repositories];
          selectedRepositoryId = WORKSPACE_REPOSITORY.id;
          discovery = { status: "complete", scannedDirectories: 24, foundRepositories: 1 };
          options.log(`[Git] 搜索完成：新发现 1 个仓库 ${WORKSPACE_REPOSITORY.id}（模拟）`);
          render();
        }, 240);
        return;
      }
      if (detail.action === "stopRepositorySearch") {
        stopSearchTimer();
        discovery = { ...discovery, status: "stopped" };
        options.log("[Git] 已停止搜索；已发现的仓库仍保留（模拟）");
        render();
        return;
      }
      if (detail.action === "openSquashWithSelection"
        || detail.action === "openAction" && detail.actionId === "squashLocalCommits") {
        const repository = repositories.find(({ id }) => id === detail.repositoryId);
        if (repository && options.openSquash) {
          options.openSquash(repository, detail.action === "openSquashWithSelection" ? detail.selectedOids : []);
          return;
        }
      }
      options.log(`[Git] ${detail.action}（模拟）；未执行真实 Git 操作`);
    });
    currentRoot.replaceChildren(style, bar, panel);
  };

  return {
    applyRepositorySnapshot(snapshot): void {
      // Refresh only an already registered repository. Never resurrect a removed
      // entry, select another repository, or activate a closed Primary Tool.
      if (!repositories.some(({ id }) => id === snapshot.id)) return;
      repositories = repositories.map((repository) => repository.id === snapshot.id ? snapshot : repository);
      render();
    },
    createPrimary(): HTMLElement {
      currentRoot = document.createElement("section");
      currentRoot.className = "preview-git-primary";
      currentRoot.setAttribute("aria-label", "Git Primary 交互原型");
      render();
      return currentRoot;
    },
    dispose(): void {
      stopSearchTimer();
      currentRoot = undefined;
    },
  };
}

function repositoryAction(text: string, title: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preview-git-repository-action";
  button.textContent = text;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.onclick = action;
  return button;
}
