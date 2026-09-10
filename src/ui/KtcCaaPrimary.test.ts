// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  ktcDefineCaaPrimary,
  type KtcCaaPrimary,
  type KtcCaaPrimaryModel,
} from "./KtcCaaPrimary.js";

afterEach(() => document.body.replaceChildren());

describe("KtcCaaPrimary registration", () => {
  it("recovers an own model property left by pre-registration assignment", () => {
    const model: KtcCaaPrimaryModel = {
      running: false,
      canScan: true,
      resultActionsEnabled: true,
      message: "已扫描",
      connection: { status: "online", text: "Desk Tools 已连接" },
      rows: [{ uri: "file:///workspace/A.CATDlg", relativePath: "Dialog/A.CATDlg", selected: true }],
    };
    ktcDefineCaaPrimary();
    const primary = document.createElement("ktc-caa-primary") as KtcCaaPrimary;
    Object.defineProperty(primary, "model", { configurable: true, writable: true, value: model });
    document.body.append(primary);

    expect(primary.model).toBe(model);
    expect(primary.shadowRoot?.querySelector(".path")?.textContent).toBe("A.CATDlg · Dialog");
    expect(primary.shadowRoot?.querySelector(".badge")?.textContent).toBe("已交接");
  });
});
