import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceController = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const commandController = readFileSync(
  new URL("./editorCommandController.ts", import.meta.url),
  "utf8",
);

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `missing start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing end: ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

function expectOrder(source: string, ...needles: string[]): void {
  let cursor = -1;
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1);
    expect(next, `expected after offset ${cursor}: ${needle}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

const handler = section(
  commandController,
  "export async function ktcExecuteCodegenEditorCommand(",
  "\n}",
);
const actionTable = section(
  commandController,
  "function acceptActionTable(",
  "/** 执行 Router 已收敛",
);

describe("Codegen editor command orchestration characterization", () => {
  it("冻结九类路由命令的现有分派边界", () => {
    for (const kind of [
      "ignore",
      "control",
      "dirty",
      "exchange",
      "ready",
      "revert",
      "cancelPreflight",
      "preflight",
    ]) {
      expect(handler).toContain(`command.kind === "${kind}"`);
    }
    expect(handler).toContain('command.kind !== "apply"');
    expect(workspaceController).toContain(
      "ktcRouteCodegenEditorMessage(session.identity.uri, message)",
    );
    expect(workspaceController).toContain("ktcExecuteCodegenEditorCommand(");
    expect(workspaceController).not.toContain("private async handleEditorMessage(");
    expect(workspaceController).not.toContain("private acceptActionTable(");
  });

  it("冻结 dirty、exchange stale/accepted 与 sync/save 的调用顺序", () => {
    const exchange = handler.slice(
      handler.indexOf('if (command.kind === "exchange")'),
      handler.indexOf('if (command.kind === "ready")'),
    );

    expectOrder(
      exchange,
      "session.acceptTable(command.model.table)",
      'acceptance === "stale"',
      'acceptance === "accepted"',
      "actions.didMutate()",
      'command.action === "save"',
      "actions.save()",
      "已接收 ${session.identity.fileName} 的整表草稿。",
    );
    expect(handler).toContain("session.markTableDirty(command.itemCount)");
    expect(handler).toContain("正在编辑 ${session.identity.fileName}；尚未写盘。");
  });

  it("冻结 Preflight 先启动计时、接收整表，再复用同一计时器", () => {
    const preflight = handler.slice(
      handler.indexOf('if (command.kind === "preflight")'),
      handler.indexOf('if (command.kind !== "apply")'),
    );
    expectOrder(
      preflight,
      "actions.startTimer()",
      "acceptActionTable(session, command.table, actions)",
      "actions.runPreflight(timer)",
    );
  });

  it("冻结 Apply 总计时与自动预检独立计时，以及无计划时停止", () => {
    const apply = handler.slice(handler.indexOf('if (command.kind !== "apply")'));
    expectOrder(
      apply,
      'command.kind !== "apply"',
      "actions.startTimer()",
      "acceptActionTable(session, command.table, actions)",
      "if (!session.preflight) await actions.runPreflight();",
      "if (!session.preflight)",
      "自动预检未产生可用计划，Apply 已停止",
      "actions.apply(timer)",
    );
    expect(apply).not.toContain("actions.runPreflight(timer)");
  });

  it("冻结动作整表 stale 阻断、accepted 发布 mutation、unchanged 继续", () => {
    expectOrder(
      actionTable,
      "session.acceptTable(table)",
      'acceptance === "stale"',
      "表格 revision 已过期，请先还原或重新打开。",
      "return false",
      'acceptance === "accepted"',
      "actions.didMutate(",
      "return true",
    );
  });
});
