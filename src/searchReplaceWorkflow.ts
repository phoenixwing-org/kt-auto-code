import type { KtcSearchReplaceRunResult } from "./searchReplaceContracts.js";
import type { WorkspaceRenameReport } from "./workspaceRename.js";

export type KtcSearchReplaceWorkflowPhase = "preview" | "apply";

export interface KtcSearchReplaceWorkflowPorts {
  preview: () => WorkspaceRenameReport;
  confirm: () => Promise<boolean>;
  apply: () => WorkspaceRenameReport;
  report: (report: WorkspaceRenameReport, phase: KtcSearchReplaceWorkflowPhase) => void;
}

export async function ktcRunSearchReplaceWorkflow(
  applyRequested: boolean,
  ports: KtcSearchReplaceWorkflowPorts,
): Promise<KtcSearchReplaceRunResult> {
  const preview = ports.preview();
  ports.report(preview, "preview");
  if (!applyRequested) return "completed";
  if (preview.summary.errors > 0) return "blocked";
  if (!await ports.confirm()) return "cancelled";

  const applied = ports.apply();
  ports.report(applied, "apply");
  return applied.applied && applied.summary.errors === 0 ? "completed" : "error";
}
