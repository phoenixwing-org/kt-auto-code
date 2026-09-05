import { describe, expect, it } from "vitest";
import {
  ktcRenamePathSegmentProblem,
  ktcRenamePathsReferToSameEntry,
} from "./renamePathSegment.js";

describe("rename path safety", () => {
  it.each([
    ["空名称", ""],
    ["当前目录", "."],
    ["父目录", ".."],
    ["Windows 保留字符", "new:name"],
    ["路径分隔符", "new/nested"],
    ["控制字符", "new\u0001name"],
    ["尾点", "new."],
    ["尾空格", "new "],
    ["Windows 保留设备名", "CON"],
    ["带扩展名且忽略大小写的保留设备名", "prn.txt"],
    ["保留设备名与扩展之间的空格", "CON .txt"],
    ["串口设备名与扩展之间的空格", "COM1 .log"],
    ["数字串口设备名", "COM9.log"],
    ["数字打印设备名", "lpt1"],
    ["上标串口设备名一", "COM¹"],
    ["上标串口设备名二及扩展名", "com².txt"],
    ["上标串口设备名三", "COM³"],
    ["上标打印设备名一", "LPT¹"],
    ["上标打印设备名二及扩展名", "lpt².log"],
    ["上标打印设备名与扩展之间的空格", "LPT² .cpp"],
    ["上标打印设备名三", "LPT³"],
    ["超长 ASCII 组件", "n".repeat(256)],
    ["超长 UTF-8 组件", "中".repeat(86)],
  ])("拒绝跨平台非法路径组件：%s", (_label, value) => {
    expect(ktcRenamePathSegmentProblem(value)).toBeDefined();
  });

  it.each([
    ["普通名称", "NewModule.cpp"],
    ["点文件", ".env"],
    ["保留名前缀的普通名称", "CONSOLE"],
    ["串口设备名下邻界", "COM0"],
    ["串口设备名上邻界", "COM10"],
    ["打印设备名下邻界", "LPT0"],
    ["打印设备名上邻界", "LPT10"],
    ["255 字节 ASCII 组件", "n".repeat(255)],
    ["255 字节 UTF-8 组件", "中".repeat(85)],
  ])("保留合法路径组件邻界：%s", (_label, value) => {
    expect(ktcRenamePathSegmentProblem(value)).toBeUndefined();
  });

  it("不把大小写不同的硬链接目录项当成同一路径别名", () => {
    const sharedInode = { dev: 1, ino: 42 };
    expect(ktcRenamePathsReferToSameEntry(
      "/repo/Old.cpp",
      "/repo/old.cpp",
      sharedInode,
      sharedInode,
    )).toBe(false);
    expect(ktcRenamePathsReferToSameEntry(
      "/repo/Old.cpp",
      "/repo/Old.cpp",
      sharedInode,
      sharedInode,
    )).toBe(true);
  });
});
