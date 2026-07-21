import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KtcResolveCaaRelatedProjects,
  KtcSerializeCaaRelatedProjects,
} from "./KtcRunProjectSettings.js";

describe("Run project settings paths", () => {
  it("stores sibling projects relatively and resolves them against a moved project root", () => {
    const stored = KtcSerializeCaaRelatedProjects(
      "/old/phoenix/PNXCombinedCurveWsp",
      ["/old/phoenix/PNXCaaStudy", "/old/phoenix/PNXCaaStudy"],
      path.posix,
    );
    expect(stored).toEqual(["../PNXCaaStudy"]);
    expect(KtcResolveCaaRelatedProjects(
      "/new/machine/phoenix/PNXCombinedCurveWsp",
      stored,
      path.posix,
    )).toEqual(["/new/machine/phoenix/PNXCaaStudy"]);
  });

  it("keeps a Windows cross-drive project absolute because it cannot be relative", () => {
    const stored = KtcSerializeCaaRelatedProjects(
      "C:\\phoenix\\PNXCombinedCurveWsp",
      ["D:\\shared\\PNXPreq"],
      path.win32,
    );
    expect(stored).toEqual(["D:\\shared\\PNXPreq"]);
    expect(KtcResolveCaaRelatedProjects(
      "C:\\phoenix\\PNXCombinedCurveWsp",
      stored,
      path.win32,
    )).toEqual(["D:\\shared\\PNXPreq"]);
  });

  it("drops the current project and de-duplicates Windows paths case-insensitively", () => {
    expect(KtcResolveCaaRelatedProjects(
      "C:\\phoenix\\Current",
      [".", "..\\Shared", "..\\shared"],
      path.win32,
    )).toEqual(["C:\\phoenix\\Shared"]);
  });
});
