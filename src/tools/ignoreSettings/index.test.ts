import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeHost = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  executeCommand: vi.fn(async () => undefined),
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vscodeHost.executeCommand,
    registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      vscodeHost.handlers.set(id, handler);
      return { dispose: vi.fn() };
    }),
  },
}));

import type { ToolRunContext } from "../types.js";
import { ignoreSettingsTool, setIgnoreSettingsCommandRunner } from "./index.js";

function context(): ToolRunContext {
  return {
    workspaceRoot: "/workspace/selected-child",
    postState: vi.fn(),
    log: vi.fn(),
  } as unknown as ToolRunContext;
}

describe("ignoreSettings command routing", () => {
  beforeEach(() => {
    vscodeHost.handlers.clear();
    vscodeHost.executeCommand.mockClear();
    setIgnoreSettingsCommandRunner(undefined);
  });

  it("routes command-palette actions through the Provider runner", async () => {
    const runner = vi.fn(async () => undefined);
    setIgnoreSettingsCommandRunner(runner);
    const subscriptions: { dispose(): void }[] = [];
    ignoreSettingsTool.registerCommands({ subscriptions } as never);

    await vscodeHost.handlers.get("ktAutoCode.ignore.analyze")?.();

    expect(vscodeHost.executeCommand).toHaveBeenCalledWith("ktAutoCode.tool.show", "ignoreSettings");
    expect(runner).toHaveBeenCalledWith({ type: "analyzeIgnore" });
  });

  it("routes generic tool actions through the same runner instead of a workspace-root adapter", async () => {
    const runner = vi.fn(async () => undefined);
    setIgnoreSettingsCommandRunner(runner);

    await ignoreSettingsTool.runAction?.("sync", context());

    expect(runner).toHaveBeenCalledWith({ type: "syncIgnoreFromGit" });
  });

  it("reports an initialization error rather than bypassing the Provider", async () => {
    const ctx = context();

    await ignoreSettingsTool.runAction?.("open", ctx);

    expect(ctx.postState).toHaveBeenCalledWith({ status: "error", message: "Ignore Host 尚未初始化。" });
  });
});
