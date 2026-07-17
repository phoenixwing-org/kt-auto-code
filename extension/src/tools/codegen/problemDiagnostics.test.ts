import { describe, expect, it } from "vitest";
import { ktcProjectCodegenProblems } from "./problemDiagnostics.js";

describe("Codegen Problems projection", () => {
  it("保留 warning/error 的源码位置并过滤 info", () => {
    expect(ktcProjectCodegenProblems([
      {
        code: "marker.missing-end",
        severity: "error",
        message: "missing",
        path: { source: "source", file: "/workspace/a.cpp", row: 8, column: 4 },
      },
      { code: "render.warning", severity: "warning", message: "check" },
      { code: "render.info", severity: "info", message: "skip" },
    ], "/workspace/Param.json")).toEqual([
      {
        file: "/workspace/a.cpp",
        line: 8,
        column: 4,
        severity: "error",
        code: "marker.missing-end",
        message: "missing",
      },
      {
        file: "/workspace/Param.json",
        line: 0,
        column: 0,
        severity: "warning",
        code: "render.warning",
        message: "check",
      },
    ]);
  });
});
