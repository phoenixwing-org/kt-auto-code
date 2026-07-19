import { ktcFormatCodegenDuration } from "./operationTimer.js";
import type {
  KtcCodegenBatchApplyReport,
  KtcCodegenBatchApplyReportItem,
} from "./batchApplyReport.js";

const STATUS_LABEL: Record<KtcCodegenBatchApplyReportItem["status"], string> = {
  applied: "完成",
  partial: "部分完成",
  "not-written": "未写入",
};

export function getCodegenBatchApplyReportHtml(
  report: KtcCodegenBatchApplyReport,
  nonce: string,
): string {
  const rows = report.items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(item.uri)}</small></td>
      <td><span class="status status-${item.status}">${STATUS_LABEL[item.status]}</span></td>
      <td>${item.preflightRegionCount}</td>
      <td>${item.preflightArtifactCount}</td>
      <td>${item.preflightDiagnosticCount}</td>
      <td>${item.preflightErrorCount}</td>
      <td>${item.modifiedFileCount}</td>
      <td>${item.writtenRegionCount}</td>
      <td>${escapeHtml(ktcFormatCodegenDuration(item.elapsedMilliseconds))}</td>
    </tr>`).join("");
  const issueRows = report.items.flatMap((item) => item.issues.map((issue) => `
    <tr>
      <td>${escapeHtml(item.fileName)}</td>
      <td>${issue.severity === "error" ? "错误" : "警告"}</td>
      <td><code>${escapeHtml(issue.code)}</code></td>
      <td>${escapeHtml(issue.message)}</td>
      <td>${escapeHtml(locationText(issue.file, issue.line))}</td>
    </tr>`)).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${escapeAttribute(nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codegen 全部应用报告</title>
  <style nonce="${escapeAttribute(nonce)}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.5 var(--vscode-font-family); }
    h1, h2 { margin: 0 0 12px; } h1 { font-size: 20px; } h2 { margin-top: 24px; font-size: 15px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
    .metric { padding: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); }
    .metric strong { display: block; font-size: 20px; } .metric span, small { color: var(--vscode-descriptionForeground); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    table { width: 100%; min-width: 760px; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: var(--vscode-editorWidget-background); }
    tr:last-child td { border-bottom: 0; } td small { display: block; max-width: 520px; overflow-wrap: anywhere; }
    .status { display: inline-block; padding: 1px 7px; border: 1px solid currentColor; border-radius: 999px; white-space: nowrap; }
    .status-applied { color: var(--vscode-testing-iconPassed); }
    .status-partial { color: var(--vscode-editorWarning-foreground); }
    .status-not-written { color: var(--vscode-errorForeground); }
    .empty { padding: 14px; color: var(--vscode-descriptionForeground); border: 1px dashed var(--vscode-panel-border); border-radius: 6px; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>Codegen 全部应用报告</h1>
  <section class="summary" aria-label="批次汇总">
    ${metric("JSON", report.totals.total)}
    ${metric("完成", report.totals.applied)}
    ${metric("部分完成", report.totals.partial)}
    ${metric("未写入", report.totals.notWritten)}
    ${metric("错误", report.errorCount)}
    ${metric("警告", report.warningCount)}
    ${metric("总耗时", ktcFormatCodegenDuration(report.elapsedMilliseconds))}
  </section>
  <h2>运行明细</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>JSON</th><th>状态</th><th>命中区域</th><th>产物</th><th>诊断</th><th>预检错误</th><th>修改文件</th><th>写入区域</th><th>耗时</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <h2>问题列表</h2>
  ${issueRows ? `<div class="table-wrap"><table><thead><tr><th>JSON</th><th>级别</th><th>代码</th><th>说明</th><th>位置</th></tr></thead><tbody>${issueRows}</tbody></table></div>` : '<div class="empty">本批次没有错误或警告。</div>'}
</body>
</html>`;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function locationText(file?: string, line?: number): string {
  if (!file) return "—";
  return line === undefined ? file : `${file}:${line}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
