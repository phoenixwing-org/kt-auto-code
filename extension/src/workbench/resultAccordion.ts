import * as vscode from "vscode";

export interface KtcResultAccordionParticipant {
  collapseForAccordion(): void;
}

const participants = new Map<string, KtcResultAccordionParticipant>();

/** Keeps retained result views compact while the most recently used result stays open. */
export function ktcRegisterResultAccordion(
  id: string,
  participant: KtcResultAccordionParticipant,
): vscode.Disposable {
  participants.set(id, participant);
  return new vscode.Disposable(() => {
    if (participants.get(id) === participant) participants.delete(id);
  });
}

export function ktcActivateResultAccordion(id: string): void {
  const mode = vscode.workspace.getConfiguration("ktAutoCode").get<"exclusive" | "multiple">(
    "sidebar.blockExpansionMode",
    "exclusive",
  );
  if (mode === "multiple") return;
  for (const [candidateId, participant] of participants) {
    if (candidateId !== id) participant.collapseForAccordion();
  }
}
