import { describe, expect, it } from "vitest";
import { ktcParseAutoBuildCleanupDialogPayload } from "./autoBuildCleanupDialogContracts.js";

describe("AutoBuild cleanup dialog payload", () => {
  it("取消不要求伪造目标或冻结 token，也不携带可执行请求", () => {
    expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "cancel" })).toEqual({ kind: "cancel" });
    expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "cancel", request: { modeId: "git-force" } }))
      .toEqual({ kind: "cancel" });
  });

  it("只接受有目标的已知方式与有界规则", () => {
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "preview",
      request: { modeId: "rules", targetIds: ["rules:root"], rulesYaml: "- Kt*" },
    })).toEqual({
      kind: "preview",
      request: { modeId: "rules", targetIds: ["rules:root"], rulesYaml: "- Kt*" },
    });
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "preview",
      request: { modeId: "unknown", targetIds: ["rules:root"], rulesYaml: "- Kt*" },
    })).toBeUndefined();
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "preview",
      request: { modeId: "rules", targetIds: [], rulesYaml: "- Kt*" },
    })).toBeUndefined();
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "preview",
      request: { modeId: "rules", targetIds: ["same", "same"], rulesYaml: "- Kt*" },
    })).toBeUndefined();
  });

  it("执行必须携带非空冻结 token", () => {
    const request = { modeId: "git-force", targetIds: ["git:root"], rulesYaml: "" };
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "execute",
      request,
      previewToken: "accepted-preview",
    })).toEqual({ kind: "execute", request, previewToken: "accepted-preview" });
    expect(ktcParseAutoBuildCleanupDialogPayload({
      kind: "execute",
      request,
      previewToken: "",
    })).toBeUndefined();
  });
});
