import { describe, expect, it } from "vitest";
import {
  ktcIsHeaderAsciiPanelMessage,
  ktcIsIgnoreRecommendationPanelMessage,
} from "./panelMessageGuards.js";

describe("panelMessageGuards", () => {
  it.each([
    { type: "ready" },
    { type: "openIssue", file: "/workspace/a.h", line: 3 },
  ])("接受有效头文件 View 消息：%j", (message) => {
    expect(ktcIsHeaderAsciiPanelMessage(message)).toBe(true);
  });

  it.each([
    { type: "openIssue", file: "", line: 3 },
    { type: "openIssue", file: "/workspace/a.h", line: 0 },
    { type: "openIssue", file: "/workspace/a.h", line: 1.5 },
  ])("拒绝非法头文件 View 消息：%j", (message) => {
    expect(ktcIsHeaderAsciiPanelMessage(message)).toBe(false);
  });

  it.each([
    { type: "ready" },
    { type: "applyGroups", groupIds: ["caa-mkmk", "native-object"] },
  ])("接受有效 Ignore View 消息：%j", (message) => {
    expect(ktcIsIgnoreRecommendationPanelMessage(message)).toBe(true);
  });

  it.each([
    { type: "applyGroups", groupIds: [] },
    { type: "applyGroups", groupIds: [""] },
    { type: "applyGroups", groupIds: ["caa", "caa"] },
    { type: "applyGroups", groupIds: "caa" },
  ])("拒绝非法 Ignore View 消息：%j", (message) => {
    expect(ktcIsIgnoreRecommendationPanelMessage(message)).toBe(false);
  });
});
