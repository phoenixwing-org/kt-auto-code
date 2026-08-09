import type { SourceEncodingIssue } from "../../core/sourceEncodingScan.js";

/** CP1252 常见字节的中文名（CAA 误粘贴） */
const BYTE_NAMES: Record<number, string> = {
  0x91: "左单弯引号 ‘",
  0x92: "右单弯引号 ’",
  0x93: "左双弯引号 “",
  0x94: "右双弯引号 ”",
  0x96: "短破折号 –",
  0x97: "长破折号 —",
  0x85: "省略号 …",
  0x82: "单低引号 ‚",
  0x84: "双低引号 „",
  0xa0: "不换行空格 NBSP",
};

function formatToLabel(suggested?: string): string {
  if (!suggested || suggested === " ") {
    return "空格";
  }
  if (suggested.length === 1) {
    if (suggested === '"') return 'ASCII 双引号 "';
    if (suggested === "'") return "ASCII 单引号 '";
    if (suggested === "-") return "ASCII 连字符 -";
    return `ASCII '${suggested}'`;
  }
  return `ASCII ${suggested}`;
}

/** 将扫描项格式化为「原 → 修正」展示文案 */
export function formatIssueTransform(issue: SourceEncodingIssue): {
  fromLabel: string;
  toLabel: string;
  kind: string;
} {
  const hex = `0x${issue.byte.toString(16).padStart(2, "0").toUpperCase()}`;

  if (issue.kind === "file_bom") {
    const target = issue.suggestedAscii || "UTF-8";
    const label = issue.hint?.includes("UTF-8 BOM")
      ? "UTF-8 BOM (EF BB BF)"
      : issue.hint?.includes("宽字节")
        ? issue.context.replace(/^文件含 /, "")
        : issue.context.replace(/^文件含 /, "");
    return {
      kind: issue.kind,
      fromLabel: issue.context.replace(/^文件含 /, "") || label,
      toLabel: target,
    };
  }

  if (issue.kind === "non_ascii") {
    return {
      kind: issue.kind,
      fromLabel: `GBK 多字节 ${hex}`,
      toLabel: formatToLabel(issue.suggestedAscii ?? " "),
    };
  }

  if (issue.kind === "fullwidth_punct") {
    const from = issue.hint?.replace(/，建议改为 ASCII.*$/, "") ?? `全角标点 ${hex}`;
    return {
      kind: issue.kind,
      fromLabel: from,
      toLabel: formatToLabel(issue.suggestedAscii),
    };
  }

  if (issue.kind === "invalid_utf8") {
    const named = BYTE_NAMES[issue.byte];
    return {
      kind: issue.kind,
      fromLabel: named ? `${named} ${hex}` : `非法 UTF-8 字节 ${hex}`,
      toLabel: formatToLabel(issue.suggestedAscii),
    };
  }

  const named = BYTE_NAMES[issue.byte];
  if (named) {
    return {
      kind: issue.kind,
      fromLabel: `${named} ${hex}`,
      toLabel: formatToLabel(issue.suggestedAscii),
    };
  }

  return {
    kind: issue.kind,
    fromLabel: `问题字节 ${hex}`,
    toLabel: formatToLabel(issue.suggestedAscii ?? " "),
  };
}

/** 同一偏移只保留一条（invalid_gbk / invalid_utf8 重复报告时） */
export function dedupeIssuesByOffset(issues: SourceEncodingIssue[]): SourceEncodingIssue[] {
  const seen = new Set<number>();
  const out: SourceEncodingIssue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.offset)) {
      continue;
    }
    seen.add(issue.offset);
    out.push(issue);
  }
  return out;
}
