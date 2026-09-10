import { describe, expect, it } from "vitest";
import { ktcParseAutoBuildCleanupDialogPayload } from "./autoBuildCleanupDialogContracts.js";
import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH } from "../../core/rootCleanupPatterns.js";

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

  it("YAML来源仅接受ID与revision，不把View提供的路径、根或规则带入Host", () => {
    const forged = { path: "/outside/cleanup.yaml", root: "/outside", rulesYaml: "- *", request: { targetIds: ["all"] } };
    for (const revision of [0, 3, Number.MAX_SAFE_INTEGER]) {
      const payload = ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-clean-source", sourceId: "opaque-source", revision, ...forged });
      expect(payload).toEqual({ kind: "yaml-clean-source", sourceId: "opaque-source", revision });
      expect(Object.isFrozen(payload)).toBe(true);
    }
    expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-open-source", sourceId: "opaque-source", revision: 3, ...forged }))
      .toEqual({ kind: "yaml-open-source", sourceId: "opaque-source" });
    expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-discover", ...forged })).toEqual({ kind: "yaml-discover" });
    for (const kind of ["yaml-open-source", "yaml-clean-source"]) {
      expect(ktcParseAutoBuildCleanupDialogPayload({ kind, revision: 3, ...forged })).toBeUndefined();
      for (const sourceId of ["", "x".repeat(513), 3, null, [], {}]) {
        expect(ktcParseAutoBuildCleanupDialogPayload({ kind, sourceId, revision: 3 })).toBeUndefined();
      }
    }
    for (const revision of [undefined, -1, 0.5, "3", null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-clean-source", sourceId: "opaque-source", revision })).toBeUndefined();
    }
  });

  it("原生编辑保留准确文本并强制长度界限，包括空草稿与边界长度", () => {
    for (const rulesYaml of ["", "# comment\r\ndelete:\r\n  files:\r\n    - '*.obj'\r\n", "x".repeat(KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH)]) {
      const payload = ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-edit-rules", rulesYaml, path: "/ignored" });
      expect(payload).toEqual({ kind: "yaml-edit-rules", rulesYaml });
      expect(Object.isFrozen(payload)).toBe(true);
    }
    for (const rulesYaml of [undefined, null, 1, [], {}, "x".repeat(KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH + 1)]) {
      expect(ktcParseAutoBuildCleanupDialogPayload({ kind: "yaml-edit-rules", rulesYaml })).toBeUndefined();
    }
  });
});
