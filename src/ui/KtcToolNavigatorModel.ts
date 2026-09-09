export type KtcToolNavigatorMode = "outline" | "grid";

export interface KtcToolNavigatorGroupNode {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly children: readonly KtcToolNavigatorNode[];
}

export interface KtcToolNavigatorToolNode {
  readonly kind: "tool";
  readonly id: string;
  readonly toolId: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: "build" | "file" | "sort" | "uuid";
}

export type KtcToolNavigatorNode = KtcToolNavigatorGroupNode | KtcToolNavigatorToolNode;

export interface KtcToolNavigatorValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly toolCount: number;
}

/**
 * Validates the Host-neutral navigation tree before a renderer consumes it.
 * Group nodes only own children; tool nodes only reference registered tools.
 */
export function ktcValidateToolNavigatorNodes(
  nodes: readonly unknown[],
): KtcToolNavigatorValidationResult {
  const issues: string[] = [];
  const nodeIds = new Set<string>();
  const toolIds = new Set<string>();
  let toolCount = 0;

  const visit = (value: unknown, path: string): void => {
    if (!isRecord(value)) {
      issues.push(`${path}/<invalid>: node is not an object`);
      return;
    }
    const id = typeof value.id === "string" ? value.id : "";
    const label = typeof value.label === "string" ? value.label : "";
    const nodePath = `${path}/${id || "<empty>"}`;
    if (!id.trim()) issues.push(`${nodePath}: node id is empty`);
    else if (nodeIds.has(id)) issues.push(`${nodePath}: duplicate node id`);
    else nodeIds.add(id);
    if (!label.trim()) issues.push(`${nodePath}: label is empty`);

    if (value.kind === "group") {
      if ("toolId" in value) issues.push(`${nodePath}: group cannot reference toolId`);
      if (!Array.isArray(value.children)) {
        issues.push(`${nodePath}: group children are missing`);
        return;
      }
      if (value.children.length === 0) issues.push(`${nodePath}: group has no children`);
      value.children.forEach((child) => visit(child, nodePath));
      return;
    }
    if (value.kind !== "tool") {
      issues.push(`${nodePath}: kind must be group or tool`);
      return;
    }

    toolCount += 1;
    if ("children" in value) issues.push(`${nodePath}: tool cannot have children`);
    const toolId = typeof value.toolId === "string" ? value.toolId : "";
    if (!toolId.trim()) issues.push(`${nodePath}: toolId is empty`);
    else if (toolIds.has(toolId)) issues.push(`${nodePath}: duplicate toolId ${toolId}`);
    else toolIds.add(toolId);
  };

  nodes.forEach((node) => visit(node, "root"));
  return { valid: issues.length === 0, issues, toolCount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ktcToolNavigatorToolCount(nodes: readonly KtcToolNavigatorNode[]): number {
  return nodes.reduce((count, node) => (
    count + (node.kind === "tool" ? 1 : ktcToolNavigatorToolCount(node.children))
  ), 0);
}
