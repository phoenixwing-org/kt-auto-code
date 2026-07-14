# Changelog

所有显著变更会记录在本文件中。

## 0.2.0

- C++ 成员排序改为消费 `phoenix-wing/code-core`，支持头文件与实现文件的扫描、选择、确认写盘、会话级还原和按需 Git 差异预览。
- 成员排序、搜索替换、头文件 ASCII 修正和 Ignore 结果 View 改为全宽、紧凑表格布局；头文件 ASCII 结果 View 可直接重新预检或修复。
- 保持 UTF-8、UTF-8 BOM、GBK 文件编码；写盘前检查预检快照，避免覆盖外部改动。
- 市场图标、Apache-2.0 许可、权利人与发布元数据统一。

## 0.1.1

- 新增 Visual Studio Marketplace 专用 PNG 图标。

## 0.1.0

- 首个公开版本。
- 提供头文件 ASCII 修正、文件编码修正、Ignore 设置和工作区搜索替换。
- 搜索替换支持关联规则、冲突预览和 UTF-8 / GBK 编码保护。
- 加入 C++ 成员排序扫描入口（POC）。
