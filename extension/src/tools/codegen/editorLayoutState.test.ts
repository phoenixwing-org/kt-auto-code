import { describe, expect, it } from "vitest";
import {
  KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  ktcNormalizeCodegenEditorLayout,
} from "./editorLayoutState.js";

describe("Codegen editor layout state", () => {
  it("损坏状态回退默认值并限制左右分隔比例", () => {
    expect(ktcNormalizeCodegenEditorLayout(undefined)).toEqual(KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT);
    expect(ktcNormalizeCodegenEditorLayout({ controlSplitPercent: 2 })).toEqual({
      controlSplitPercent: 20,
    });
    expect(ktcNormalizeCodegenEditorLayout({ controlSplitPercent: 99 })).toEqual({
      controlSplitPercent: 75,
    });
    expect(ktcNormalizeCodegenEditorLayout({ controlSplitPercent: 47.6 })).toEqual({
      controlSplitPercent: 48,
    });
  });
});
