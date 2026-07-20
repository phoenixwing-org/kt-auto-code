# KT Auto Code

面向 **CAA / MSVC C++** 工作流的 VS Code 扩展，提供编码治理、Ignore 配置与安全的工作区搜索替换。

## 功能

- **头文件 ASCII 修正**：检查并修正弯引号、全角标点等不适合头文件的字符。
- **文件编码修正**：检测 UTF-8、BOM、GBK 等编码；项目可配置默认目标及头文件、源文件、Markdown 覆盖，转换只在内容可无损表示时执行。
- **Ignore 设置**：维护工作区 `.phoenix/.ignore`，可使用 CAA / C++ / Web 预设，并分析顶层构建/缓存目录。
- **工作区搜索替换**：预览文本、文件名与文件夹名的替换结果；支持关联规则、冲突检查和 UTF-8 / GBK 编码保护。
- **C++ 成员排序**：扫描、预览差异、勾选或逐文件应用成员排序，并可通过 Git Diff 审核写盘结果。
- **UUID 替换**：支持“同值同替换”或“每处独立新值”，并提供按文件勾选、Git Diff 审核与取消候选。
- **CAA UI**：扫描 `.CATDlg` 文件，自动发现本机 Desk Tools 服务并打开图形编辑器，也可配置自定义外部 EXE。
- **工作集**：使用 `.phoenix/worksets.json` 为成员排序、UUID、搜索替换和 CAA 扫描定义可复现范围。
- **工程环境**：在独立 Block 中读取和维护 `ROOT_DIR`、`ROOT_DIR_3rdParty`、`ROOT_DIR_CORE` 与可选的 `CAA_MK_VERSION`；不把操作系统环境变量伪装成 VS Code 插件设置。
- **Codegen 自动代码**：自动发现 Codegen JSON/旧 CSV，一份 JSON 对应一个参数表 View；支持属性与整表编辑、保序保存、工作区控制符候选、32 项 Kevin 控制符预检、源码定位和真实 Apply。single/batch 报告持久写入 `.phoenix/reports/codegen/`，可从 Primary 重开并按健康度、源码变化和 JSON 筛选。

## 使用

1. 在 VS Code 左侧活动栏打开 **KT Auto Code**。
2. 点击 Ribbon 工具后，原操作界面会在 Ribbon 正下方展开；头文件、编码、Ignore、搜索替换、成员排序、UUID、CAA 与工程环境都使用单 Block，不再注册第二套结果 TreeView。
3. 确认结果后再执行会写入文件的操作；建议先提交 Git。

默认使用排他展开模式：Ribbon 保持最小高度，最近使用的模块获得主要空间，关闭或切换后缓存仍保留。可在设置中将 `Kt Auto Code › Sidebar › Block Expansion Mode` 改为 `multiple`。

Desk Tools 本地 API 首选 `48375`，占用时由 Desk Tools 自动选择后续端口并注册；CAA UI 会读取注册并校验服务，不需要用户填写动态端口。高级覆盖、自定义 EXE 与 Auto CAD 深度读取器路径统一位于 `Kt Auto Code › Desk Tools` 设置。

0.5.2 完善 Codegen 应用报告与项目编码策略：报告可以持久化、重开、筛选并安全导航，批量处理不再制造 JSON View；编码目标可以按工作区和文件类别配置为 ASCII、UTF-8 或 GBK，并坚持无损转换。本补丁不新增公共命令或扩展 API。

0.4.0 已把单 Block 工作流推广到其他模块。对于原文件为 ASCII、替换目标含中文等非 ASCII 字符的情况，可在搜索替换界面选择默认 UTF-8 或 GBK 编码。

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
