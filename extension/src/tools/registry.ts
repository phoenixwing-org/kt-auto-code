import type { KtTool } from "./types.js";

const tools: KtTool[] = [];

export function registerTool(tool: KtTool): void {
  tools.push(tool);
}

export function getTools(): readonly KtTool[] {
  return tools;
}

export function getTool(id: string): KtTool | undefined {
  return tools.find((t) => t.id === id);
}
