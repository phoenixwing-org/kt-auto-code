import type {
  KtcGitAction,
  KtcGitCommit,
  KtcGitIdentity,
  KtcGitProject,
  KtcGitViewModel,
} from "../../../../src/git/KtcGitModel.js";
import { KtcCompactManagerLabelStyle } from "../../ui/KtcCompactManagerLabel.js";

export const KtcGitPrimaryPanelTag = "ktc-git-primary-panel";

export type KtcGitPrimaryActionDetail =
  | {
      readonly action:
        | "refresh"
        | "openScm"
        | "openOutput"
        | "addRepository"
        | "initializeRepository"
        | "searchRepositories"
        | "stopRepositorySearch"
        | "closeSummary"
        | "cancelSquash";
    }
  | { readonly action: "removeRepository"; readonly repositoryId: string }
  | {
      readonly action: "loadOlderCommits";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly count: 1 | 5;
    }
  | { readonly action: "openAction"; readonly actionId: string; readonly repositoryId: string }
  | {
      readonly action: "selectCommits";
      readonly selectedOids: readonly string[];
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly copyAfterGenerate: boolean;
    }
  | { readonly action: "saveSummaryTextHeight"; readonly height: number }
  | {
      readonly action: "copySummary";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly selectedOids: readonly string[];
      readonly text: string;
    }
  | {
      readonly action: "updateSummaryOptions";
      readonly repositoryId: string;
      readonly selectedOids: readonly string[];
      readonly includeRemoteUrl: boolean;
      readonly includeCommitTime: boolean;
      readonly mentionReviewer: boolean;
      readonly reviewer: string;
    }
  | {
      readonly action: "executeSquash";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly selectedOids: readonly string[];
      readonly message: string;
      readonly author: { readonly name: string; readonly email: string; readonly date: string };
      readonly committer: { readonly name: string; readonly email: string; readonly date: string };
    }
  | { readonly action: "undoSquash"; readonly repositoryId: string };

const KtcGitPrimaryPanelStyle = `
  :host { display: grid; width: 100%; min-width: 0; max-width: 100%; min-height: 0; overflow-x: hidden; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .toolbar { position: sticky; z-index: 12; top: 0; display: flex; align-items: center; gap: 3px; padding: 3px 5px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-block: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .toolbar-title { flex: 1 1 auto; min-width: 0; overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .icon-button { display: inline-grid; width: 27px; height: 27px; place-items: center; padding: 0; color: var(--vscode-foreground); background: transparent; border: 1px solid transparent; border-radius: 3px; cursor: pointer; font-size: 16px; }
  .icon-button:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .status, .operation { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 5px 6px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .operation { color: var(--vscode-foreground); background: var(--vscode-diffEditor-insertedTextBackground); }
  .status-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-tail { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 100%; align-items: center; gap: 4px; overflow: hidden; }
  .badge { padding: 1px 5px; color: var(--vscode-descriptionForeground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .project, .editor { border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .repository { display: flex; min-width: 0; align-items: center; gap: 6px; min-height: 32px; padding: 4px 6px; background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); }
  .actions { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .disclosure { min-width: 0; border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .disclosure > summary { min-height: 28px; padding: 5px 7px; cursor: pointer; font-weight: 650; }
  .disclosure > summary:hover { background: var(--vscode-list-hoverBackground); }
  .action { display: grid; min-width: 0; max-width: 100%; align-content: start; gap: 5px; padding: 8px; }
  .action.caution { box-shadow: inset 0 2px var(--vscode-editorWarning-foreground); }
  .action-heading { display: flex; min-width: 0; align-items: center; gap: 5px; }
  .action-title { flex: 1 1 auto; min-width: 0; overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .action-description { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .action-button, .secondary-button { min-height: 27px; padding: 3px 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent)); border-radius: 2px; cursor: pointer; }
  .secondary-button { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground, transparent); border-color: var(--ktc-ui-border, var(--vscode-panel-border)); }
  .action-button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-button-border, transparent))); }
  .secondary-button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .load-more { display: block; width: calc(100% - 12px); margin: 6px; }
  .history-actions { display: flex; gap: 5px; padding: 6px; }
  .history-actions .secondary-button { flex: 1 1 0; }
  button:disabled { opacity: .48; cursor: not-allowed; }
  .section-heading { display: flex; min-width: 0; align-items: center; gap: 6px; min-height: 28px; padding: 3px 6px; border-block: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-weight: 650; }
  .section-heading > span:first-child { flex: 1 1 auto; min-width: 0; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .generate-summary { min-height: 23px; padding: 1px 6px; }
  .commits { max-height: 220px; overflow: auto; }
  .commit { display: flex; width: 100%; min-width: 0; min-height: 32px; align-items: center; gap: 6px; padding: 3px 6px; color: var(--vscode-foreground); background: transparent; border: 0; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); text-align: left; cursor: pointer; }
  .commit:last-child { border-bottom: 0; }
  .commit:hover { background: var(--vscode-list-hoverBackground); box-shadow: inset 0 0 0 1px var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .commit-marker { flex: 0 0 14px; color: var(--vscode-descriptionForeground); text-align: center; }
  .commit-select { flex: 0 0 auto; width: auto; min-height: 0; margin: 0; }
  .commit.head .commit-marker { color: var(--vscode-gitDecoration-modifiedResourceForeground, var(--vscode-focusBorder)); }
  .commit-sha { color: var(--vscode-textLink-foreground); font-family: var(--vscode-editor-font-family); }
  .editor { display: grid; min-width: 0; max-width: 100%; gap: 7px; padding: 7px 6px; }
  .editor-title { display: flex; min-width: 0; align-items: center; gap: 5px; font-weight: 650; }
  .editor-title > span:first-child { margin-right: auto; }
  .title-action { min-height: 24px; padding: 1px 6px; font-size: 11px; }
  .selected-list { max-width: 100%; max-height: 150px; margin: 0; padding: 6px; overflow: auto; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font: 11px/1.45 var(--vscode-editor-font-family); white-space: pre-wrap; word-break: break-word; }
  textarea, input, select { width: 100%; min-width: 0; max-width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  textarea { min-height: 78px; padding: 5px; resize: vertical; }
  input, select { min-height: 25px; padding: 2px 5px; }
  .summary-options { display: flex; min-width: 0; max-width: 100%; flex-wrap: wrap; align-items: end; gap: 6px 12px; }
  .summary-option { display: inline-flex; min-width: 0; align-items: center; gap: 5px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .summary-option input[type="checkbox"] { flex: 0 0 auto; width: auto; min-height: 0; }
  .reviewer-field { flex: 0 1 128px; min-width: 84px; max-width: 150px; }
  .identity-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr) minmax(0, 1.1fr); gap: 5px; }
  .field { display: grid; gap: 2px; min-width: 0; color: var(--vscode-descriptionForeground); font-size: 10px; }
  .editor-actions { display: flex; min-width: 0; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
  .empty, .note { padding: 10px 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .empty-workspace { display: grid; gap: 8px; padding: 12px 8px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .empty-workspace-title { color: var(--vscode-foreground); font-weight: 650; }
  .empty-workspace-actions { display: flex; min-width: 0; flex-wrap: wrap; gap: 6px; }
  .search-progress { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .note { padding-block: 7px; border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  @media (max-width: 520px) {
    .repository, .status, .operation { flex-wrap: wrap; }
    .repository .badge-tail, .status .badge-tail { flex-basis: 100%; }
    .identity-grid { grid-template-columns: 1fr; }
  }
`;

export class KtcGitPrimaryPanel extends HTMLElement {
  private readonly KtcRoot = this.attachShadow({ mode: "open" });
  private readonly KtcSelectedSummaryOids = new Map<string, Set<string>>();
  private readonly KtcExpandedHistoryRepositories = new Set<string>();
  private readonly KtcExpandedSquashRepositories = new Set<string>();
  private KtcCurrentModel: KtcGitViewModel | undefined;
  private KtcSummaryTextHeight: number | undefined;

  get model(): KtcGitViewModel | undefined { return this.KtcCurrentModel; }
  set model(value: KtcGitViewModel | undefined) {
    this.KtcCurrentModel = value;
    this.KtcRender();
  }

  connectedCallback(): void {
    this.KtcUpgradePreDefinitionModel();
    this.KtcRender();
  }

  /** Replays a model assigned before customElements.define upgraded this node. */
  private KtcUpgradePreDefinitionModel(): void {
    if (!Object.prototype.hasOwnProperty.call(this, "model")) return;
    const holder = this as unknown as { model?: KtcGitViewModel };
    const model = holder.model;
    delete holder.model;
    this.model = model;
  }

  private KtcRender(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = KtcCompactManagerLabelStyle + KtcGitPrimaryPanelStyle;
    const model = this.KtcCurrentModel;
    if (!model) {
      this.KtcRoot.replaceChildren(style, this.KtcEmpty("Git Primary 正在读取仓库…"));
      return;
    }
    const selectedProject = model.projects.find((project) => (
      project.repository.id === model.selectedRepositoryId
    ));

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const title = document.createElement("span");
    title.className = "toolbar-title";
    title.textContent = "Git 提交整理";
    toolbar.append(
      title,
      this.KtcToolbarButton("＋", "添加 Git 仓库", "addRepository"),
      this.KtcToolbarButton("↻", "刷新仓库摘要", "refresh"),
      this.KtcToolbarButton("⑂", "打开 VS Code 源代码管理", "openScm"),
      this.KtcToolbarButton("≡", "打开 KT Auto Code 输出", "openOutput"),
    );
    if (selectedProject?.repository.external) {
      const remove = this.KtcToolbarButton("−", "从我的仓库移除", "openOutput");
      remove.onclick = () => this.KtcEmit({
        action: "removeRepository",
        repositoryId: selectedProject.repository.id,
      });
      toolbar.append(remove);
    }

    const status = document.createElement("div");
    status.className = "status";
    const statusText = document.createElement("span");
    statusText.className = "status-text";
    statusText.textContent = model.statusText;
    statusText.title = model.statusText;
    const statusTail = document.createElement("span");
    statusTail.className = "badge-tail";
    statusTail.append(this.KtcBadge(`${model.projects.length} 仓库`), this.KtcBadge("本地"));
    status.append(statusText, statusTail);

    const fragments: (Node | string)[] = [style, toolbar, status];
    if (model.discovery.status === "searching") fragments.push(this.KtcSearchProgress(model));
    if (model.lastOperation && model.lastOperation.repositoryId === model.selectedRepositoryId) {
      fragments.push(this.KtcOperation(model));
    }
    if (model.summaryDraft && model.summaryDraft.repositoryId === model.selectedRepositoryId) {
      fragments.push(this.KtcSummaryEditor(model));
    }
    if (model.squashDraft && model.squashDraft.repositoryId === model.selectedRepositoryId) {
      fragments.push(this.KtcSquashEditor(model));
    }
    const projects = document.createElement("div");
    if (model.workspaceRepositoryCount === 0 && model.discovery.status !== "searching") {
      projects.append(this.KtcWorkspaceEmpty(model));
    }
    if (selectedProject) projects.append(this.KtcProject(selectedProject));
    else if (model.discovery.status === "searching") projects.append(this.KtcEmpty("搜索到仓库后会立即显示在这里。"));
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "历史合并只更新当前本地分支，不自动 push；共享引用会要求确认，HEAD、工作区和 Git 操作状态仍会再次校验。";
    fragments.push(projects, note);
    this.KtcRoot.replaceChildren(...fragments);
  }

  private KtcWorkspaceEmpty(model: KtcGitViewModel): HTMLElement {
    const empty = document.createElement("section");
    empty.className = "empty-workspace";
    const title = document.createElement("div");
    title.className = "empty-workspace-title";
    title.textContent = "当前工作区未发现 Git 仓库";
    const description = document.createElement("div");
    description.textContent = model.discovery.status === "stopped"
      ? `搜索已停止；已检查 ${model.discovery.scannedDirectories} 个目录。`
      : "可以在工作区根目录新建仓库，或递归搜索子目录中的现有仓库。";
    const actions = document.createElement("div");
    actions.className = "empty-workspace-actions";
    for (const [label, action] of [
      ["新建 Git 仓库", "initializeRepository"],
      ["搜索所有子目录", "searchRepositories"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action === "initializeRepository" ? "action-button" : "secondary-button";
      button.textContent = label;
      button.disabled = model.workspaceFolderCount === 0;
      button.onclick = () => this.KtcEmit({ action });
      actions.append(button);
    }
    empty.append(title, description, actions);
    return empty;
  }

  private KtcSearchProgress(model: KtcGitViewModel): HTMLElement {
    const row = document.createElement("div");
    row.className = "search-progress";
    const text = document.createElement("span");
    text.className = "status-text";
    text.textContent = `正在搜索：已检查 ${model.discovery.scannedDirectories} 个目录，找到 ${model.discovery.foundRepositories} 个仓库`;
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "secondary-button";
    stop.textContent = "停止";
    stop.onclick = () => this.KtcEmit({ action: "stopRepositorySearch" });
    row.append(text, stop);
    return row;
  }

  private KtcOperation(model: KtcGitViewModel): HTMLElement {
    const operation = model.lastOperation!;
    const row = document.createElement("div");
    row.className = "operation";
    const text = document.createElement("span");
    text.className = "status-text";
    text.textContent = `已改写 ${operation.oldHeadLabel} → ${operation.newHeadLabel}；后续重放 ${operation.rewrittenCount} 个 commit`;
    const undo = document.createElement("button");
    undo.className = "secondary-button";
    undo.type = "button";
    undo.textContent = "撤销";
    undo.onclick = () => this.KtcEmit({ action: "undoSquash", repositoryId: operation.repositoryId });
    row.append(text, undo);
    return row;
  }

  private KtcSummaryEditor(model: KtcGitViewModel): HTMLElement {
    const draft = model.summaryDraft!;
    const expectedHeadOid = model.projects.find((project) => project.repository.id === draft.repositoryId)
      ?.repository.headOid ?? "";
    const editor = document.createElement("section");
    editor.className = "editor";
    const title = this.KtcEditorTitle("commit 群消息简报", () => this.KtcEmit({ action: "closeSummary" }));
    const options = document.createElement("div");
    options.className = "summary-options";
    const remoteUrl = this.KtcCheckbox("Git 地址", draft.includeRemoteUrl);
    remoteUrl.input.disabled = !draft.remoteUrl;
    remoteUrl.label.title = draft.remoteUrl ?? "未读取到 remote URL";
    const commitTime = this.KtcCheckbox("时间", draft.includeCommitTime);
    const mentionReviewer = this.KtcCheckbox("@审查人", draft.mentionReviewer);
    const reviewer = this.KtcReviewerSelect("默认审查人", draft.reviewer, draft.reviewerChoices);
    reviewer.field.classList.add("reviewer-field");
    const regenerate = () => this.KtcEmit({
      action: "updateSummaryOptions",
      repositoryId: draft.repositoryId,
      selectedOids: draft.selectedOids,
      includeRemoteUrl: remoteUrl.input.checked,
      includeCommitTime: commitTime.input.checked,
      mentionReviewer: mentionReviewer.input.checked,
      reviewer: reviewer.value(),
    });
    remoteUrl.input.onchange = regenerate;
    commitTime.input.onchange = regenerate;
    mentionReviewer.input.onchange = regenerate;
    reviewer.onCommit(regenerate);
    options.append(remoteUrl.label, commitTime.label, mentionReviewer.label, reviewer.field);
    const text = document.createElement("textarea");
    text.className = "summary-text";
    text.value = draft.text;
    const initialTextHeight = this.KtcSummaryTextHeight ?? draft.textHeight;
    if (initialTextHeight) text.style.height = `${initialTextHeight}px`;
    text.setAttribute("aria-label", "可编辑的 commit 群消息简报");
    text.onpointerup = () => {
      const height = text.offsetHeight;
      if (height <= 0 || Math.abs(height - (this.KtcSummaryTextHeight ?? draft.textHeight ?? 0)) < 2) return;
      this.KtcSummaryTextHeight = height;
      this.KtcEmit({ action: "saveSummaryTextHeight", height });
    };
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary-button title-action";
    copy.textContent = "复制简报";
    copy.onclick = () => this.KtcEmit({
      action: "copySummary",
      repositoryId: draft.repositoryId,
      expectedHeadOid,
      selectedOids: draft.selectedOids,
      text: text.value,
    });
    title.insertBefore(copy, title.lastElementChild);
    editor.append(title, options, text);
    return editor;
  }

  private KtcCheckbox(labelText: string, checked: boolean): {
    readonly label: HTMLLabelElement;
    readonly input: HTMLInputElement;
  } {
    const label = document.createElement("label");
    label.className = "summary-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(input, text);
    return { label, input };
  }

  private KtcSquashEditor(model: KtcGitViewModel): HTMLElement {
    const draft = model.squashDraft!;
    const editor = document.createElement("section");
    editor.className = "editor";
    const title = this.KtcEditorTitle(
      `合并预览：${draft.selectedOids.length} 个 → 1 个；之后重放 ${draft.replayCount} 个`,
      () => this.KtcEmit({ action: "cancelSquash" }),
    );
    const selected = document.createElement("pre");
    selected.className = "selected-list";
    selected.textContent = [
      ...(draft.warnings.length > 0 ? ["需确认的共享历史警告：", ...draft.warnings.map((warning) => `- ${warning.label}`), ""] : []),
      "所选区间：",
      ...draft.selectedLabels,
      "",
      `Base parent: ${draft.baseParentOid}`,
      `旧 HEAD: ${draft.expectedHeadOid}`,
      `合并节点目标 tree: ${draft.selectedTipTreeOid}`,
      `最终保留 tree: ${draft.finalTreeOid}`,
      "",
      "后续重放（old SHA → 执行时生成 new SHA）：",
      ...(draft.replayLabels.length > 0 ? draft.replayLabels : ["(无)"]),
    ].join("\n");
    const message = document.createElement("textarea");
    message.value = draft.message;
    message.setAttribute("aria-label", "合并后的 commit 信息");
    const author = this.KtcIdentityFields("Author", draft.author);
    const committer = this.KtcIdentityFields("Committer", draft.committer);
    const actions = document.createElement("div");
    actions.className = "editor-actions";
    const execute = document.createElement("button");
    execute.type = "button";
    execute.className = "action-button";
    execute.textContent = "确认并执行";
    execute.onclick = () => this.KtcEmit({
      action: "executeSquash",
      repositoryId: draft.repositoryId,
      expectedHeadOid: draft.expectedHeadOid,
      selectedOids: draft.selectedOids,
      message: message.value,
      author: author.value(),
      committer: committer.value(),
    });
    actions.append(execute);
    editor.append(title, selected, message, author.element, committer.element, actions);
    return editor;
  }

  private KtcIdentityFields(label: string, identity: KtcGitIdentity): {
    readonly element: HTMLElement;
    readonly value: () => { readonly name: string; readonly email: string; readonly date: string };
  } {
    const grid = document.createElement("div");
    grid.className = "identity-grid";
    const name = this.KtcInput(`${label} 姓名`, identity.name);
    const email = this.KtcInput(`${label} 邮箱`, identity.email);
    const date = this.KtcInput(
      `${label} 时间（默认取所选最新提交）`,
      identity.dateLabel,
      "格式：YYYY-MM-DD HH:mm:ss；按本机时区保存",
    );
    grid.append(name.field, email.field, date.field);
    return { element: grid, value: () => ({ name: name.input.value, email: email.input.value, date: date.input.value }) };
  }

  private KtcInput(labelText: string, value: string, title?: string): { readonly field: HTMLElement; readonly input: HTMLInputElement } {
    const field = document.createElement("label");
    field.className = "field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.value = value;
    if (title) input.title = title;
    field.append(label, input);
    return { field, input };
  }

  private KtcReviewerSelect(
    labelText: string,
    value: string,
    choices: readonly string[],
  ): {
    readonly field: HTMLElement;
    readonly value: () => string;
    readonly onCommit: (listener: () => void) => void;
  } {
    const field = document.createElement("label");
    field.className = "field";
    const values = [...new Set([value, ...choices].map((choice) => choice.trim()).filter(Boolean))];
    const addValue = "__ktc_add_reviewer__";
    let current = value.trim();
    let listener: (() => void) | undefined;
    let editing = false;

    const renderSelect = () => {
      const select = document.createElement("select");
      select.setAttribute("aria-label", labelText);
      select.title = labelText;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "未设置";
      select.append(empty);
      for (const choice of [...new Set([current, ...values].filter(Boolean))]) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice;
        select.append(option);
      }
      const add = document.createElement("option");
      add.value = addValue;
      add.textContent = "＋ 输入新人员…";
      select.append(add);
      select.value = current;
      select.onchange = () => {
        if (select.value === addValue) {
          renderInput();
          return;
        }
        current = select.value;
        listener?.();
      };
      field.replaceChildren(select);
    };

    const renderInput = () => {
      editing = true;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "输入新人员";
      input.setAttribute("aria-label", "输入新审查人");
      input.title = "回车或失焦保存，Esc 取消";
      const finish = () => {
        if (!editing) return;
        editing = false;
        const next = input.value.trim();
        if (next) {
          current = next;
          values.unshift(next);
        }
        renderSelect();
        if (next) listener?.();
      };
      input.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish();
        } else if (event.key === "Escape") {
          event.preventDefault();
          editing = false;
          renderSelect();
        }
      };
      input.onblur = finish;
      field.replaceChildren(input);
      input.focus();
    };

    renderSelect();
    return {
      field,
      value: () => current,
      onCommit: (nextListener) => { listener = nextListener; },
    };
  }

  private KtcEditorTitle(text: string, close: () => void): HTMLElement {
    const heading = document.createElement("div");
    heading.className = "editor-title";
    const label = document.createElement("span");
    label.textContent = text;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.textContent = "×";
    button.title = "关闭";
    button.setAttribute("aria-label", "关闭");
    button.onclick = close;
    heading.append(label, button);
    return heading;
  }

  private KtcProject(project: KtcGitProject): HTMLElement {
    const container = document.createElement("section");
    container.className = "project";
    const repository = document.createElement("div");
    repository.className = "repository";
    const label = document.createElement("span");
    label.className = "repository-label ktc-compact-label";
    label.title = `${project.repository.name} · ${project.repository.relativePath}`;
    const name = document.createElement("span");
    name.className = "repository-name ktc-compact-label-primary";
    name.textContent = project.repository.name;
    const meta = document.createElement("span");
    meta.className = "repository-meta ktc-compact-label-secondary";
    meta.textContent = ` · ${project.repository.upstreamLabel} · HEAD ${project.repository.headLabel}`;
    label.append(name, meta);
    const tail = document.createElement("span");
    tail.className = "badge-tail";
    tail.append(this.KtcBadge(project.repository.branchLabel), this.KtcBadge(project.repository.stateLabel));
    repository.append(label, tail);

    const heading = document.createElement("div");
    heading.className = "section-heading";
    const headingLabel = document.createElement("span");
    headingLabel.textContent = "最新 commit · 勾选生成简报";
    const selectedOids = this.KtcSelectedSummaryOids.get(project.repository.id) ?? new Set<string>();
    this.KtcSelectedSummaryOids.set(project.repository.id, selectedOids);
    for (const oid of [...selectedOids]) {
      if (!project.commits.some((commit) => commit.oid === oid)) selectedOids.delete(oid);
    }
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "secondary-button generate-summary";
    const syncGenerate = () => {
      generate.disabled = selectedOids.size === 0;
      generate.textContent = selectedOids.size > 0 ? `生成（${selectedOids.size}）` : "生成";
    };
    const requestSummary = (copyAfterGenerate: boolean) => this.KtcEmit({
      action: "selectCommits",
      selectedOids: [...selectedOids],
      repositoryId: project.repository.id,
      expectedHeadOid: project.repository.headOid ?? "",
      copyAfterGenerate,
    });
    syncGenerate();
    generate.onclick = () => requestSummary(true);
    heading.append(
      headingLabel,
      generate,
      this.KtcBadge(`${project.commits.length}${project.hasMoreCommits ? "+" : ""}`),
    );
    const latest = document.createElement("div");
    latest.className = "commits";
    const latestCommit = project.commits[0];
    if (!latestCommit) latest.append(this.KtcEmpty(project.repository.error ?? "仓库没有可显示的 commit。"));
    else latest.append(this.KtcCommitRow(latestCommit, selectedOids, syncGenerate, requestSummary));

    const history = document.createElement("details");
    history.className = "disclosure";
    history.open = this.KtcExpandedHistoryRepositories.has(project.repository.id);
    history.ontoggle = () => {
      if (history.open) this.KtcExpandedHistoryRepositories.add(project.repository.id);
      else this.KtcExpandedHistoryRepositories.delete(project.repository.id);
    };
    const historyTitle = document.createElement("summary");
    historyTitle.textContent = `更多 commit（已加载 ${project.commits.length}）`;
    const older = document.createElement("div");
    older.className = "commits";
    for (const commit of project.commits.slice(1)) {
      older.append(this.KtcCommitRow(commit, selectedOids, syncGenerate, requestSummary));
    }
    if (project.commits.length <= 1) older.append(this.KtcEmpty("尚未加载更早的 commit。"));
    history.append(historyTitle, older);
    if (project.hasMoreCommits && project.repository.headOid) {
      const historyActions = document.createElement("div");
      historyActions.className = "history-actions";
      for (const [labelText, count] of [["下一条", 1], ["下 5 条", 5]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = labelText;
        button.onclick = () => this.KtcEmit({
          action: "loadOlderCommits",
          repositoryId: project.repository.id,
          expectedHeadOid: project.repository.headOid!,
          count,
        });
        historyActions.append(button);
      }
      history.append(historyActions);
    }

    const squash = document.createElement("details");
    squash.className = "disclosure";
    squash.open = this.KtcExpandedSquashRepositories.has(project.repository.id);
    squash.ontoggle = () => {
      if (squash.open) this.KtcExpandedSquashRepositories.add(project.repository.id);
      else this.KtcExpandedSquashRepositories.delete(project.repository.id);
    };
    const squashTitle = document.createElement("summary");
    squashTitle.textContent = "合并本地 commit（高级）";
    const actions = document.createElement("div");
    actions.className = "actions";
    for (const action of project.actions) actions.append(this.KtcAction(project.repository.id, action));
    squash.append(squashTitle, actions);
    container.append(repository, heading, latest, history, squash);
    return container;
  }

  private KtcCommitRow(
    commit: KtcGitCommit,
    selectedOids: Set<string>,
    syncGenerate: () => void,
    requestSummary: (copyAfterGenerate: boolean) => void,
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = `commit${commit.isHead ? " head" : ""}`;
    row.title = `${commit.oid} · ${commit.subject} · ${commit.author.name} · ${commit.author.dateLabel}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "commit-select";
    checkbox.checked = selectedOids.has(commit.oid);
    checkbox.setAttribute("aria-label", `选择 ${commit.shortOid} 生成简报`);
    checkbox.onchange = () => {
      if (checkbox.checked) selectedOids.add(commit.oid);
      else selectedOids.delete(commit.oid);
      syncGenerate();
      const summaryText = this.KtcRoot.querySelector<HTMLTextAreaElement>("textarea.summary-text");
      if (checkbox.checked && (!summaryText || summaryText.value.trim().length === 0)) requestSummary(true);
    };
    const marker = document.createElement("span");
    marker.className = "commit-marker";
    marker.textContent = commit.isHead ? "●" : "○";
    const commitLabel = document.createElement("span");
    commitLabel.className = "commit-label ktc-compact-label";
    const subject = document.createElement("span");
    subject.className = "commit-subject ktc-compact-label-primary";
    subject.textContent = commit.subject || "(无标题)";
    const commitMeta = document.createElement("span");
    commitMeta.className = "commit-meta ktc-compact-label-secondary";
    commitMeta.textContent = ` · ${commit.author.name} · ${commit.author.dateLabel}`;
    commitLabel.append(subject, commitMeta);
    const sha = document.createElement("span");
    sha.className = "commit-sha";
    sha.textContent = commit.shortOid;
    row.append(checkbox, marker, commitLabel, sha);
    return row;
  }

  private KtcAction(repositoryId: string, action: KtcGitAction): HTMLElement {
    const card = document.createElement("article");
    card.className = `action ${action.tone}`;
    const heading = document.createElement("div");
    heading.className = "action-heading";
    const title = document.createElement("span");
    title.className = "action-title";
    title.textContent = action.title;
    heading.append(title, this.KtcBadge(action.badge));
    const description = document.createElement("div");
    description.className = "action-description";
    description.textContent = action.description;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-button";
    button.textContent = action.buttonLabel;
    button.disabled = !action.enabled;
    button.onclick = () => this.KtcEmit({ action: "openAction", actionId: action.id, repositoryId });
    card.append(heading, description, button);
    return card;
  }

  private KtcToolbarButton(
    glyph: string,
    label: string,
    action: "refresh" | "openScm" | "openOutput" | "addRepository",
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.textContent = glyph;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.onclick = () => this.KtcEmit({ action });
    return button;
  }

  private KtcBadge(text: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = text;
    return badge;
  }

  private KtcEmpty(text: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  private KtcEmit(detail: KtcGitPrimaryActionDetail): void {
    const summaryText = this.KtcRoot.querySelector<HTMLTextAreaElement>("textarea.summary-text");
    if (summaryText && summaryText.offsetHeight > 0) this.KtcSummaryTextHeight = summaryText.offsetHeight;
    if (detail.action === "closeSummary") this.KtcSummaryTextHeight = undefined;
    this.dispatchEvent(new CustomEvent<KtcGitPrimaryActionDetail>(
      "ktc-git-primary-action",
      { bubbles: true, composed: true, detail },
    ));
  }
}

export function KtcDefineGitPrimaryPanel(tagName = KtcGitPrimaryPanelTag): typeof KtcGitPrimaryPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcGitPrimaryPanel;
  customElements.define(tagName, KtcGitPrimaryPanel);
  return KtcGitPrimaryPanel;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-git-primary-panel": KtcGitPrimaryPanel;
  }
}
