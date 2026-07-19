import { describe, expect, it } from "vitest";
import { ktcCodegenCandidateNavigation } from "./candidateNavigation.js";

describe("Codegen candidate navigation", () => {
  it("定位首个控制符并返回可整行高亮的 START/END 文本", () => {
    const text = [
      "void Demo() {}",
      "  // START KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
      "int value;",
      "  // END KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
    ].join("\r\n");
    const result = ktcCodegenCandidateNavigation(text);
    expect(result.firstOffset).toBe(text.indexOf("// START"));
    expect(result.highlightTerms).toEqual([
      "// START KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
      "// END KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
    ]);
  });

  it("去重相同控制符行，并允许候选变化后安全返回空定位", () => {
    expect(ktcCodegenCandidateNavigation([
      "// START KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
      "// START KEVIN CAA WIZARD SECTION PNXDemo PARAM DECLARATION",
    ].join("\n")).highlightTerms).toHaveLength(1);
    expect(ktcCodegenCandidateNavigation("int value;")).toEqual({
      firstOffset: undefined,
      highlightTerms: [],
    });
  });
});
