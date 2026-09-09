/** Browser-only examples: these paths never designate real files. */
export const PREVIEW_CODEGEN_DIRECTORY = "/preview-memory/codegen";

const headers = [
  "NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
  "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit",
  "Author", "CreateDate", "Notes",
];

export interface PreviewCodegenFixture {
  readonly fileName: string;
  readonly json: string;
  readonly sources: readonly { readonly path: string; readonly text: string }[];
}

export const PREVIEW_CODEGEN_FIXTURES: readonly PreviewCodegenFixture[] = [
  {
    fileName: "IssueCommand.json",
    json: JSON.stringify({
      type: "100106", version: "4.0", NamePrefix: "PNX", NameMiddle: "IssueCommand",
      NameSpace: "Phoenix", AppendFunction: "push_back", headers,
      data: [
        ["Data", 1, "编号", "IssueId", "int", "Integer", "0", "In", 0, 1, "", 0, 0, "", "Preview", "", "内存示例"],
        ["Data", 2, "数量", "Count", "int", "Integer", "1", "In", 0, 0, "", 0, 0, "", "Preview", "", ""],
      ],
    }, null, 2),
    sources: [{
      path: `${PREVIEW_CODEGEN_DIRECTORY}/src/IssueCommand.h`,
      text: [
        "// 内存样例：不会读取或修改磁盘",
        "class PNXIssueCommandData {", "public:",
        "// START KEVIN CAA WIZARD SECTION PNXIssueCommandData PARAM DECLARATION",
        "// 待生成的参数声明",
        "// END KEVIN CAA WIZARD SECTION PNXIssueCommandData PARAM DECLARATION",
        "};", "",
      ].join("\n"),
    }],
  },
  {
    fileName: "IssueDialog.json",
    json: JSON.stringify({
      type: "100106", version: "4.0", NamePrefix: "PNX", NameMiddle: "IssueDialog",
      NameSpace: "Phoenix", AppendFunction: "push_back", headers,
      data: [["Data", 1, "宽度", "Width", "int", "Integer", "320", "In", 0, 0, "", 0, 0, "", "Preview", "", "未闭合诊断示例"]],
    }, null, 2),
    sources: [{
      path: `${PREVIEW_CODEGEN_DIRECTORY}/src/IssueDialog.h`,
      text: [
        "// 内存样例：包含可修正区域和未闭合控制符",
        "// START KEVIN CAA WIZARD SECTION PNXIssueDialogData PARAM DECLARATION",
        "// 待生成的参数声明",
        "// END KEVIN CAA WIZARD SECTION PNXIssueDialogData PARAM DECLARATION",
        "// START KEVIN CAA WIZARD SECTION PNXIssueDialogData PARAM CONSTRUCTOR",
        "// 故意缺少 END，供诊断与复制 END 点检", "",
      ].join("\n"),
    }],
  },
];
