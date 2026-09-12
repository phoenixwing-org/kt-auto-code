# 清理脚本未清理 Junction 目标中的 Objects

> **状态：已修复，临时目录回归及用户实际工程验证通过。**
>
> 记录日期：2026-09-12。

## 问题现象

用户反馈：运行 `CAAB20MkWsp/cleanup.ps1` 后，link（Junction，目录联接）目标中的 `Objects` 未被清理。

## 已有排查线索

根据用户提供的前次排查记录：

- `Objects` 位于 Junction 指向的源目录中。
- 清理配置本身已包含 `Objects`。
- 实际清理由 `Functions-Cleanup.ps1` 实现。
- 前次排查环境未找到该文件，因此尚未检查或修改实际遍历逻辑。

上述“未找到文件”仅是前次排查环境的情况，不是当前定位的阻塞条件。用户已确认清理脚本由本项目维护，再将共享实现拷贝到 Root 下。

本项目已定位到以下源文件和部署约定：

- 共享实现：`scripts/auto-build/Functions-Cleanup.ps1` → `ROOT/tools/Functions-Cleanup.ps1`。
- 示例入口：`scripts/sample/cleanup.ps1` → `ROOT/sample/cleanup.ps1`。
- 示例配置：`scripts/sample/cleanup.yaml`，随入口部署到 `ROOT/sample`。
- 入口已简写为直接加载 `$env:ROOT_DIR/tools/Functions-Cleanup.ps1`，使用入口目录及其 `cleanup.yaml` 调用 `Invoke-Cleanup`。

源码原来只匹配直接子项，后续普通目录递归也跳过了目录链接，因此无法搜索链接目标中的 `Objects`。本次在项目维护的共享实现中增加链接目标解析及递归遍历。

## 已实现规则

- `unlinkDirectories` 只处理当前层，始终不递归。
- `delete` 的目录和文件规则默认递归，由 `[bool]$Recurse = $true` 控制；可传 `-Recurse:$false` 仅匹配当前层。
- 递归搜索进入 Junction 和目录符号链接的实际目标，允许清理目标中的匹配内容；遍历本身保留链接及未匹配内容。
- 实际目录路径去重，避免循环和重复扫描；删除前检查候选目录仍位于已解析的父目录下。
- 链接自身名称直接命中删除目录规则时，维持只删除链接本身的行为。文件链接不跟随、不删除。
- 先取消链接、再清理；已被 `unlinkDirectories` 移除的入口不会再进入其目标。

## 排查步骤留档

1. 从本项目的 `scripts/auto-build/Functions-Cleanup.ps1` 和 `scripts/sample/cleanup.ps1` 检查实现与加载逻辑，再核对 Root 中部署的副本是否一致；需要复现现场时再确认 `$env:ROOT_DIR` 和实际加载路径。
2. 核对 Junction 的入口、解析后的目标目录和 `Objects` 的实际位置。
3. 检查清理逻辑是否跳过目录联接、仅遍历入口目录，或因路径及权限问题未执行清理。
4. 明确允许清理的目标范围；处理联接前校验解析后的绝对路径，避免越界删除，并防止循环联接或重复遍历。

## 预期表现

对于明确属于清理范围的 Junction 目标，脚本能够清理配置指定的 `Objects`，保留 Junction 本身及不属于清理范围的内容。无法访问、目标越界或清理失败时，应明确报告原因。

## 验收清单

- [x] 普通目录中的 `Objects` 能正常清理。
- [x] Junction 目标中的 `Objects` 和匹配文件能正常清理。
- [x] 用于遍历的 Junction 和目标目录中未匹配内容保持不变。
- [x] 重复联接目标只枚举一次；指回上层的循环联接不会无限遍历。
- [x] `-WhatIf` 不删除普通目录、联接目标内容或链接。
- [x] `-Recurse:$false` 不进入子目录及目录链接。
- [x] 用户确认 CAA 实际工程清理通过。
- [x] 用户确认 link 目标中的 `Objects` 清理通过。
- [x] 用户确认文件清理通过。

## 用户实测结果

2026-09-12，用户依次确认 `Sync-RootScripts.ps1` 测试通过、CAA 清理通过、link 目标中的 `Objects` 清理通过，以及文件清理通过。

本次确认覆盖同步和清理功能；Git 数据恢复由用户自行处理，不据此认定恢复完成。`.git` 无条件跳过仍是不可关闭的硬规则，相关事件和保护回归见《清理脚本-递归误删Git对象及取消确认失效》。

回归脚本：`scripts/tests/Test-CleanupRecursion.ps1`。只在临时测试目录执行删除，不自动清理用户的实际 Root。
