import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KtTool } from "./types.js";
import { clearRegisteredTools, getTool, getTools, registerTool } from "./registry.js";

function tool(id: string): KtTool {
  return {
    id,
    title: id,
    description: `${id} test descriptor`,
    getPanelModel() {
      return { summary: { id, title: id, description: this.description } };
    },
    registerCommands: vi.fn(),
    handleMessage: vi.fn(async () => undefined),
    runAction: vi.fn(async () => undefined),
  };
}

describe("生产工具 Registry", () => {
  beforeEach(() => clearRegisteredTools());
  afterEach(() => clearRegisteredTools());

  it("按唯一 id 注册并可寻址，重复注册立即失败且不污染目录", () => {
    const id = "registry-unique-companion-probe";
    const descriptor = tool(id);

    registerTool(descriptor);

    expect(getTool(id)).toBe(descriptor);
    expect(getTools().filter((candidate) => candidate.id === id)).toEqual([descriptor]);
    expect(() => registerTool(tool(id))).toThrowError(`Duplicate KT Auto Code tool id: ${id}`);
    expect(getTools().filter((candidate) => candidate.id === id)).toEqual([descriptor]);
  });

  it("deactivate 清理后允许同一 catalog 在新生命周期重新注册", () => {
    const first = tool("lifecycle-tool");
    registerTool(first);

    clearRegisteredTools();

    expect(getTools()).toEqual([]);
    expect(getTool(first.id)).toBeUndefined();
    const replacement = tool("lifecycle-tool");
    expect(() => registerTool(replacement)).not.toThrow();
    expect(getTool(replacement.id)).toBe(replacement);
    expect(() => registerTool(tool(replacement.id))).toThrowError(
      `Duplicate KT Auto Code tool id: ${replacement.id}`,
    );
  });
});
