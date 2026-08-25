import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Git Primary panel", () => {
  it("提供简报编辑复制、分支切换和提交图合并入口", () => {
    const source = readFileSync(new URL("./KtcGitPrimaryPanel.ts", import.meta.url), "utf8");
    const entrySource = readFileSync(new URL("./KtcGitPrimaryPanelEntry.ts", import.meta.url), "utf8");
    expect(source).toContain('KtcGitPrimaryPanelTag = "ktc-git-primary-panel"');
    expect(source).toContain('Object.prototype.hasOwnProperty.call(this, "model")');
    expect(source).toContain("delete holder.model");
    expect(source).toContain("this.model = model");
    expect(source).not.toContain('title.textContent = "Git 提交整理"');
    expect(source).toContain('headingLabel.textContent = "最新 commit · 勾选生成简报"');
    expect(source).toContain('action: "selectCommits"');
    expect(source).toContain('checkbox.className = "commit-select"');
    expect(source).toContain('text.className = "summary-text"');
    expect(source).toContain('text.style.height = `${initialTextHeight}px`');
    expect(source).toContain("this.KtcSummaryTextHeight = summaryText.offsetHeight");
    expect(source).toContain('this.KtcEmit({ action: "saveSummaryTextHeight", height })');
    expect(source).toContain('generate.onclick = () => requestSummary(true)');
    expect(source).toContain('if (checkbox.checked && (!summaryText || summaryText.value.trim().length === 0)) requestSummary(true)');
    expect(source).toContain('"ktc-git-primary-action"');
    expect(source).toContain('className = "commit-label ktc-compact-label"');
    expect(source).toContain("KtcCompactManagerLabelStyle + KtcGitPrimaryPanelStyle");
    expect(source).not.toContain(".repository-name { flex:");
    expect(source).toContain('copy.textContent = "复制简报"');
    expect(source).toContain('copy.className = "secondary-button title-action"');
    expect(source).toContain("title.insertBefore(copy, title.lastElementChild)");
    expect(source).toContain('this.KtcEditorTitle("commit 群消息简报"');
    expect(source).toContain('this.KtcCheckbox("Git 地址"');
    expect(source).toContain('this.KtcCheckbox("时间"');
    expect(source).toContain('this.KtcCheckbox("@审查人"');
    expect(source).toContain('this.KtcReviewerSelect("默认审查人"');
    expect(source).toContain('const select = document.createElement("select")');
    expect(source).toContain('add.textContent = "＋ 输入新人员…"');
    expect(source).toContain('input.placeholder = "输入新人员"');
    expect(source).toContain('reviewer.onCommit(regenerate)');
    expect(source).not.toContain('document.createElement("datalist")');
    expect(source).toContain('action: "updateSummaryOptions"');
    expect(source).not.toContain("KtcSquashEditor");
    expect(source).not.toContain('undo.textContent = "撤销"');
    expect(source).not.toContain("this.KtcOperation(model)");
    expect(source).toContain('historyTitle.textContent = `更多 commit（已加载 ${Math.max(0, project.commits.length - 1)}）`');
    expect(source).toContain("private readonly KtcHistoryAutoLoadHeads");
    expect(source).toContain("if (!project.hasMoreCommits");
    expect(source).toContain('action: "loadOlderCommits"');
    expect(source).toContain("count: 1");
    expect(source).toContain('action: "loadOlderCommits"');
    expect(source).toContain('[["下一条", 1], ["下 5 条", 5]]');
    expect(source).toContain('merge.textContent = "合并区间"');
    expect(source).toContain('merge.title = "打开合并 View；带入当前勾选，至少 2 条时自动安全预检"');
    expect(source).not.toContain('merge.disabled = selectedOids.size < 2');
    expect(source).toContain('action: "openSquashWithSelection"');
    expect(source).toContain("if (selectedOids.size < 2)");
    expect(source).toContain('button.disabled = !project.hasMoreCommits || !project.repository.headOid');
    expect(source).toContain("this.KtcExpandedHistoryRepositories.add(project.repository.id)");
    expect(source).toContain('document.createElement("pnw-navigation-tree")');
    expect(entrySource).toContain('import { pnwCodeDefineNavigationTree } from "@phoenix-wing/code-core/ui"');
    expect(entrySource).toContain("pnwCodeDefineNavigationTree()");
    expect(source).toContain('ariaLabel: "Git 工具操作"');
    expect(source).toContain('label: "Git 操作"');
    expect(source).toContain('label: "合并 commit 区间"');
    expect(source).toContain('branch.className = "secondary-button branch-picker"');
    expect(source).toContain('action: "switchBranch"');
    expect(source).not.toContain('description: "简报 · 提交图 · 本地合并"');
    expect(source).not.toContain('description: squash.enabled ? "提交图 · 安全预检"');
    expect(source).toContain('label: "源代码管理"');
    expect(source).toContain('label: "Git 日志"');
    expect(source).toContain('tree.model = { ...tree.model!, expandedNodeIds: [...this.KtcExpandedGitActionNodes] };');
    expect(source).toContain('this.KtcEmit({ action: "openAction", actionId, repositoryId: project.repository.id })');
    expect(source).toContain("project.repository.id === model.selectedRepositoryId");
    expect(source).toContain("if (selectedProject) projects.append(this.KtcProject(selectedProject, model))");
    expect(source).toContain("const content: Node[] = [this.KtcGitActionTree(project)]");
    expect(source).toContain("content.push(heading, latest, history, historyActions)");
    expect(source).not.toContain("for (const project of model.projects) projects.append(this.KtcProject(project))");
    expect(source).toContain("border-color: var(--ktc-ui-active-border");
    expect(source).toContain("box-shadow: inset 0 0 0 1px var(--ktc-ui-active-border");
    expect(source).toContain("overflow-x: hidden");
    expect(source).not.toContain("commit-info");
    expect(source).not.toContain("fullInfo");
    expect(source).not.toContain("打开简报");
    expect(source).not.toContain("stage");
    expect(source).not.toContain("force push");
    expect(source).not.toContain("acquireVsCodeApi");
    expect(source).toContain('title.textContent = "当前工作区未发现 Git 仓库"');
    expect(source).toContain('["新建 Git 仓库", "initializeRepository"]');
    expect(source).toContain('["搜索所有子目录", "searchRepositories"]');
    expect(source).toContain('stop.textContent = "停止"');
    expect(source).toContain('action: "stopRepositorySearch"');
  });

  it("将默认审查人保存在可见的机器级插件设置", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      contributes: { configuration: { properties: Record<string, unknown> } };
    };
    expect(manifest.contributes.configuration.properties["ktAutoCode.git.reviewers"]).toMatchObject({
      type: "array",
      scope: "machine",
      default: [],
    });
    expect(manifest.contributes.configuration.properties["ktAutoCode.git.summaryTextHeight"]).toMatchObject({
      type: "integer",
      scope: "machine",
      minimum: 78,
      maximum: 1200,
      default: 78,
    });
    expect(manifest.contributes.configuration.properties["ktAutoCode.git.repositories"]).toMatchObject({
      type: "array",
      scope: "machine",
      default: [],
      maxItems: 12,
      uniqueItems: true,
    });
  });

  it("由 VS Code Host 发现并保存当前仓库选择", () => {
    const controller = readFileSync(new URL("./KtcGitController.ts", import.meta.url), "utf8");
    const tool = readFileSync(new URL("./KtcGitTool.ts", import.meta.url), "utf8");
    expect(controller).toContain('getExtension<KtcVsCodeGitExports>("vscode.git")');
    expect(controller).toContain("KtcCollectGitRepositoryCandidates({");
    expect(controller).toContain("KtcDescribeGitRepository(root");
    expect(controller).toContain("KtcChooseGitRepositoryId({");
    expect(controller).toContain("workspaceState.get<string>(KtcGitSelectedRepositoryStateKey)");
    expect(controller).toContain("workspaceState.update(");
    expect(controller).toContain('"切换并关闭简报"');
    expect(controller).toContain("已打开的合并 View 不受影响");
    expect(controller).toContain("this.KtcRunningRepositories.size > 0");
    expect(controller).toContain("action.repositoryId !== this.KtcSelectedRepositoryId");
    expect(controller).toContain("selectedRepositoryId: this.KtcSelectedRepositoryId");
    expect(controller).toContain("this.KtcAdapter.readRepositorySummary(directory.root, 1, true, cancellation.signal)");
    expect(controller).toContain("this.KtcAdapter.readCommitPage(");
    expect(controller).toContain("this.KtcAdapter.readCommitGraphPage(");
    expect(controller).toContain('limit: 5');
    expect(controller).toContain('refsScope: KtcPnwGitCommitGraphRefsScope = "local-branches"');
    expect(controller).toContain("refsScope,");
    expect(controller).toContain("beforeCursor: graph.nextBeforeCursor");
    expect(controller).toContain("KtcGraphSelectedOids(graph, message.selectedOids)");
    expect(controller).toContain("KtcPrimarySelectedOids(session, selectedOids)");
    expect(controller).toContain("const missingSelectedOids = new Set(initialSelection)");
    expect(controller).toContain("missingSelectedOids.size > 0 && hasMore && nextBeforeCursor");
    expect(controller).toContain("beforeCursor: nextBeforeCursor");
    expect(controller).toContain("limit: Math.min(5, 1_000 - commits.length)");
    expect(controller).toContain("带入的 ${missingSelectedOids.size} 个 commit 不在当前可见本地分支图中");
    expect(controller).not.toContain('if (action.selectedOids.length < 2) throw new Error');
    expect(controller).toContain("KtcSameGitOidSelection(trusted.selectedOids, action.selectedOids)");
    expect(controller).toContain("selectedOids: trusted.selectedOids");
    expect(controller).toContain('"已带入勾选的 commit，正在执行 Git 安全预检…"');
    expect(controller).toContain('ctx.log(`[Git][合并视图][INFO] 打开：仓库 ${session.snapshot.name}');
    expect(controller).toContain('已加载 ${commits.length} 条');
    expect(controller).toContain('`带入 ${initialSelection.length} 个勾选`');
    expect(controller).toContain("await this.KtcSelectAndAnalyzeSquash(repositoryId, initialSelection, ctx)");
    expect(controller).toContain("用户选择优先于打开 View 时自动启动的预检");
    expect(controller).toContain('this.KtcShowSquashView(repositoryId, "loading", "正在执行本地 commit 合并…", this.KtcSquashDraft)');
    expect(controller).toContain('this.KtcShowSquashView(repositoryId, "error", "合并未执行：" + KtcErrorMessage(error), this.KtcSquashDraft)');
    expect(controller).toContain('readyMessage ?? "已读取最近 5 条本地分支提交图；按需继续加载。"');
    expect(controller).toContain("已刷新并清空选择");
    expect(controller).toContain("this.KtcSquashView?.isOpen && this.KtcSquashViewBinding?.repositoryId === action.repositoryId");
    expect(controller).toContain("[Git][合并执行][ERROR] 合并已成功，但提交图刷新失败");
    expect(controller).not.toContain('this.KtcSquashView?.close();\n      ctx.log(`[Git] squash');
    expect(controller).not.toContain("可在 Git Block 中撤销一次");
    expect(controller).toContain("KtcGitRefKey(current.currentRef) !== KtcGitRefKey(trusted.currentRef)");
    expect(controller).toContain("develop / refs/heads/develop");
    expect(controller).toContain("KtcStashAndAnalyzeSquash(repositoryId, selectedOids, ctx)");
    expect(controller).toContain("所选 commit 必须是当前同一分支上相邻的连续节点");
    expect(controller).toContain("不能跨分支或跳过中间 commit");
    expect(controller).not.toContain("选择包含已变化的 commit");
    expect(controller).toContain('ctx.log(`[Git][合并预检][ERROR] ${message}`)');
    expect(controller).toContain('ctx.log(`[Git][合并预检][INFO] 开始：仓库 ${session.snapshot.name}');
    expect(controller).toContain('ctx.log(`[Git][合并预检][OK] 通过：分支 ${analysis.plan.currentRef.replace(/^refs\\/heads\\//u, "")}，区间 ${analysis.plan.selectedOids.length} 个 commit；只改本地分支，不自动 push。`)');
    expect(controller).not.toContain("if (!this.KtcDirtyWorktree) void vscode.window.showErrorMessage(message)");
    expect(controller).toContain('vscode.commands.executeCommand("workbench.view.scm")');
    expect(controller).toContain('ctx.log(`[Git][合并执行][INFO] 开始：仓库 ${session.snapshot.name}');
    expect(controller).toContain('ctx.log(`[Git][合并执行][OK] 成功：${result.oldHeadOid.slice(0, 12)} → ${result.newHeadOid.slice(0, 12)}');
    expect(controller).toContain('ctx.log(`[Git][${stage}][ERROR] ${KtcErrorMessage(error)}`)');
    expect(controller).not.toContain("[Git] squash failed:");
    expect(controller).toContain('vscode.commands.executeCommand("git.checkout")');
    expect(controller).toContain("KtcOfferRestoreStash(temporaryStash)");
    expect(controller).toContain("const repositoryId = this.KtcSquashViewBinding?.repositoryId");
    expect(controller).toContain("Primary 刷新不能关闭、换仓或抢占已经打开的合并 View");
    expect(controller).toContain("请先手动关闭该 View，再打开其他仓库");
    expect(controller).toContain("旧 cursor 或预检快照失效时保留 View");
    expect(controller).not.toContain("KtcReloadSquashViewAfterStale");
    expect(controller).toContain("this.KtcSquashView?.show({");
    expect(controller).not.toContain("showQuickPick(picks");
    expect(controller).toContain('this.KtcShowTransientSummaryStatus("Git commit 简报已生成并复制。")');
    expect(controller).toContain('this.KtcShowTransientSummaryStatus("Git commit 群消息简报已复制。")');
    expect(controller).toContain("vscode.window.setStatusBarMessage(message, 4_000)");
    expect(controller).not.toContain('showInformationMessage("Git commit 简报已生成并复制。")');
    expect(controller).toContain("KtcSearchWorkspaceGitRepositories(");
    expect(controller).toContain("await api.init(folder.uri)");
    expect(controller).toContain("private KtcLastRunContext: ToolRunContext | undefined");
    expect(controller).toContain("void this.KtcLoad(ctx, true).catch((error)");
    expect(controller).toContain('this.KtcPostState(\n      ctx,\n      "running"');
    expect(controller).toContain("posting empty repository state");
    expect(controller).not.toContain("readRepository(candidate.startPath, 200)");
    expect(controller).toContain("this.KtcAdapter.readRepository(session.snapshot.root, 200)");
    expect(controller).toContain('get<readonly string[]>("git.repositories", [])');
    expect(controller).toContain('"git.repositories",');
    expect(controller).toContain("vscode.ConfigurationTarget.Global");
    expect(controller).toContain("工作区外仓库：");
    expect(tool).toContain('candidate.action === "selectRepository"');
    expect(tool).toContain('candidate.action === "loadOlderCommits"');
    expect(tool).toContain('candidate.action === "switchBranch"');
    expect(tool).toContain("KtcIsStringArray(candidate.selectedOids, true)");
    expect(tool).toContain('"initializeRepository"');
    expect(tool).toContain('"searchRepositories"');
    expect(tool).toContain('"stopRepositorySearch"');
    expect(tool).toContain("return KtcController.show(ctx)");
  });
});
