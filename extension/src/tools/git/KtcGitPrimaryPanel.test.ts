import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Git Primary panel", () => {
  it("提供简报编辑复制、安全合并编辑和撤销入口", () => {
    const source = readFileSync(new URL("./KtcGitPrimaryPanel.ts", import.meta.url), "utf8");
    expect(source).toContain('KtcGitPrimaryPanelTag = "ktc-git-primary-panel"');
    expect(source).toContain('title.textContent = "Git 提交整理"');
    expect(source).toContain('headingLabel.textContent = "最近 commit · 勾选生成简报"');
    expect(source).toContain('action: "selectCommits"');
    expect(source).toContain('checkbox.className = "commit-select"');
    expect(source).toContain('text.className = "summary-text"');
    expect(source).toContain('text.style.height = `${initialTextHeight}px`');
    expect(source).toContain("this.KtcSummaryTextHeight = summaryText.offsetHeight");
    expect(source).toContain('this.KtcEmit({ action: "saveSummaryTextHeight", height })');
    expect(source).toContain('generate.onclick = () => requestSummary(true)');
    expect(source).toContain('if (checkbox.checked && (!summaryText || summaryText.value.trim().length === 0)) requestSummary(true)');
    expect(source).toContain('"ktc-git-primary-action"');
    expect(source).toContain('className = "repository-label ktc-compact-label"');
    expect(source).toContain('className = "commit-label ktc-compact-label"');
    expect(source).toContain("KtcCompactManagerLabelStyle + KtcGitPrimaryPanelStyle");
    expect(source).not.toContain(".repository-name { flex:");
    expect(source).toContain('meta.textContent = ` · ${project.repository.upstreamLabel} · HEAD ${project.repository.headLabel}`');
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
    expect(source).toContain('execute.textContent = "确认并执行"');
    expect(source).toContain('undo.textContent = "撤销"');
    expect(source).toContain('loadMore.textContent = "再加载 20"');
    expect(source).toContain('action: "loadMore"');
    expect(source).toContain('`Base parent: ${draft.baseParentOid}`');
    expect(source).toContain('`最终保留 tree: ${draft.finalTreeOid}`');
    expect(source).toContain('后续重放（old SHA → 执行时生成 new SHA）');
    expect(source).toContain("默认取所选最新提交");
    expect(source).toContain("按本机时区保存");
    expect(source).toContain("border-color: var(--ktc-ui-active-border");
    expect(source).toContain("box-shadow: inset 0 0 0 1px var(--ktc-ui-active-border");
    expect(source).toContain("overflow-x: hidden");
    expect(source).not.toContain("commit-info");
    expect(source).not.toContain("fullInfo");
    expect(source).not.toContain("打开简报");
    expect(source).not.toContain("stage");
    expect(source).not.toContain("force push");
    expect(source).not.toContain("acquireVsCodeApi");
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
  });
});
