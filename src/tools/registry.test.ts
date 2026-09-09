import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KtTool } from "./types.js";
import {
  clearRegisteredTools,
  getNavigationDescriptor,
  getNavigationDescriptors,
  getTool,
  getTools,
  registerBuiltInTool,
  registerNavigationDescriptor,
  registerTool,
} from "./registry.js";
import { KTC_TOOL_REGISTRATION_CATALOG } from "./toolRegistrationCatalog.js";

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
    const id = "run";
    const descriptor = tool(id);

    registerTool(descriptor);

    expect(getTool(id)).toBe(descriptor);
    expect(getTools().filter((candidate) => candidate.id === id)).toEqual([descriptor]);
    expect(() => registerTool(tool(id))).toThrowError(`Duplicate KT Auto Code tool id: ${id}`);
    expect(getTools().filter((candidate) => candidate.id === id)).toEqual([descriptor]);
  });

  it("deactivate 清理后允许同一 catalog 在新生命周期重新注册", () => {
    const first = tool("git");
    registerTool(first);

    clearRegisteredTools();

    expect(getTools()).toEqual([]);
    expect(getTool(first.id)).toBeUndefined();
    const replacement = tool("git");
    expect(() => registerTool(replacement)).not.toThrow();
    expect(getTool(replacement.id)).toBe(replacement);
    expect(() => registerTool(tool(replacement.id))).toThrowError(
      `Duplicate KT Auto Code tool id: ${replacement.id}`,
    );
  });

  it("导航 Group 与业务 KtTool 分库注册，且共享 id 冲突门禁", () => {
    const registration = KTC_TOOL_REGISTRATION_CATALOG.tools.find(({ toolId }) => toolId === "codeAssistant")!;
    const descriptor = {
      id: registration.toolId,
      title: registration.title,
      shortTitle: registration.shortTitle,
      description: registration.description,
      kind: "group" as const,
    };

    registerNavigationDescriptor(descriptor);

    expect(getNavigationDescriptor(descriptor.id)).toEqual(descriptor);
    expect(getNavigationDescriptors()).toEqual([descriptor]);
    expect(getTool(descriptor.id)).toBeUndefined();
    expect(getTools()).toEqual([]);
    expect(() => registerTool(tool(descriptor.id))).toThrowError(
      `Duplicate KT Auto Code tool id: ${descriptor.id}`,
    );
  });

  it("正式内置 Tool 与导航 Group 缺少注册 JSON 时立即失败", () => {
    expect(() => registerBuiltInTool(tool("missing-tool"))).toThrowError("工具未注册：missing-tool");
    expect(() => registerNavigationDescriptor({
      id: "missing-group",
      title: "遗留标题",
      description: "遗留说明",
      kind: "group",
    })).toThrowError("工具未注册：missing-group");
    expect(getTools()).toEqual([]);
    expect(getNavigationDescriptors()).toEqual([]);
  });

  it("以注册 Catalog 统一 KtTool 与 Primary ToolSummary 文案，同时保留实现图标和对象身份", () => {
    const descriptor = {
      ...tool("run"),
      title: "旧 Run 标题",
      description: "旧 Run 描述",
      icon: "media/tools/run.svg",
    };

    registerTool(descriptor);

    expect(getTool("run")).toBe(descriptor);
    expect(descriptor).toMatchObject({
      title: "Run",
      shortTitle: "Run",
      description: "运行配置与状态",
      icon: "media/tools/run.svg",
    });
    expect(descriptor.getPanelModel().summary).toMatchObject({
      id: "run",
      title: "Run",
      shortTitle: "Run",
      description: "运行配置与状态",
      icon: "media/tools/run.svg",
    });

    clearRegisteredTools();
    registerTool(descriptor);
    expect(descriptor.getPanelModel().summary.title).toBe("Run");
  });

  it("对除导航 Group 外的 14 个正式 KtTool 输出 Catalog 的 title、shortTitle 与 description", () => {
    const formalMetadata = KTC_TOOL_REGISTRATION_CATALOG.tools
      .filter(({ toolId }) => toolId !== "codeAssistant");

    for (const metadata of formalMetadata) registerTool(tool(metadata.toolId));

    expect(getTools()).toHaveLength(14);
    expect(getTools().map((descriptor) => ({
      toolId: descriptor.id,
      title: descriptor.title,
      shortTitle: descriptor.shortTitle,
      description: descriptor.description,
      summary: descriptor.getPanelModel().summary,
    }))).toEqual(formalMetadata.map((metadata) => ({
      toolId: metadata.toolId,
      title: metadata.title,
      shortTitle: metadata.shortTitle,
      description: metadata.description,
      summary: expect.objectContaining({
        id: metadata.toolId,
        title: metadata.title,
        shortTitle: metadata.shortTitle,
        description: metadata.description,
      }),
    })));
  });
});
