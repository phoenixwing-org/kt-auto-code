import { describe, expect, it } from "vitest";
import {
  ktcApplyCmakePackageIncludeMatches,
  ktcBuildCmakePackageHeaderMap,
  ktcCmakePackageIncludePath,
  ktcFindCmakePackageIncludeMatches,
} from "./cmakePackageIncludes.js";

describe("CMake Package include 映射", () => {
  it("移除 source 路径段或接受已分包路径", () => {
    expect(ktcCmakePackageIncludePath("KtCore/source/KtString.h")).toBe("KtCore/KtString.h");
    expect(ktcCmakePackageIncludePath("source/KtCore/KtArray.hpp")).toBe("KtCore/KtArray.hpp");
    expect(ktcCmakePackageIncludePath("KtCore/KtString.h")).toBe("KtCore/KtString.h");
    expect(ktcCmakePackageIncludePath("KtString.h")).toBeUndefined();
  });

  it("不区分大小写建映射并拒绝同名冲突", () => {
    const report = ktcBuildCmakePackageHeaderMap([
      "KtCore/source/KtString.h",
      "KtMath/source/Vector.hpp",
      "KtOther/source/vector.hpp",
      "KtPrivate.h",
    ]);
    expect(report.mappings.get("ktstring.h")?.includePath).toBe("KtCore/KtString.h");
    expect(report.mappings.has("vector.hpp")).toBe(false);
    expect(report.collisions).toEqual([{ fileName: "Vector.hpp", includePaths: ["KtMath/Vector.hpp", "KtOther/vector.hpp"] }]);
    expect(report.skippedUnqualifiedHeaders).toEqual(["KtPrivate.h"]);
  });

  it("只替换 include 行并保留注释、换行和空格", () => {
    const map = ktcBuildCmakePackageHeaderMap(["KtCore/source/KtString.h"]).mappings;
    const input = "// #include \"KtString.h\"\r\n  # include \"ktstring.H\" // local\r\n#include \"ktcore/ktstring.h\"\r\n#include <KtCore/KtString.h>\r\n";
    const matches = ktcFindCmakePackageIncludeMatches(input, map);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ line: 2, newValue: "  # include <KtCore/KtString.h> // local" });
    const output = ktcApplyCmakePackageIncludeMatches(input, matches);
    expect(output).toContain("\r\n  # include <KtCore/KtString.h> // local\r\n");
    expect(output).toContain("\r\n#include <KtCore/KtString.h>\r\n#include <KtCore/KtString.h>");
  });
});
