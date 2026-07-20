import type { KtcCodegenBatchApplyReport } from "./batchApplyReport.js";

/**
 * JSON 驱动的轻量报告 View。领域数据只序列化到 data script；筛选、链接和表格渲染
 * 都在 Webview 内完成，文件打开仍由 Extension Host 校验并执行。
 */
export function getCodegenBatchApplyReportHtml(
  report: KtcCodegenBatchApplyReport,
  nonce: string,
): string {
  const title = report.applyKind === "single" ? "Codegen 应用报告" : "Codegen 全部应用报告";
  const safeReportJson = JSON.stringify(report)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${escapeAttribute(nonce)}'; script-src 'nonce-${escapeAttribute(nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style nonce="${escapeAttribute(nonce)}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.5 var(--vscode-font-family); }
    h1, h2 { margin: 0 0 12px; } h1 { font-size: 20px; } h2 { margin-top: 24px; font-size: 15px; }
    .toolbar { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; }
    .toolbar label { color: var(--vscode-descriptionForeground); }
    .toolbar [hidden] { display: none; }
    .single-json { min-width: min(420px, 65vw); overflow: hidden; color: var(--vscode-foreground); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    select, button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; padding: 4px 8px; font: inherit; }
    select { min-width: min(420px, 65vw); color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
    button { cursor: pointer; } button:hover { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: default; }
    .json-steps { display: inline-flex; align-items: stretch; }
    button.json-step { min-width: 28px; padding: 4px 6px; font-size: 16px; line-height: 1; }
    button.json-step:first-child { border-radius: 2px 0 0 2px; }
    button.json-step:last-child { margin-left: -1px; border-radius: 0 2px 2px 0; }
    button.link { display: inline; padding: 0; color: var(--vscode-textLink-foreground); background: none; border: 0; text-align: left; }
    button.link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; background: none; }
    .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .metric, .filter-chip { box-sizing: border-box; min-height: 28px; padding: 3px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; background: var(--vscode-editorWidget-background); }
    .metric { display: inline-flex; align-items: center; gap: 5px; color: var(--vscode-descriptionForeground); }
    .metric strong, .filter-chip strong { color: var(--vscode-foreground); font-size: 12px; font-weight: 700; }
    .filter-chip { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; }
    .filter-chip:hover { background: var(--vscode-list-hoverBackground); }
    .filter-chip:has(input:focus-visible) { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .filter-chip input { width: 12px; height: 12px; margin: 0; accent-color: currentColor; }
    .filter-chip:not(:has(input:checked)) { color: var(--vscode-descriptionForeground); opacity: .62; background: transparent; }
    .filter-chip:not(:has(input:checked)) strong { color: inherit; }
    small { color: var(--vscode-descriptionForeground); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    table { width: 100%; min-width: 760px; border-collapse: collapse; }
    #issue-table table { table-layout: fixed; }
    #issue-table th:nth-child(1) { width: 17%; }
    #issue-table th:nth-child(2) { width: 6%; }
    #issue-table th:nth-child(3) { width: 12%; }
    #issue-table th:nth-child(4) { width: 27%; }
    #issue-table th:nth-child(5) { width: 38%; }
    #issue-table td { overflow-wrap: anywhere; word-break: break-word; }
    #issue-table button.link { max-width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: var(--vscode-editorWidget-background); }
    tr:last-child td { border-bottom: 0; } td small { display: block; max-width: 520px; overflow-wrap: anywhere; }
    td.empty-row { padding: 16px 10px; color: var(--vscode-descriptionForeground); text-align: center; }
    .status { display: inline-block; padding: 1px 7px; border: 1px solid currentColor; border-radius: 999px; white-space: nowrap; }
    .health-success, .change-updated, .change-unchanged { color: var(--vscode-testing-iconPassed); }
    .health-warning { color: var(--vscode-editorWarning-foreground); }
    .health-error, .change-not-applied { color: var(--vscode-errorForeground); }
    .change-partial { color: var(--vscode-editorWarning-foreground); }
    .empty { padding: 14px; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="toolbar">
    <label id="json-filter-label" for="json-filter">JSON</label>
    <span class="single-json" id="single-json" hidden></span>
    <select id="json-filter" aria-label="筛选报告中的 JSON"></select>
    <span class="json-steps" id="json-steps" role="group" aria-label="切换 JSON">
      <button class="json-step" id="previous-json" type="button" title="上一个 JSON" aria-label="上一个 JSON">‹</button>
      <button class="json-step" id="next-json" type="button" title="下一个 JSON" aria-label="下一个 JSON">›</button>
    </span>
    <button id="open-json" type="button" disabled>在 Codegen View 中打开</button>
  </div>
  <section class="summary" id="summary" aria-label="批次汇总"></section>
  <h2>运行明细</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>JSON</th><th>结果</th><th>源码变化</th><th>命中区域</th><th>产物</th><th>诊断</th><th>预检错误</th><th>修改文件</th><th>写入区域</th><th>耗时</th></tr></thead>
    <tbody id="item-rows"></tbody>
  </table></div>
  <h2>问题列表</h2>
  <div class="table-wrap" id="issue-table"><table>
    <thead><tr><th>JSON</th><th>级别</th><th>代码</th><th>说明</th><th>位置</th></tr></thead>
    <tbody id="issue-rows"></tbody>
  </table></div>
  <div class="empty" id="issue-empty" hidden>当前筛选没有错误或警告。</div>
  <script id="report-data" type="application/json" nonce="${escapeAttribute(nonce)}">${safeReportJson}</script>
  <script nonce="${escapeAttribute(nonce)}">
    const vscode = acquireVsCodeApi();
    const report = JSON.parse(document.getElementById("report-data").textContent || "{}");
    const filter = document.getElementById("json-filter");
    const filterLabel = document.getElementById("json-filter-label");
    const singleJson = document.getElementById("single-json");
    const jsonSteps = document.getElementById("json-steps");
    const previousJson = document.getElementById("previous-json");
    const nextJson = document.getElementById("next-json");
    const openJson = document.getElementById("open-json");
    const summary = document.getElementById("summary");
    const itemRows = document.getElementById("item-rows");
    const issueRows = document.getElementById("issue-rows");
    const issueTable = document.getElementById("issue-table");
    const issueEmpty = document.getElementById("issue-empty");
    const healthLabels = { success: "正常", warning: "有警告", error: "有错误" };
    const changeLabels = { updated: "已更新", unchanged: "内容一致", partial: "部分更新", "not-applied": "未应用" };
    const activeFilters = {
      health: new Set(Object.keys(healthLabels)),
      change: new Set(Object.keys(changeLabels)),
    };

    function duration(milliseconds) {
      const value = Number.isFinite(milliseconds) ? Math.max(0, Math.round(milliseconds)) : 0;
      if (value < 1000) return value + " ms";
      if (value < 10000) return (value / 1000).toFixed(2) + " s";
      return (value / 1000).toFixed(1) + " s";
    }

    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }

    function link(text, message, title) {
      const button = element("button", text, "link");
      button.type = "button";
      if (title) button.title = title;
      button.addEventListener("click", () => vscode.postMessage(message));
      return button;
    }

    function appendCell(row, content) {
      const cell = document.createElement("td");
      if (content instanceof Node) cell.appendChild(content);
      else cell.textContent = String(content);
      row.appendChild(cell);
      return cell;
    }

    function metric(label, value) {
      const node = element("div", undefined, "metric");
      node.append(element("span", label), element("strong", value));
      return node;
    }

    function filterChip(group, value, label, count) {
      const chip = element("label", undefined, "filter-chip " + group + "-" + value);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = activeFilters[group].has(value);
      checkbox.dataset.filterGroup = group;
      checkbox.value = value;
      checkbox.setAttribute("aria-label", "筛选" + label);
      chip.append(checkbox, element("span", label), element("strong", count));
      return chip;
    }

    function renderSummary(items) {
      summary.replaceChildren();
      const totals = {
        total: items.length,
        success: items.filter((item) => item.health === "success").length,
        warning: items.filter((item) => item.health === "warning").length,
        error: items.filter((item) => item.health === "error").length,
        updated: items.filter((item) => item.change === "updated").length,
        unchanged: items.filter((item) => item.change === "unchanged").length,
        partial: items.filter((item) => item.change === "partial").length,
        notApplied: items.filter((item) => item.change === "not-applied").length,
        errors: items.reduce((count, item) => count + item.issues.filter((issue) => issue.severity === "error").length, 0),
        warnings: items.reduce((count, item) => count + item.issues.filter((issue) => issue.severity === "warning").length, 0),
      };
      const elapsed = filter.value && items.length === 1 ? items[0].elapsedMilliseconds : report.elapsedMilliseconds;
      if (items.length === 1) {
        const item = items[0];
        summary.append(
          metric("JSON", 1),
          metric(healthLabels[item.health] || item.health, 1),
          metric(changeLabels[item.change] || item.change, 1),
          metric("耗时", duration(elapsed)),
        );
        return;
      }
      summary.append(
        metric("JSON", totals.total),
        filterChip("health", "success", "正常", totals.success),
        filterChip("health", "warning", "有警告", totals.warning),
        filterChip("health", "error", "有错误", totals.error),
        filterChip("change", "updated", "已更新", totals.updated),
        filterChip("change", "unchanged", "内容一致", totals.unchanged),
        filterChip("change", "partial", "部分更新", totals.partial),
        filterChip("change", "not-applied", "未应用", totals.notApplied),
        metric("耗时", duration(elapsed)),
      );
    }

    function renderItems(items) {
      itemRows.replaceChildren();
      if (items.length === 0) {
        const row = document.createElement("tr");
        const cell = element("td", "当前筛选没有运行明细。", "empty-row");
        cell.colSpan = 10;
        row.appendChild(cell);
        itemRows.appendChild(row);
        return;
      }
      for (const item of items) {
        const row = document.createElement("tr");
        const jsonCell = appendCell(row, link(item.fileName, { type: "openJson", uri: item.uri }, item.uri));
        jsonCell.appendChild(element("small", item.uri));
        appendCell(row, element("span", healthLabels[item.health] || item.health, "status health-" + item.health));
        appendCell(row, element("span", changeLabels[item.change] || item.change, "status change-" + item.change));
        for (const value of [item.preflightRegionCount, item.preflightArtifactCount, item.preflightDiagnosticCount, item.preflightErrorCount, item.modifiedFileCount, item.writtenRegionCount, duration(item.elapsedMilliseconds)]) appendCell(row, value);
        itemRows.appendChild(row);
      }
    }

    function renderIssues(items) {
      issueRows.replaceChildren();
      let count = 0;
      for (const item of items) {
        for (const issue of item.issues) {
          count++;
          const row = document.createElement("tr");
          appendCell(row, link(item.fileName, { type: "openJson", uri: item.uri }, item.uri));
          appendCell(row, issue.severity === "error" ? "错误" : "警告");
          appendCell(row, element("code", issue.code));
          appendCell(row, issue.message);
          const location = issue.file ? issue.file + (issue.line === undefined ? "" : ":" + issue.line) : "—";
          const locationCell = appendCell(row, issue.file
            ? link(location, { type: "openIssue", file: issue.file, line: issue.line }, "打开问题位置")
            : location);
          locationCell.classList.add("issue-location");
          issueRows.appendChild(row);
        }
      }
      issueTable.hidden = count === 0;
      issueEmpty.hidden = count !== 0;
    }

    function render() {
      const jsonItems = filter.value
        ? report.items.filter((item) => item.uri === filter.value)
        : report.items;
      const items = jsonItems.length === 1
        ? jsonItems
        : jsonItems.filter((item) => activeFilters.health.has(item.health) && activeFilters.change.has(item.change));
      openJson.disabled = !filter.value;
      renderSummary(jsonItems);
      renderItems(items);
      renderIssues(items);
    }

    function selectAdjacentJson(offset) {
      const count = filter.options.length;
      if (count === 0) return;
      filter.selectedIndex = (filter.selectedIndex + offset + count) % count;
      render();
    }

    const singleItem = report.items.length === 1 ? report.items[0] : undefined;
    if (!singleItem) filter.appendChild(new Option("全部 JSON（" + report.items.length + "）", ""));
    for (const item of report.items) {
      const health = healthLabels[item.health] || item.health;
      const change = changeLabels[item.change] || item.change;
      const label = health + " · " + change + "｜" + item.fileName;
      filter.appendChild(new Option(label, item.uri));
      if (singleItem) singleJson.textContent = label;
    }
    if (singleItem) {
      filter.value = singleItem.uri;
      filter.hidden = true;
      jsonSteps.hidden = true;
      singleJson.hidden = false;
      filterLabel.removeAttribute("for");
    }
    filter.addEventListener("change", render);
    previousJson.addEventListener("click", () => selectAdjacentJson(-1));
    nextJson.addEventListener("click", () => selectAdjacentJson(1));
    summary.addEventListener("change", (event) => {
      const checkbox = event.target;
      if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;
      const group = checkbox.dataset.filterGroup;
      if (group !== "health" && group !== "change") return;
      if (checkbox.checked) activeFilters[group].add(checkbox.value);
      else activeFilters[group].delete(checkbox.value);
      render();
    });
    openJson.addEventListener("click", () => {
      if (filter.value) vscode.postMessage({ type: "openJson", uri: filter.value });
    });
    render();
  </script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;");
}
