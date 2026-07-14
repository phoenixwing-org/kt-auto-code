import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it } from "vitest";
import { detectFileEncoding } from "./fileEncoding.js";
import { runWorkspaceRename } from "./workspaceRename.js";
import { CAA_REPLACEMENT_RULES } from "./replacementRules.js";

const tempDirectories: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kt-rename-"));
  tempDirectories.push(root);
  return root;
}

function reportLevels(report: ReturnType<typeof runWorkspaceRename>): string[] {
  return report.hits.map((hit) => hit.level);
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("workspaceRename", () => {
  it.each(CAA_REPLACEMENT_RULES)(
    "CAA 规则 $search 覆盖目录、文件名和文本",
    (rule) => {
      const root = tempRoot();
      mkdirSync(join(root, `${rule.search}Dir`));
      writeFileSync(join(root, `${rule.search}Dir`, `${rule.search}.txt`), `${rule.search}\n`);
      runWorkspaceRename({ root, rules: [rule], levels: ["dir", "file", "text"], apply: true });
      expect(readFileSync(join(root, `${rule.replace}Dir`, `${rule.replace}.txt`), "utf8"))
        .toBe(`${rule.replace}\n`);
    },
  );

  it("预览和写盘 UTF-8 文本替换", () => {
    const root = tempRoot();
    const file = join(root, "Widget.cpp");
    writeFileSync(file, "class OldName {\r\n  OldName();\r\n};\r\n");
    const base = { root, oldName: "OldName", newName: "NewName", levels: ["text"] as const };

    const preview = runWorkspaceRename(base);
    expect(preview.summary.replacements).toBe(2);
    expect(readFileSync(file, "utf8")).toContain("OldName");

    const applied = runWorkspaceRename({ ...base, apply: true });
    expect(applied.summary.textFiles).toBe(1);
    expect(readFileSync(file, "utf8")).toBe("class NewName {\r\n  NewName();\r\n};\r\n");
  });

  it("保留 UTF-8 BOM", () => {
    const root = tempRoot();
    const file = join(root, "a.cpp");
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Old") ]));
    runWorkspaceRename({ root, oldName: "Old", newName: "New", levels: ["text"], apply: true });
    expect([...readFileSync(file).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it.each([
    ["UTF-8", Buffer.from("中文 Old\r\n", "utf8"), "utf8"],
    ["UTF-8 BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("中文 Old\r\n", "utf8")]), "utf8-bom"],
    ["GBK", Buffer.concat([Buffer.from([0xb2, 0xe2, 0xca, 0xd4]), Buffer.from(" Old\r\n", "ascii")]), "gbk"],
  ] as const)("文本替换保持%s编码和原始字节布局", (_label, source, expectedEncoding) => {
    const root = tempRoot();
    const file = join(root, "encoding.txt");
    writeFileSync(file, source);
    expect(detectFileEncoding(readFileSync(file)).detected).toBe(expectedEncoding);
    const expected = Buffer.from(source);
    const oldOffset = expected.indexOf(Buffer.from("Old", "ascii"));
    expect(oldOffset).toBeGreaterThanOrEqual(0);
    expected.write("New", oldOffset, "ascii");

    runWorkspaceRename({ root, oldName: "Old", newName: "New", levels: ["text"], apply: true });
    const output = readFileSync(file);
    expect(detectFileEncoding(output).detected).toBe(expectedEncoding);
    expect(output).toEqual(expected);
  });

  it("忽略 .phoenix/.ignore 中的目录", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "vendor/\n");
    mkdirSync(join(root, "vendor"));
    writeFileSync(join(root, "vendor", "a.cpp"), "Old\n");
    writeFileSync(join(root, "keep.cpp"), "Old\n");
    const result = runWorkspaceRename({ root, oldName: "Old", newName: "New", levels: ["text"] });
    expect(result.hits.map((hit) => hit.relativePath)).toEqual(["keep.cpp"]);
  });

  it("按文本、文件名、文件夹顺序批量处理", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldPkg"));
    writeFileSync(join(root, "OldPkg", "OldPkg.cpp"), "OldPkg\n");
    const options = {
      root,
      oldName: "OldPkg",
      newName: "NewPkg",
      levels: ["dir", "file", "text"],
    };
    expect(reportLevels(runWorkspaceRename(options))).toEqual(["text", "file", "dir"]);
    runWorkspaceRename({
      ...options,
      apply: true,
    });
    expect(readdirSync(root)).toContain("NewPkg");
    expect(readFileSync(join(root, "NewPkg", "NewPkg.cpp"), "utf8")).toBe("NewPkg\n");
  });

  it("父子目录同时改名时报告最终路径而非中间路径", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldParent", "OldChild"), { recursive: true });
    const options = {
      root,
      oldName: "Old",
      newName: "New",
      levels: ["dir"] as const,
    };

    const preview = runWorkspaceRename(options);
    const previewChild = preview.hits.find((hit) => hit.relativePath.endsWith("OldChild"));
    expect(previewChild?.plannedFullPath).toBe(join(root, "NewParent", "NewChild"));
    expect(previewChild?.newPath).toBe("NewParent/NewChild");

    const applied = runWorkspaceRename({ ...options, apply: true });
    const appliedChild = applied.hits.find((hit) => hit.relativePath.endsWith("OldChild"));
    expect(appliedChild?.plannedFullPath).toBe(join(root, "NewParent", "NewChild"));
    expect(appliedChild?.newPath).toBe("NewParent/NewChild");
    expect(appliedChild?.fullPath).toBe(join(root, "NewParent", "NewChild"));
    expect(readdirSync(join(root, "NewParent"))).toEqual(["NewChild"]);
  });

  it("不改名当前工作区根目录，但可改名其子目录", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldModule"));
    const report = runWorkspaceRename({
      root,
      oldName: "kt-rename-",
      newName: "kt-build-",
      levels: ["dir"],
      apply: true,
    });
    expect(report.hits).toEqual([]);
    expect(readdirSync(root)).toEqual(["OldModule"]);
  });

  it.each([
    ["相对路径", (root: string) => "OldModule"],
    ["绝对路径", (root: string) => join(root, "OldModule")],
  ])("指定%s工作目录时该目录本身可参与改名", (_label, scopeFor) => {
    const root = tempRoot();
    mkdirSync(join(root, "OldModule"));
    writeFileSync(join(root, "OldModule", "keep.txt"), "content");

    const report = runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "New",
      levels: ["dir"],
      scope: scopeFor(root),
      apply: true,
    });

    expect(report.summary).toMatchObject({ directories: 1, errors: 0 });
    expect(report.hits[0]?.relativePath).toBe("OldModule");
    expect(readFileSync(join(root, "NewModule", "keep.txt"), "utf8")).toBe("content");
  });

  it("按旧版顺序在工作目录改名前完成文本和文件名处理", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldModule"));
    writeFileSync(join(root, "OldModule", "OldFile.txt"), "OldModule\n");

    const report = runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "New",
      levels: ["dir", "file", "text"],
      scope: "OldModule",
      apply: true,
    });

    expect(report.summary).toMatchObject({ directories: 1, files: 1, textFiles: 1, errors: 0 });
    expect(readFileSync(join(root, "NewModule", "NewFile.txt"), "utf8")).toBe("NewModule\n");
  });

  it("拒绝将工作目录设到当前 VS Code 工作区之外", () => {
    const root = tempRoot();
    const outside = tempRoot();
    expect(() => runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "New",
      levels: ["dir"],
      scope: outside,
    })).toThrow("工作目录必须在当前 VS Code 工作区内");
  });

  it("工作目录输入不接受单个文件", () => {
    const root = tempRoot();
    writeFileSync(join(root, "Old.cpp"), "Old");
    expect(() => runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "New",
      levels: ["file"],
      scope: "Old.cpp",
    })).toThrow("工作目录必须是文件夹");
  });

  it("工作目录不能通过符号链接越出工作区", () => {
    const root = tempRoot();
    const outside = tempRoot();
    symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    expect(() => runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "New",
      levels: ["dir"],
      scope: "linked",
    })).toThrow("工作目录不能经过符号链接");
  });

  it("替换文件名和文件夹名中的命中片段", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldModuleTests"));
    writeFileSync(join(root, "OldModuleTests", "OldModule.test.txt"), "unchanged");
    const report = runWorkspaceRename({
      root,
      oldName: "OldModule",
      newName: "NewModule",
      levels: ["dir", "file"],
      apply: true,
    });
    expect(readFileSync(join(root, "NewModuleTests", "NewModule.test.txt"), "utf8")).toBe("unchanged");
    expect(report.hits.every((hit) => hit.fullPath.includes("NewModule"))).toBe(true);
  });

  it("文本替换允许替换为空字符串", () => {
    const root = tempRoot();
    const file = join(root, "notes.txt");
    writeFileSync(file, "remove-me keep remove-me");
    runWorkspaceRename({ root, oldName: "remove-me ", newName: "", levels: ["text"], apply: true });
    expect(readFileSync(file, "utf8")).toBe("keep remove-me");
  });

  it("CAA 多规则同时处理目录、文件名和文本", () => {
    const root = tempRoot();
    mkdirSync(join(root, "KTCIAutoCodeModule"));
    writeFileSync(
      join(root, "KTCIAutoCodeModule", "KTCEAutoCode.cpp"),
      "KTCAutoCode AutoCode KTCIAUTOCODE\n",
    );
    runWorkspaceRename({
      root,
      rules: [
        { search: "KTCIAutoCode", replace: "KTCIAutoBuild" },
        { search: "KTCEAutoCode", replace: "KTCEAutoBuild" },
        { search: "KTCAutoCode", replace: "KTCTomBuild" },
        { search: "AutoCode", replace: "TomBuild" },
      ],
      levels: ["dir", "file", "text"],
      apply: true,
    });
    const output = join(root, "KTCIAutoBuildModule", "KTCEAutoBuild.cpp");
    expect(readFileSync(output, "utf8")).toBe("KTCTomBuild TomBuild KTCIAUTOCODE\n");
  });

  it.each([
    ["utf8", "utf8"],
    ["gbk", "gbk"],
  ] as const)("ASCII 文件替换为双字节目标时使用选择的默认%s编码", (defaultEncoding, expectedEncoding) => {
    const root = tempRoot();
    const file = join(root, "ascii.txt");
    writeFileSync(file, "AutoCode\r\n", "ascii");

    runWorkspaceRename({
      root,
      oldName: "AutoCode",
      newName: "自动代码",
      defaultEncoding,
      levels: ["text"],
      apply: true,
    });

    const output = readFileSync(file);
    expect(detectFileEncoding(output).detected).toBe(expectedEncoding);
    expect(output).toEqual(defaultEncoding === "gbk"
      ? iconv.encode("自动代码\r\n", "gbk")
      : Buffer.from("自动代码\r\n", "utf8"));
  });

  it("GBK 文件替换为双字节目标时保持 GBK，不使用默认编码", () => {
    const root = tempRoot();
    const file = join(root, "legacy.txt");
    writeFileSync(file, iconv.encode("旧名\r\n", "gbk"));

    runWorkspaceRename({
      root,
      oldName: "旧名",
      newName: "新名",
      defaultEncoding: "utf8",
      levels: ["text"],
      apply: true,
    });

    const output = readFileSync(file);
    expect(detectFileEncoding(output).detected).toBe("gbk");
    expect(output).toEqual(iconv.encode("新名\r\n", "gbk"));
  });

  it("GBK 文件执行多条 ASCII 规则时保留中文与 CRLF", () => {
    const root = tempRoot();
    const file = join(root, "legacy.txt");
    const source = Buffer.concat([
      Buffer.from([0xb2, 0xe2, 0xca, 0xd4]),
      Buffer.from(" AutoCode KTCAutoCode\r\n", "ascii"),
    ]);
    writeFileSync(file, source);
    const options = {
      root,
      rules: [
        { search: "KTCAutoCode", replace: "KTCTomBuild" },
        { search: "AutoCode", replace: "TomBuild" },
      ],
      levels: ["text"] as const,
    };
    const preview = runWorkspaceRename(options);
    expect(preview.summary.replacements).toBe(2);
    const applied = runWorkspaceRename({ ...options, apply: true });
    expect(applied.summary.replacements).toBe(preview.summary.replacements);
    expect(readFileSync(file)).toEqual(Buffer.concat([
      Buffer.from([0xb2, 0xe2, 0xca, 0xd4]),
      Buffer.from(" TomBuild KTCTomBuild\r\n", "ascii"),
    ]));
  });

  it("预览即标记已存在的目标，写盘前不做任何改名", () => {
    const root = tempRoot();
    writeFileSync(join(root, "Old.cpp"), "Old.cpp");
    writeFileSync(join(root, "New.cpp"), "new");
    const options = {
      root,
      oldName: "Old.cpp",
      newName: "New.cpp",
      levels: ["file", "text"] as const,
    };
    const preview = runWorkspaceRename(options);
    expect(preview.summary.errors).toBe(1);
    expect(preview.hits.find((hit) => hit.level === "file")).toMatchObject({
      status: "error",
      detail: "目标已存在：New.cpp",
    });

    const result = runWorkspaceRename({ ...options, apply: true });
    expect(result.applied).toBe(false);
    expect(result.summary.errors).toBe(1);
    expect(readFileSync(join(root, "Old.cpp"), "utf8")).toBe("Old.cpp");
    expect(readFileSync(join(root, "New.cpp"), "utf8")).toBe("new");
  });

  it("多个源路径映射到同一目标时整批不写盘", () => {
    const root = tempRoot();
    writeFileSync(join(root, "Old.cpp"), "one");
    writeFileSync(join(root, "OldOld.cpp"), "two");
    const options = {
      root,
      rules: [
        { search: "OldOld", replace: "New" },
        { search: "Old", replace: "New" },
      ],
      levels: ["file"] as const,
    };

    const preview = runWorkspaceRename(options);
    expect(preview.summary.errors).toBe(2);
    expect(preview.hits.every((hit) =>
      hit.detail === "多个项目将改为同一目标：New.cpp")).toBe(true);

    const applied = runWorkspaceRename({ ...options, apply: true });
    expect(applied.applied).toBe(false);
    expect(readdirSync(root).sort()).toEqual(["Old.cpp", "OldOld.cpp"]);
  });

  it("仅大小写文件名变更通过临时路径完成", () => {
    const root = tempRoot();
    writeFileSync(join(root, "Old.cpp"), "content");
    const result = runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "old",
      levels: ["file"],
      apply: true,
    });

    expect(result.applied).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(readdirSync(root)).toEqual(["old.cpp"]);
    expect(readFileSync(join(root, "old.cpp"), "utf8")).toBe("content");
  });

  it("仅大小写目录名变更后保留目录内容", () => {
    const root = tempRoot();
    mkdirSync(join(root, "OldModule"));
    writeFileSync(join(root, "OldModule", "keep.txt"), "content");
    const result = runWorkspaceRename({
      root,
      oldName: "Old",
      newName: "old",
      levels: ["dir"],
      apply: true,
    });

    expect(result.applied).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(readdirSync(root)).toEqual(["oldModule"]);
    expect(readFileSync(join(root, "oldModule", "keep.txt"), "utf8")).toBe("content");
  });

  it("GBK 文件可按原编码应用双字节规则", () => {
    const root = tempRoot();
    const file = join(root, "legacy.txt");
    const source = Buffer.from([0xb2, 0xe2, 0xca, 0xd4]);
    writeFileSync(file, source);

    const result = runWorkspaceRename({
      root,
      oldName: "测试",
      newName: "新名",
      levels: ["text"],
      apply: true,
    });

    expect(result.summary.textFiles).toBe(1);
    expect(result.hits[0]).toMatchObject({ status: "applied", detectedEncoding: "gbk" });
    expect(readFileSync(file)).toEqual(iconv.encode("新名", "gbk"));
  });
});
