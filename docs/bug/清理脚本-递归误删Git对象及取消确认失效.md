# 清理脚本递归误删 Git 对象，取消确认未保护子内容

> **严重数据损失事件。记录日期：2026-09-12。**
>
> 保护修复已通过临时目录回归；实际仓库对象尚未恢复。

## 用户反馈与只读检查

用户在清理 `XyRoot` 时看到 `.git/lfs/objects` 的递归删除确认，输入 `N` 后，日志仍将 `.git/lfs/objects` 和 `.git/objects` 列为已删除，并发现 Git 损坏。

只读检查发现 `.git/objects` 已不存在；HEAD、refs、index、reflog 等元数据仍在，LFS 对象目录有部分残留。尚未确认哪些已提交对象或 LFS 内容可从远程、其他克隆或备份恢复。

## 原因

- `delete.directories` 默认递归后，`Objects` 在 Windows 的不区分大小写匹配下命中 `.git/objects` 和 `.git/lfs/objects`，未保护 Git 元数据。
- 删除函数先递归删除子内容，最后执行 `Remove-Item` 删除父目录；父目录阶段可能弹出非空目录确认，输入 `N` 无法撤销前面已完成的删除。
- 调用方未核实删除结果就追加“已删除”，造成取消后的错误统计。
- 前次临时目录测试未覆盖 Git 元数据与实际取消输入，不能证明该递归清理实现可安全用于真实仓库。

## 修复

- 搜索阶段跳过版本控制元数据，实际链接目标也进行保护检查。
- 对待删目录进行整树检查，内部包含仓库时，在任何子内容删除前拒绝该候选项。
- 在 `ShouldProcess` 确认后才执行删除；收尾以非递归方式删除空目录，非空时失败，不在删除子内容后追加递归确认。
- 删除后核实结果，取消记为跳过，失败不计为成功。

## 回归

测试脚本统一位于 `scripts/tests/`，与 `scripts/auto-build/` 中的运行脚本分开。

- `Test-CleanupGitProtection.ps1`：隐藏 Git 对象、LFS、嵌套仓库、bare 元数据、元数据别名及包含 Git 文件的待删父目录。
- `Test-CleanupConfirmation.ps1`：实际输入 `N`，验证子文件完整保留且统计为跳过。
- `Test-CleanupRecursion.ps1`：普通递归、关闭递归、预览、联接目标、去重及循环。

以上均在 Windows PowerShell 5.1 的临时目录验证，不在受损 Root 上试运行清理。脚本修复不等于数据恢复；恢复前保留原工作文件、索引、引用与 reflog，不运行 gc、prune 或重新初始化覆盖现场。
