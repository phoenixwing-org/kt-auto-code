import { describe, expect, it } from "vitest";
import cadPackage from "../../../extensions/kt-auto-cad/package.json";
import { ktcReadModuleContribution, ktcReadModuleToolDefinitions } from "./moduleTools.js";

describe("shared Ribbon module tool definitions", () => {
  it("loads CAD tools from the optional extension manifest in declared order", () => {
    const tools = ktcReadModuleToolDefinitions(cadPackage, "cad");
    expect(tools.map((tool) => [tool.id, tool.requirement])).toEqual([
      ["cadFilename", "none"],
      ["cadScan", "none"],
      ["cadRead", "optional-desk-provider"],
      ["cadQuery", "workspace-database"],
      ["cadProvider", "none"],
      ["cadDiagnostics", "none"],
    ]);
    expect(tools.every((tool) => tool.moduleId === "cad" && tool.command.startsWith("ktAutoCad."))).toBe(true);
    expect(ktcReadModuleContribution(cadPackage)).toMatchObject({
      id: "cad",
      title: "CAD",
      order: 20,
      commandPrefix: "ktAutoCad.",
    });
  });

  it("rejects duplicate, unsafe and cross-module commands", () => {
    const packageJson = {
      ktAutoCodeModule: {
        id: "cad",
        title: "CAD",
        commandPrefix: "ktAutoCad.",
        tools: [
          { id: "safe", shortTitle: "安全", title: "安全", description: "安全", command: "ktAutoCad.open", requirement: "none" },
          { id: "safe", shortTitle: "重复", title: "重复", description: "重复", command: "ktAutoCad.open", requirement: "none" },
          { id: "bad-id", shortTitle: "错误", title: "错误", description: "错误", command: "ktAutoCad.open", requirement: "none" },
          { id: "foreign", shortTitle: "越界", title: "越界", description: "越界", command: "workbench.action.closeWindow", requirement: "none" },
        ],
      },
    };
    expect(ktcReadModuleToolDefinitions(packageJson, "cad").map((tool) => tool.id)).toEqual(["safe"]);
  });

  it("parses an unrelated future module through the same contract", () => {
    const contribution = ktcReadModuleContribution({
      ktAutoCodeModule: {
        id: "drawing-review",
        title: "Review",
        order: 30,
        commandPrefix: "ktDrawingReview.",
        tools: [{
          id: "reviewOpen",
          shortTitle: "审图",
          title: "打开审图",
          description: "未来模块原型",
          command: "ktDrawingReview.open",
          requirement: "none",
        }],
      },
    });
    expect(contribution?.tools[0]).toMatchObject({ moduleId: "drawing-review", id: "reviewOpen" });
  });
});
