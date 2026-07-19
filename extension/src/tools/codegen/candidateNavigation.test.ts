import { describe, expect, it } from "vitest";
import {
  ktcCodegenCandidateNavigation,
  ktcShouldReplaceCodegenCandidateTab,
} from "./candidateNavigation.js";

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

  it("只替换上一份未编辑的 Preview 或受管普通候选标签", () => {
    const preview = { uri: "file:///A.cpp", managedRegularTab: false };
    const fallback = { uri: "file:///A.cpp", managedRegularTab: true };
    const tab = { uri: "file:///A.cpp", dirty: false, pinned: false, preview: true };
    expect(ktcShouldReplaceCodegenCandidateTab(preview, "file:///B.cpp", tab)).toBe(true);
    expect(ktcShouldReplaceCodegenCandidateTab(fallback, "file:///B.cpp", { ...tab, preview: false })).toBe(true);
    expect(ktcShouldReplaceCodegenCandidateTab(preview, "file:///A.cpp", tab)).toBe(false);
    expect(ktcShouldReplaceCodegenCandidateTab(preview, "file:///B.cpp", { ...tab, dirty: true })).toBe(false);
    expect(ktcShouldReplaceCodegenCandidateTab(preview, "file:///B.cpp", { ...tab, pinned: true })).toBe(false);
    expect(ktcShouldReplaceCodegenCandidateTab(preview, "file:///B.cpp", { ...tab, preview: false })).toBe(false);
  });
});
