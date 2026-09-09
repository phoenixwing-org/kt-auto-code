export interface DevelopmentWorkspaceStatusInput {
  readonly label: string;
  readonly root: string;
  readonly version: string;
  readonly gitStatusOutput: string;
}

export function formatDevelopmentWorkspaceStatus(input: DevelopmentWorkspaceStatusInput): string;
export function readDevelopmentWorkspaceStatus(label: string, root: string): string;
