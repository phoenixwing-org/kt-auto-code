import {
  ktCodegenDefineApplyReportElements,
  type KtCodegenApplyReport,
  type KtCodegenApplyReportActionDetail,
  type KtCodegenApplyReportUiModel,
} from "@phoenix-wing/kt-codegen/ui";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

ktCodegenDefineApplyReportElements();

const data = document.getElementById("report-data");
const report = document.getElementById("apply-report") as KtCodegenApplyReport | null;
if (!data || !report) throw new Error("Codegen 应用报告缺少初始化节点");

report.model = JSON.parse(data.textContent || "{}") as KtCodegenApplyReportUiModel;
const vscode = acquireVsCodeApi();
report.addEventListener("kt-codegen-apply-report-action", (event) => {
  vscode.postMessage((event as CustomEvent<KtCodegenApplyReportActionDetail>).detail);
});
