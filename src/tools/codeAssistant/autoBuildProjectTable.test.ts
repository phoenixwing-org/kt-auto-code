import { describe, expect, it } from "vitest";
import { ktcCanAccessAutoBuildPathOnHost, ktcCreateAutoBuildProjectRow, ktcIsAbsoluteAutoBuildPath, ktcIsAutoBuildFilesystemRoot, ktcJoinAutoBuildPath, ktcResolveAutoBuildPath, ktcStoreAutoBuildPath } from "./autoBuildProjectTable.js";

describe("Auto Build project table paths", () => {
  it("stores descendants relative to the working directory", () => {
    expect(ktcStoreAutoBuildPath("E:/codeMaster/XyCore", "E:/codeMaster")).toBe("XyCore");
    expect(ktcResolveAutoBuildPath("XyCore", "E:/codeMaster")).toMatch(/E:[\\/]codeMaster[\\/]XyCore$/i);
  });

  it("keeps paths outside the working directory absolute", () => {
    expect(ktcStoreAutoBuildPath("E:/XyRoot", "E:/codeMaster")).toMatch(/^E:[\\/]XyRoot$/i);
    expect(ktcStoreAutoBuildPath("F:\\XyRoot", "E:\\codeMaster")).toBe("F:\\XyRoot");
  });

  it("uses Windows path rules independently of the test host", () => {
    expect(ktcResolveAutoBuildPath("XyCore", "E:\\codeMaster")).toBe("E:\\codeMaster\\XyCore");
    expect(ktcStoreAutoBuildPath("E:\\codeMaster\\XyCore", "E:/codeMaster")).toBe("XyCore");
    expect(ktcResolveAutoBuildPath("\\\\server\\share\\XyCore", "E:/codeMaster")).toBe("\\\\server\\share\\XyCore");
    expect(ktcStoreAutoBuildPath("\\\\server\\share\\XyCore", "\\\\server\\share")).toBe("XyCore");
    expect(ktcJoinAutoBuildPath("E:/codeMaster", "XyCore", "mk.ps1")).toBe("E:\\codeMaster\\XyCore\\mk.ps1");
    expect(ktcResolveAutoBuildPath("\\XyCore", "E:\\codeMaster")).toBe("E:\\XyCore");
    expect(ktcResolveAutoBuildPath("\\XyCore", "\\\\server\\share\\codeMaster")).toBe("\\\\server\\share\\XyCore");
    expect(ktcJoinAutoBuildPath("C:\\", "mk.ps1")).toBe("C:\\mk.ps1");
    expect(ktcJoinAutoBuildPath("\\\\server\\share\\", "mk.ps1")).toBe("\\\\server\\share\\mk.ps1");
    expect(ktcResolveAutoBuildPath("\\\\?\\C:\\project\\..", "E:\\codeMaster")).toBe("\\\\?\\C:\\");
    expect(ktcResolveAutoBuildPath("\\\\?\\UNC\\server\\share\\project\\..", "E:\\codeMaster")).toBe("\\\\?\\UNC\\server\\share");
  });

  it("rejects Windows paths that depend on hidden per-drive state", () => {
    expect(() => ktcResolveAutoBuildPath("", "E:\\codeMaster")).toThrow("路径不能为空");
    expect(() => ktcResolveAutoBuildPath("C:work", "E:\\codeMaster")).toThrow("不支持盘符相对路径");
    expect(() => ktcResolveAutoBuildPath("XyCore", "E:codeMaster")).toThrow("不支持盘符相对路径");
    expect(() => ktcResolveAutoBuildPath("\\XyCore", "")).toThrow("Windows 根相对路径缺少绝对工作目录");
    expect(() => ktcJoinAutoBuildPath("C:work", "out.ps1")).toThrow("不支持依赖当前盘符的路径");
    expect(() => ktcResolveAutoBuildPath("\\\\server", "E:\\codeMaster")).toThrow("路径格式不完整");
    expect(() => ktcResolveAutoBuildPath("//server", "E:\\codeMaster")).toThrow("路径格式不完整");
    expect(() => ktcResolveAutoBuildPath("//./C:/Windows", "E:\\codeMaster")).toThrow("路径格式不完整");
    expect(() => ktcResolveAutoBuildPath("//?/GLOBALROOT/Device", "E:\\codeMaster")).toThrow("路径格式不完整");
    expect(() => ktcResolveAutoBuildPath("\\XyCore", "\\\\?\\C:\\codeMaster")).toThrow("命名空间 Windows 路径不支持根相对项目路径");
    expect(() => ktcResolveAutoBuildPath("\\XyCore", "\\\\?\\UNC\\server\\share\\codeMaster")).toThrow("命名空间 Windows 路径不支持根相对项目路径");
    expect(() => ktcResolveAutoBuildPath("XyCore", "///tmp")).toThrow("工作目录路径格式不完整");
    expect(() => ktcJoinAutoBuildPath("\\\\server", "out.ps1")).toThrow("路径格式不完整");
    expect(() => ktcResolveAutoBuildPath("\\\\?\\UNC\\server\\share\\..", "E:\\codeMaster")).toThrow("Windows 路径规范化后无效");
    expect(() => ktcJoinAutoBuildPath("\\\\?\\UNC\\server\\share\\..", "out.ps1")).toThrow("Windows 路径规范化后无效");
    expect(() => ktcResolveAutoBuildPath("XyCore", "")).toThrow("相对路径缺少绝对工作目录");
    expect(() => ktcResolveAutoBuildPath("XyCore", ".")).toThrow("工作目录必须使用绝对路径");
  });

  it("keeps POSIX paths stable", () => {
    expect(ktcResolveAutoBuildPath("XyCore", "/opt/codeMaster")).toBe("/opt/codeMaster/XyCore");
    expect(ktcStoreAutoBuildPath("/opt/codeMaster/XyCore", "/opt/codeMaster")).toBe("XyCore");
    expect(ktcStoreAutoBuildPath("/opt/XyRoot", "/opt/codeMaster")).toBe("/opt/XyRoot");
    expect(ktcJoinAutoBuildPath("/opt/codeMaster", "XyCore", "mk.ps1")).toBe("/opt/codeMaster/XyCore/mk.ps1");
    expect(ktcJoinAutoBuildPath("/", "mk.ps1")).toBe("/mk.ps1");
  });

  it("lets an explicit absolute path override a stale base dialect", () => {
    expect(ktcResolveAutoBuildPath("/Users/kathy/repo", "E:/work")).toBe("/Users/kathy/repo");
    expect(ktcStoreAutoBuildPath("/Users/kathy/repo", "E:/work")).toBe("/Users/kathy/repo");
    expect(ktcResolveAutoBuildPath("E:/repo", "/Users/kathy/work")).toBe("E:\\repo");
    expect(ktcStoreAutoBuildPath("E:/repo", "/Users/kathy/work")).toBe("E:\\repo");
    expect(ktcResolveAutoBuildPath("/Users/kathy/repo", "E:work")).toBe("/Users/kathy/repo");
    expect(ktcResolveAutoBuildPath("E:/repo", "\\stale-root-relative")).toBe("E:\\repo");
  });

  it("does not send foreign Windows targets to a non-Windows filesystem", () => {
    expect(ktcCanAccessAutoBuildPathOnHost("E:/codeMaster/out.ps1", "darwin")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("\\\\server\\share\\out.ps1", "linux")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("C:work\\out.ps1", "darwin")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("/tmp/out.ps1", "darwin")).toBe(true);
    expect(ktcCanAccessAutoBuildPathOnHost("E:/codeMaster/out.ps1", "win32")).toBe(true);
    expect(ktcCanAccessAutoBuildPathOnHost("/tmp/out.ps1", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("C:work\\out.ps1", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("\\work\\out.ps1", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("relative/out.ps1", "darwin")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("relative\\out.ps1", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("\\\\server", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("//server", "darwin")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("//?/C:/device", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("//./C:/Windows", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost("\\\\?\\UNC\\server\\share\\..", "win32")).toBe(false);
    expect(ktcCanAccessAutoBuildPathOnHost('\"E:/quoted\"', "win32")).toBe(false);
    expect(ktcIsAbsoluteAutoBuildPath("E:/codeMaster")).toBe(true);
    expect(ktcIsAbsoluteAutoBuildPath("/tmp/codeMaster")).toBe(true);
    expect(ktcIsAbsoluteAutoBuildPath("relative/codeMaster")).toBe(false);
    expect(ktcIsAbsoluteAutoBuildPath("\\\\?\\UNC\\server\\share\\..")).toBe(false);
  });

  it("identifies filesystem roots before destructive cleanup", () => {
    expect(ktcIsAutoBuildFilesystemRoot("C:\\")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\server\\share\\")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\server\\share\\dir\\..")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\?\\UNC\\server\\share\\")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\?\\UNC\\server\\share\\dir\\..")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\?\\C:\\project\\..")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("\\\\?\\UNC\\server\\share\\..")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("/")).toBe(true);
    expect(ktcIsAutoBuildFilesystemRoot("C:\\project")).toBe(false);
    expect(ktcIsAutoBuildFilesystemRoot("/tmp/project")).toBe(false);
  });

  it("creates an enabled row without silently selecting operations", () => {
    const row = ktcCreateAutoBuildProjectRow("E:/codeMaster/XyCore", "E:/codeMaster", 0);
    expect(row).toMatchObject({ enabled: true, name: "XyCore", path: "XyCore" });
    expect(Object.values(row.operations).some(Boolean)).toBe(false);
    expect(ktcCreateAutoBuildProjectRow("/opt/XyCore", "", 1).path).toBe("/opt/XyCore");
  });
});
