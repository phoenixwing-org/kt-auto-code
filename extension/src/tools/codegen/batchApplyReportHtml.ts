import type { KtcCodegenBatchApplyReport } from "./batchApplyReport.js";

/**
 * 报告 Webview 的 Host 壳。筛选、摘要和表格均由 Wing Web Components 渲染；
 * 本层只安全注入 DTO 和插件本地 browser bundle。
 */
export function getCodegenBatchApplyReportHtml(
  report: KtcCodegenBatchApplyReport,
  nonce: string,
  componentScriptUri: string,
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
    h1 { margin: 0 0 14px; font-size: 20px; }
    kt-codegen-apply-report { display: block; min-width: 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <kt-codegen-apply-report id="apply-report"></kt-codegen-apply-report>
  <script id="report-data" type="application/json" nonce="${escapeAttribute(nonce)}">${safeReportJson}</script>
  <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(componentScriptUri)}"></script>
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
