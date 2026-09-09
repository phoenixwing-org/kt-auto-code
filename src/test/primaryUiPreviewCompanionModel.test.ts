import { describe, expect, it } from "vitest";
import {
  PREVIEW_COMPANION_MAX_ACTIONS,
  PREVIEW_COMPANION_MAX_FACTS,
  normalizePreviewCompanionModel,
} from "../../ui-preview/src/previewCompanionModel.js";

describe("Primary UI preview companion model", () => {
  it("规范化并冻结编译运行中的纯数据摘要", () => {
    const model = normalizePreviewCompanionModel({
      status: { label: "  编译运行中  ", tone: "progress" },
      facts: [
        { id: "target", label: " 构建目标 ", value: " PNXBomAnalysisWsp " },
        { id: "platform", label: "平台", value: "CAA R33" },
      ],
      actions: [
        { actionId: "showLog", label: " 查看日志 ", enabled: true },
        { actionId: "stop", label: "停止", enabled: false },
      ],
    });

    expect(model).toEqual({
      status: { label: "编译运行中", tone: "progress" },
      facts: [
        { id: "target", label: "构建目标", value: "PNXBomAnalysisWsp" },
        { id: "platform", label: "平台", value: "CAA R33" },
      ],
      actions: [
        { actionId: "showLog", label: "查看日志", enabled: true },
        { actionId: "stop", label: "停止", enabled: false },
      ],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.status)).toBe(true);
    expect(Object.isFrozen(model.facts)).toBe(true);
    expect(Object.isFrozen(model.actions)).toBe(true);
    expect(model.facts.every(Object.isFrozen)).toBe(true);
    expect(model.actions.every(Object.isFrozen)).toBe(true);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it("允许空 facts/actions，并覆盖全部状态 tone", () => {
    for (const tone of ["idle", "progress", "success", "warning", "error"] as const) {
      expect(normalizePreviewCompanionModel({
        status: { label: tone, tone },
        facts: [],
        actions: [],
      }).status.tone).toBe(tone);
    }
  });

  it("限制 facts 和 actions 数量", () => {
    const fact = (index: number) => ({ id: `fact-${index}`, label: `事实 ${index}`, value: `${index}` });
    const action = (index: number) => ({ actionId: `action-${index}`, label: `操作 ${index}`, enabled: true });

    expect(() => normalizePreviewCompanionModel({
      status: { label: "就绪", tone: "idle" },
      facts: Array.from({ length: PREVIEW_COMPANION_MAX_FACTS + 1 }, (_, index) => fact(index)),
      actions: [],
    })).toThrow(`at most ${PREVIEW_COMPANION_MAX_FACTS}`);
    expect(() => normalizePreviewCompanionModel({
      status: { label: "就绪", tone: "idle" },
      facts: [],
      actions: Array.from({ length: PREVIEW_COMPANION_MAX_ACTIONS + 1 }, (_, index) => action(index)),
    })).toThrow(`at most ${PREVIEW_COMPANION_MAX_ACTIONS}`);
  });

  it("拒绝规范化后的重复 fact id 和 actionId", () => {
    expect(() => normalizePreviewCompanionModel({
      status: { label: "完成", tone: "success" },
      facts: [
        { id: "output", label: "输出", value: "A" },
        { id: " output ", label: "输出", value: "B" },
      ],
      actions: [],
    })).toThrow("duplicate id: output");
    expect(() => normalizePreviewCompanionModel({
      status: { label: "完成", tone: "success" },
      facts: [],
      actions: [
        { actionId: "open", label: "打开", enabled: true },
        { actionId: " open ", label: "再次打开", enabled: true },
      ],
    })).toThrow("duplicate actionId: open");
  });

  it("拒绝 HTML、函数、任意 payload 及错误字段类型", () => {
    expect(() => normalizePreviewCompanionModel({
      status: { label: "失败", tone: "error", html: "<b>失败</b>" },
      facts: [],
      actions: [],
    })).toThrow("unsupported field: html");
    expect(() => normalizePreviewCompanionModel({
      status: { label: "就绪", tone: "idle" },
      facts: [],
      actions: [{ actionId: "run", label: "运行", enabled: true, payload: { command: "run" } }],
    })).toThrow("unsupported field: payload");
    expect(() => normalizePreviewCompanionModel({
      status: { label: "就绪", tone: "idle" },
      facts: [],
      actions: [{ actionId: "run", label: () => "运行", enabled: true }],
    })).toThrow("label must be a non-empty string");
    expect(() => normalizePreviewCompanionModel({
      status: { label: "未知", tone: "busy" },
      facts: [],
      actions: [],
    })).toThrow("status tone is invalid");
  });
});
