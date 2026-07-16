import { describe, expect, it } from "vitest";
import { describeCadFilename } from "../extensions/kt-auto-cad/src/cadFilename.js";

describe("KT Auto CAD Wing CAD Core consumption", () => {
  it("previews an FCStd filename using the shared BOM rules", () => {
    expect(describeCadFilename("asm/200001.001-H-MDL-Cover.ASSY.FCStd")).toEqual({
      filename: "200001.001-H-MDL-Cover.ASSY.FCStd",
      documentKind: "Assembly",
      partKey: "200001.001",
      partName: "Cover",
    });
  });

  it("ignores non-FCStd files", () => {
    expect(describeCadFilename("README.md")).toBeUndefined();
  });
});
