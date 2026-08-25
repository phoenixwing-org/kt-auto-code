import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import {
  ktcApplyPackageIncludes,
  ktcPreviewPackageIncludes,
  ktcResolveDefaultPackageIncludeDirectory,
  ktcResolvePackageIncludeDirectoryFromPublicInclude,
} from "./packageIncludeService.js";

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "ktc-package-include-"));
  const include = join(root, "core", "include");
  const target = join(root, "target");
  await mkdir(join(include, "KtCore", "source"), { recursive: true });
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(join(include, "KtCore", "source", "KtString.h"), "#pragma once\n");
  return { include, target };
}

describe("头文件引用修正文件服务", () => {
  it("ROOT_DIR 未显式指定公共目录时组合 SDK_PREFIX 定位共享 KtCore include", () => {
    expect(ktcResolveDefaultPackageIncludeDirectory("E:/KtRoot", "phoenix").replace(/\\/g, "/"))
      .toMatch(/E:\/KtRoot\/phoenix\/core\/include$/i);
    expect(ktcResolveDefaultPackageIncludeDirectory("E:/KtRoot").replace(/\\/g, "/"))
      .toMatch(/E:\/KtRoot\/kt\/core\/include$/i);
    expect(() => ktcResolveDefaultPackageIncludeDirectory("E:/KtRoot", "../outside"))
      .toThrow("SDK_PREFIX 必须是单个目录名称");
  });

  it("将 ROOT_DIR_INCLUDE 的 KtCore 公共目录转换为 package 根", () => {
    expect(ktcResolvePackageIncludeDirectoryFromPublicInclude("E:/KtRoot/phoenix/include/KtCore").replace(/\\/g, "/"))
      .toMatch(/E:\/KtRoot\/phoenix\/include$/i);
    expect(ktcResolvePackageIncludeDirectoryFromPublicInclude("E:/KtRoot/phoenix/include").replace(/\\/g, "/"))
      .toMatch(/E:\/KtRoot\/phoenix\/include$/i);
  });

  it("保留同名冲突和未进入 source/包目录结构的头文件明细供 Output 检查", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-package-conflict-"));
    const include = join(root, "include");
    const target = join(root, "target");
    await mkdir(join(include, "KtCore", "source"), { recursive: true });
    await mkdir(join(include, "KtExtra", "source"), { recursive: true });
    await mkdir(target, { recursive: true });
    await writeFile(join(include, "KtCore", "source", "Common.h"), "#pragma once\n");
    await writeFile(join(include, "KtExtra", "source", "Common.h"), "#pragma once\n");
    await writeFile(join(include, "Flat.h"), "#pragma once\n");
    await writeFile(join(target, "Demo.cpp"), "#include \"Common.h\"\n");

    const session = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target });

    expect(session.preview.collisions).toEqual([{
      fileName: "Common.h",
      includePaths: ["KtCore/Common.h", "KtExtra/Common.h"],
    }]);
    expect(session.preview.skippedHeaders).toEqual(["Flat.h"]);
    expect(session.preview.rows).toHaveLength(0);
  });

  it("预览并保持 GBK/CRLF 写回", async () => {
    const { include, target } = await createFixture();
    const source = join(target, "src", "Demo.cpp");
    await writeFile(source, iconv.encode("// 中文\r\n#include \"ktstring.H\"\r\n", "gbk"));
    const session = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target });
    expect(session.preview.rows).toMatchObject([{
      relativePath: "src/Demo.cpp",
      line: 2,
      oldValue: "#include \"ktstring.H\"",
      newValue: "#include <KtCore/KtString.h>",
    }]);
    expect(await ktcApplyPackageIncludes(session)).toEqual({ changedFiles: 1, changedIncludes: 1 });
    expect(iconv.decode(await readFile(source), "gbk")).toContain("#include <KtCore/KtString.h>\r\n");
  });

  it("预览后文件改变时拒绝写入", async () => {
    const { include, target } = await createFixture();
    const source = join(target, "Demo.cpp");
    await writeFile(source, "#include \"KtString.h\"\n");
    const session = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target });
    await writeFile(source, "// changed\n#include \"KtString.h\"\n");
    await expect(ktcApplyPackageIncludes(session)).rejects.toThrow("预览后文件已改变");
  });

  it("保持 UTF-8 BOM", async () => {
    const { include, target } = await createFixture();
    const source = join(target, "Bom.cpp");
    await writeFile(source, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("#include \"KtString.h\"\n")]));
    const session = await ktcPreviewPackageIncludes({ coreIncludeDirectory: include, targetDirectory: target });
    await ktcApplyPackageIncludes(session);
    const output = await readFile(source);
    expect([...output.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(output.subarray(3).toString("utf8")).toBe("#include <KtCore/KtString.h>\n");
  });
});
