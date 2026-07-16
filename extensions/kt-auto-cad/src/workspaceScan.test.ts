import { describe, expect, it } from "vitest";
import { describeCadWorkspaceFiles } from "./workspaceScan.js";

describe("KT Auto CAD workspace scan", () => {
  it("filters, sorts, and describes FCStd paths with Wing CAD Core", () => {
    expect(describeCadWorkspaceFiles([
      "README.md",
      "parts/200.002-S-Bolt.fcstd",
      "asm/100.001-H-PX-Frame.ASSY.FCStd",
    ])).toEqual([
      {
        relativePath: "asm/100.001-H-PX-Frame.ASSY.FCStd",
        filename: "100.001-H-PX-Frame.ASSY.FCStd",
        documentKind: "Assembly",
        partKey: "100.001",
        partName: "Frame",
      },
      {
        relativePath: "parts/200.002-S-Bolt.fcstd",
        filename: "200.002-S-Bolt.fcstd",
        documentKind: "Part",
        partKey: "200.002",
        partName: "Bolt",
      },
    ]);
  });
});
