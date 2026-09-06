import type { KtTool } from "./types.js";

const tools: KtTool[] = [];

export function registerTool(tool: KtTool): void {
  if (getTool(tool.id)) {
    throw new Error(`Duplicate KT Auto Code tool id: ${tool.id}`);
  }
  tools.push(tool);
}

export function getTools(): readonly KtTool[] {
  return tools;
}

export function getTool(id: string): KtTool | undefined {
  return tools.find((t) => t.id === id);
}

/** Clears one deactivated Extension Host catalog without weakening duplicate checks during activation. */
export function clearRegisteredTools(): void {
  tools.length = 0;
}
