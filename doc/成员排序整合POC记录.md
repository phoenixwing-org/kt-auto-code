# C++ 成员排序跨产品整合记录（已归档）

> 2026-07：POC 已完成并进入可用实现。算法唯一规范：[phoenix-wing · C++成员排序算法规范](../../phoenix-wing/doc/C++成员排序算法规范.md)。本文件只保留 KT Auto Code 的接入结论。

## 当前接入

- `extension/src/tools/reorderMembers/` 只负责 VS Code Host 适配：工作区扫描、UTF-8/UTF-8 BOM/GBK 字节读写、写前指纹检查和会话级还原。
- 排序只调用 `phoenix-wing/code-core` 的 `pnwReorderCppText` 与 `pnwReorderHeaderText`；不复制 DeskTools 或 Python 算法。
- 结果位于 VS Code 底部 Panel 的原生“成员排序”视图：默认只显示有变更文件，用户勾选后确认写盘；工具栏可按需显示无变更文件。
- 写盘后仅更新缓存表格状态；Git 差异由用户按需点击已写盘行打开，不批量弹出 Diff，也不创建 `untitled` 文档。
- ↶ 还原恢复本次排序前的原始字节；若写盘后文件被外部修改，则拒绝覆盖。

## 文档边界

| 内容 | 位置 |
| --- | --- |
| 排序语义、锁定规则、回归契约 | `phoenix-wing/doc/C++成员排序算法规范.md` |
| Web/CLI、工作集、历史 Python 入口 | `phoenix-desk-tools/doc/code/成员函数排序-reorder_members.md` |
| VS Code 操作和插件发布验收 | 本仓库的 `doc/` 与 `extension/` |

新规则必须先改 Wing core、fixture 与规范；产品库只补适配/界面说明，避免三处维护同一算法。
