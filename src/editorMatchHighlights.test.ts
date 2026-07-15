import { describe, expect, it } from "vitest";
import {
  ktcFindIssueLineHighlightOffsets,
  ktcFindLiteralHighlightOffsets,
  ktcFindNonAsciiHighlightOffsets,
} from "./editorMatchHighlights.js";

describe("editorMatchHighlights", () => {
  it("finds every exact literal and merges overlapping associated rules", () => {
    expect(ktcFindLiteralHighlightOffsets("KtAlarmClock KtAlarm", ["KtAlarm", "AlarmClock"]))
      .toEqual([{ start: 0, end: 12 }, { start: 13, end: 20 }]);
  });

  it("deduplicates terms, ignores empty values and respects the limit", () => {
    expect(ktcFindLiteralHighlightOffsets("AAA", ["A", "", "A"], 2))
      .toEqual([{ start: 0, end: 1 }, { start: 1, end: 2 }]);
  });

  it("keeps matching case-sensitive like the replacement engine", () => {
    expect(ktcFindLiteralHighlightOffsets("AutoCode autocode", ["AutoCode"]))
      .toEqual([{ start: 0, end: 8 }]);
  });

  it("marks contiguous non-ASCII filename fragments", () => {
    expect(ktcFindNonAsciiHighlightOffsets("前缀-ASCII-后缀.h"))
      .toEqual([{ start: 0, end: 2 }, { start: 9, end: 11 }]);
  });

  it("mixed Chinese and English issue lines highlight only contiguous non-ASCII text", () => {
    const line = "设置对话框 (KtAlarmClockSettingDlg.qml)；界面见 .ui，可用 Qt Designer 编辑";
    expect(ktcFindIssueLineHighlightOffsets(line, [1, 4, 9, 18, 35], true)).toEqual([
      { start: 0, end: 5 },
      { start: 34, end: 38 },
      { start: 42, end: 45 },
      { start: 58, end: 60 },
    ]);
  });

  it("preserve mode uses editor columns and keeps surrogate pairs intact", () => {
    expect(ktcFindIssueLineHighlightOffsets("A😀B", [2], false)).toEqual([{ start: 1, end: 3 }]);
  });
});
