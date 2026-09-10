import { describe, expect, it } from "vitest";
import type { KtcCaaPrimaryActionDetail } from "../ui/KtcCaaPrimary.js";
import {
  ktcCaaPrimaryMessageForAction,
  ktcCreateCaaPrimaryModel,
  type KtcCaaPrimaryAdapterInput,
} from "./caaPrimaryAdapter.js";

describe("CAA Primary formal adapter", () => {
  it("keeps an unrun tool distinct from a completed empty scan", () => {
    expect(ktcCreateCaaPrimaryModel({})).toMatchObject({
      running: false,
      canScan: false,
      resultActionsEnabled: false,
      message: "",
      connection: { status: "unknown", text: "尚未检测 Desk Tools 连接" },
    });
    expect(ktcCreateCaaPrimaryModel({}).rows).toBeUndefined();

    const completed = ktcCreateCaaPrimaryModel({
      directory: "/workspace/PNXCaaStudy",
      state: { status: "done", caaDialogResults: [] },
    });
    expect(completed).toMatchObject({ canScan: true, resultActionsEnabled: true, rows: [] });
  });

  it("projects real connection, environment, files and selected handoff without Host-only fields", () => {
    const input: KtcCaaPrimaryAdapterInput = {
      directory: " C:\\workspace\\PNXCaaStudy ",
      state: {
        status: "running",
        message: "正在定位 .CATDlg 文件…",
        caaSettingsText: "ROOT_DIR=C:\\Phoenix",
        caaDeskConnection: {
          status: "online",
          text: "Desk Tools 桌面服务已连接",
          endpoint: "http://127.0.0.1:37021",
          checkedAt: "2026-09-09T00:00:00.000Z",
        },
        caaDialogResults: [
          { uri: "file:///C:/workspace/Dialog/A.CATDlg", relativePath: "Dialog/A.CATDlg", selected: true },
          { uri: "file:///C:/workspace/Dialog/B.CATDlg", relativePath: "Dialog/B.CATDlg", selected: false },
        ],
      },
    };
    expect(ktcCreateCaaPrimaryModel(input)).toEqual({
      running: true,
      canScan: true,
      resultActionsEnabled: true,
      message: "正在定位 .CATDlg 文件…",
      environmentText: "工程环境：ROOT_DIR=C:\\Phoenix",
      connection: { status: "online", text: "Desk Tools 桌面服务已连接" },
      rows: [
        { uri: "file:///C:/workspace/Dialog/A.CATDlg", relativePath: "Dialog/A.CATDlg", selected: true },
        { uri: "file:///C:/workspace/Dialog/B.CATDlg", relativePath: "Dialog/B.CATDlg", selected: false },
      ],
    });
  });

  it("disables stale result actions when the current directory is absent", () => {
    const model = ktcCreateCaaPrimaryModel({
      directory: "   ",
      state: {
        status: "error",
        message: "CAA UI 结果已失效，请重新扫描。",
        caaDialogResults: [
          { uri: "file:///old/A.CATDlg", relativePath: "A.CATDlg", selected: true },
        ],
      },
    });
    expect(model).toMatchObject({ canScan: false, resultActionsEnabled: false });
    expect(model.rows).toHaveLength(1);
  });

  it("keeps the Primary busy while the real Desk Tools probe is pending", () => {
    const model = ktcCreateCaaPrimaryModel({
      directory: "/workspace/PNXCaaStudy",
      state: {
        status: "idle",
        caaDeskConnection: {
          status: "checking",
          text: "正在连接 Desk Tools…",
          checkedAt: "2026-09-09T00:00:00.000Z",
        },
      },
    });
    expect(model.running).toBe(true);
    expect(model.connection).toEqual({ status: "checking", text: "正在连接 Desk Tools…" });
  });

  it.each<[KtcCaaPrimaryActionDetail, object]>([
    [{ actionId: "scan" }, { type: "run", toolId: "caaDialog", action: "scan" }],
    [{ actionId: "settings" }, { type: "run", toolId: "caaDialog", action: "fix" }],
    [{ actionId: "checkConnection" }, { type: "run", toolId: "caaDialog", action: "checkConnection" }],
    [{ actionId: "open", uri: "file:///work/A.CATDlg" }, { type: "caaDialogAction", toolId: "caaDialog", action: "open", uri: "file:///work/A.CATDlg" }],
    [{ actionId: "openExternal", uri: "file:///work/A.CATDlg" }, { type: "caaDialogAction", toolId: "caaDialog", action: "openExternal", uri: "file:///work/A.CATDlg" }],
  ])("maps %o to the existing Host message", (detail, expected) => {
    expect(ktcCaaPrimaryMessageForAction(detail)).toEqual(expected);
  });
});
