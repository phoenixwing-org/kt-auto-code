# C++ 成员排序跨产品整合记录（已归档）

> 2026-07：POC 已完成并进入可用实现。算法唯一规范：[phoenix-wing · C++成员排序算法规范](../../phoenix-wing/docs/C++成员排序算法规范.md)，项目格式基线解读见 [phoenix-wing · C++ clang-format 规则说明](../../phoenix-wing/docs/C++%20clang-format规则说明.md)。本文件只保留 KT Auto Code 的接入结论。

## 当前接入

- `src/tools/reorderMembers/` 只负责 VS Code Host 适配：工作区扫描、UTF-8/UTF-8 BOM/GBK 字节读写、写前指纹检查和会话级还原。
- 排序只调用 `phoenix-wing/code-core` 的 `pnwReorderCppText` 与 `pnwReorderHeaderText`；不复制 DeskTools 或 Python 算法。
- Header 排序主要兼容 KtAlarmClock 的自定义 `.clang-format`：普通成员及最终 `// clang-format on` 与 `};` 之间不留空行；Wizard 位于类尾时保留 `//END ...` 与 `// clang-format on` 之间原有的语义空行。一般情况下，排序也不得删除两个独立注释段之间的原始空行。
- 结果位于 VS Code 底部 Panel 的原生“成员排序”视图：默认只显示有变更文件，用户勾选后确认写盘；工具栏可按需显示无变更文件。
- 写盘后仅更新缓存表格状态；Git 差异由用户按需点击已写盘行打开，不批量弹出 Diff，也不创建 `untitled` 文档。
- ↶ 还原恢复本次排序前的原始字节；若写盘后文件被外部修改，则拒绝覆盖。

## 文档边界

| 内容 | 位置 |
| --- | --- |
| 排序语义、锁定规则、回归契约 | `phoenix-wing/docs/C++成员排序算法规范.md` |
| KtAlarmClock clang-format 基线与排序相关规则 | `phoenix-wing/docs/C++ clang-format规则说明.md` |
| Web/CLI、工作集、历史 Python 入口 | `phoenix-desk-tools/docs/code/成员函数排序-reorder_members.md` |
| VS Code 操作和插件发布验收 | 本仓库根 manifest、`src/` 与 `docs/` |

新规则必须先改 Wing core、fixture 与规范；产品库只补适配/界面说明，避免三处维护同一算法。
