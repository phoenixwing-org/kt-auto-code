# KT Auto Code

面向 **CAA / MSVC C++** 工作流的 VS Code 扩展，提供编码治理、Ignore 配置与安全的工作区搜索替换。

## 功能

- **头文件 ASCII 修正**：检查并修正弯引号、全角标点等不适合头文件的字符。
- **文件编码修正**：检测 UTF-8、BOM、GBK 等编码并按需转换。
- **Ignore 设置**：维护工作区 `.phoenix/.ignore`，可使用 CAA / C++ / Web 预设。
- **工作区搜索替换**：预览文本、文件名与文件夹名的替换结果；支持关联规则、冲突检查和 UTF-8 / GBK 编码保护。
- **C++ 成员排序**：扫描、预览差异、勾选或逐文件应用成员排序，并可通过 Git Diff 审核写盘结果。
- **UUID 替换**：按相同旧 UUID 生成稳定映射，支持按文件勾选或逐行替换、Git Diff 审核与取消候选。
- **CAA 对话框**：扫描 `.CATDlg` 文件，在已配置的外部编辑器中按文件打开。

## 使用

1. 在 VS Code 左侧活动栏打开 **KT Auto Code**。
2. 选择工具并先执行“预检”或“预览”；文件类结果会显示在主工具面板下方，可自行展开或收起。
3. 确认结果后再执行会写入文件的操作；建议先提交 Git。

搜索替换、头文件 ASCII 修正和编码修正会在主侧栏下方显示紧凑文件结果 View。对于原文件为 ASCII、替换目标含中文等非 ASCII 字符的情况，可在界面选择默认 UTF-8 或 GBK 编码。

## 要求

- VS Code `1.85.0` 或更高版本。
- 建议在 Git 工作区使用，以便审核和回退修改。

## 文档与反馈

- 源码与文档：[PhoenixWing321/kt-auto-code](https://gitee.com/PhoenixWing321/kt-auto-code)
- 问题反馈：[Issues](https://gitee.com/PhoenixWing321/kt-auto-code/issues)
- 发布说明：[CHANGELOG.md](CHANGELOG.md)

## 版权与许可证

Copyright © 2024–2026 上海锟钛。

本扩展使用 [Apache License 2.0](LICENSE) 开源。名称替换与关联替换算法源自上海锟钛于 2024 年开发的 Windows 应用程序，并针对 VS Code 插件场景重新设计和实现。

软件著作权登记号：`2024SR1374380`。
