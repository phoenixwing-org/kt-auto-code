import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { ktcApplyPackageIncludes, ktcPreviewPackageIncludes, ktcResolveCoreIncludeDirectory } from "./packageIncludeService.js";

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "ktc-package-include-"));
  const include = join(root, "core", "include");
  const target = join(root, "target");
  await mkdir(join(include, "KtCore", "source"), { recursive: true });
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(join(include, "KtCore", "source", "KtString.h"), "#pragma once\n");
  return { include, target };
}

describe("Package 头文件修正文件服务", () => {
  it("接受 core 根或 include 根", () => {
    expect(ktcResolveCoreIncludeDirectory("E:/KtRoot/core").replace(/\\/g, "/")).toMatch(/E:\/KtRoot\/core\/include$/i);
    expect(ktcResolveCoreIncludeDirectory("E:/KtRoot/core/include").replace(/\\/g, "/")).toMatch(/E:\/KtRoot\/core\/include$/i);
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
