import { describe, expect, it } from "vitest";
import {
  KTC_TOOL_REGISTRATION_BY_ID,
  ktcParseToolRegistrationCatalog,
  ktcRequireToolRegistration,
} from "./toolRegistrationCatalog.js";

describe("Tool registration catalog", () => {
  it("把 autoBuild 的统一显示名称注册为编译工具", () => {
    expect(ktcRequireToolRegistration("autoBuild")).toMatchObject({
      toolId: "autoBuild",
      title: "编译工具",
      shortTitle: "编译",
      icon: "build",
    });
    expect(Object.isFrozen(KTC_TOOL_REGISTRATION_BY_ID.autoBuild)).toBe(true);
  });

  it("覆盖正式 Host 注册项以及 preview-only Right leaf", () => {
    const expectedToolIds = [
      "headerAscii",
      "encodingFix",
      "ignoreSettings",
      "environmentSettings",
      "codeRename",
      "codegen",
      "reorderMembers",
      "codeAssistant",
      "autoBuild",
      "projectRename",
      "uuidReplace",
      "caaDialog",
      "git",
      "run",
      "packageIncludes",
    ];

    expect(expectedToolIds.filter((toolId) => !KTC_TOOL_REGISTRATION_BY_ID[toolId])).toEqual([]);
  });

  it("拒绝重复 toolId 和缺失显示字段", () => {
    const tool = {
      toolId: "sample",
      title: "示例",
      shortTitle: "示例",
      description: "示例工具",
      icon: "file",
      groupId: "sample",
    };

    expect(() => ktcParseToolRegistrationCatalog({ version: 1, tools: [tool, tool] }))
      .toThrow("工具注册 toolId 重复：sample");
    expect(() => ktcParseToolRegistrationCatalog({
      version: 1,
      tools: [{ ...tool, title: "" }],
    })).toThrow("title 必须是非空字符串");
    expect(() => ktcRequireToolRegistration("missing")).toThrow("工具未注册：missing");
  });
});
