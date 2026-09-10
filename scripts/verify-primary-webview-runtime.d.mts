export function verifyPrimaryWebviewRuntime(extensionBundle: string, readResource: (path: string) => string): Promise<{
  emptyWindow: boolean; workspaceWindow: boolean; cleanupRegistered: boolean; toolbarRendered: boolean; runActivated: boolean;
}>;
