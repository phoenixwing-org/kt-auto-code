import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRenameReport } from "./workspaceRename.js";
import { ktcRunSearchReplaceWorkflow } from "./searchReplaceWorkflow.js";

function report(applied: boolean, errors = 0): WorkspaceRenameReport {
  return {
    root: "/workspace",
    applied,
    hits: [],
    summary: {
      rules: 1,
      matchedRules: 1,
      directories: 0,
      files: 0,
      textFiles: 1,
      replacements: 2,
      skipped: 0,
      errors,
    },
  };
}

describe("searchReplaceWorkflow", () => {
  it("只预览时不请求确认也不写盘", async () => {
    const confirm = vi.fn(async () => true);
    const apply = vi.fn(() => report(true));
    const emitted: string[] = [];

    const result = await ktcRunSearchReplaceWorkflow(false, {
      preview: () => report(false),
      confirm,
      apply,
      report: (_value, phase) => emitted.push(phase),
    });

    expect(result).toBe("completed");
    expect(emitted).toEqual(["preview"]);
    expect(confirm).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("预检有冲突时不弹确认且不写盘", async () => {
    const confirm = vi.fn(async () => true);
    const apply = vi.fn(() => report(true));

    const result = await ktcRunSearchReplaceWorkflow(true, {
      preview: () => report(false, 2),
      confirm,
      apply,
      report: () => {},
    });

    expect(result).toBe("blocked");
    expect(confirm).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("用户取消后保留预览但不写盘", async () => {
    const apply = vi.fn(() => report(true));
    const emitted: string[] = [];

    const result = await ktcRunSearchReplaceWorkflow(true, {
      preview: () => report(false),
      confirm: async () => false,
      apply,
      report: (_value, phase) => emitted.push(phase),
    });

    expect(result).toBe("cancelled");
    expect(emitted).toEqual(["preview"]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("确认后写盘并按顺序发送预览和写盘报告", async () => {
    const calls: string[] = [];

    const result = await ktcRunSearchReplaceWorkflow(true, {
      preview: () => { calls.push("preview"); return report(false); },
      confirm: async () => { calls.push("confirm"); return true; },
      apply: () => { calls.push("apply"); return report(true); },
      report: (_value, phase) => calls.push(`report:${phase}`),
    });

    expect(result).toBe("completed");
    expect(calls).toEqual(["preview", "report:preview", "confirm", "apply", "report:apply"]);
  });

  it.each([
    ["引擎未执行写盘", report(false)],
    ["写盘报告包含错误", report(true, 1)],
  ])("%s 时返回 error", async (_label, applied) => {
    const result = await ktcRunSearchReplaceWorkflow(true, {
      preview: () => report(false),
      confirm: async () => true,
      apply: () => applied,
      report: () => {},
    });
    expect(result).toBe("error");
  });
});
