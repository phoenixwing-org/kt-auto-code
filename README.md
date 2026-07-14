# KT Auto Code

面向 **CAA / MSVC C++** 的小工具集合：核心在 `src/`，通过 **CLI** 或 **VS Code / Cursor 插件** 使用。

源码仓库：[PhoenixWing321/kt-auto-code](https://gitee.com/PhoenixWing321/kt-auto-code)。

当前插件提供 **头文件编码修正、文件转码、Ignore 设置、工作区搜索替换**。Ignore 支持 CAA/C++/Web 受管预设、工作区规则扩展和按证据分析推荐，确认后只修改未保存的文本缓冲区，其他工具会立即共用该草稿；搜索替换支持有序关联规则、动态拆词、源/目标双前缀、CAA I/E、全大写派生、可选本地工作目录、分层最近目录和显式保存的工作区规则档案。写盘前会检查已存在目标和多源同目标冲突，详细结果在当前编辑分栏的 View 中展示。

## 快速开始

```bash
pnpm install && pnpm -C extension install

pnpm test
pnpm scan-encoding --headers --ascii tests/fixtures/multiChar   # 预检
pnpm fix-headers tests/fixtures/multiChar                         # 修复（慎用）
```

**插件**：`pnpm ext:watch` → 本仓库 **F5** → Host 窗口打开 CAA 工程 → Side Bar **KT Auto Code**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [doc/README.md](doc/README.md) | 文档索引 |
| [下一阶段实施计划](doc/下一阶段实施计划.md) | **近期 TODO**：Extension Host 确认流程与浅色/深色/高对比主题验收 |
| [Phoenix 三形态产品架构计划](doc/Phoenix三形态产品架构计划.md) | VS Code 双插件、Tauri/Web、共享 core 与统一发布总纲 |
| [项目调查](doc/项目调查.md) | 项目定位、实际实现、架构、当前状态与行为边界 |
| [PNXCaaStudy CAA 命名规则调查](doc/PNXCaaStudy-CAA命名规则调查.md) | I/E、TIE、dico 命名证据与完整名称/末词段两种模式 |
| [工作区验收记录](doc/真实工作区只读验收.md) | CAA、C++、Web 只读预览与一次性工作区真实写盘验收 |
| [代码规范](doc/代码规范.md) | 命名前缀、代码整理、MVC、状态与测试规则 |
| [前端开发规则](doc/前端开发规则.md) | Vue 3、双视图、状态边界和前端体积约束 |
| [Side Bar 界面改进计划](doc/侧边栏界面改进计划.md) | 四个工具、SVG 图标、共享 Ignore Service 和 MVC 分层 |
| [搜索替换](doc/搜索替换.md) | 文本/文件名/文件夹名替换、字节精确处理与安全边界 |
| [源文件编码扫描](doc/源文件编码扫描.md) | CLI、扫描范围；**CP1252 / 全角标点映射表** |
| [编码修正](doc/编码修正.md) | 整文件编码检测与转换（`encodingFix`） |
| [vscode插件规划](doc/vscode插件规划.md) | 插件架构、多工具扩展 |
| [开发与测试](doc/开发与测试.md) | F5、测试、选项与检查清单 |
| [VS Code 插件发布](doc/VS%20Code%20插件发布.md) | Marketplace 发布流程、上架检查清单与版权说明 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm ext:watch` | 监听编译扩展 |
| `pnpm ext:launch` | 启动 Extension Host（同 F5） |
| `pnpm fix-headers` | 头文件纯 ASCII 修复 |
| `pnpm scan-file-encoding` | 整文件编码预检（GBK / BOM / UTF-16） |
| `pnpm convert-file-encoding` | 转换为 UTF-8 |
| `pnpm scan-encoding --headers --ascii` | 头文件预检（含 GBK / BOM） |

## 仓库结构

```text
src/           # 核心（无 vscode 依赖）
extension/     # VS Code 插件壳
scripts/       # CLI
tests/fixtures/
doc/           # 中文文档
```

## 版权、技术来源与许可证

KT Auto Code 由上海锟钛开发，面向 CAA / MSVC C++ 工作流提供编码治理、Ignore 配置和工作区搜索替换能力。

名称替换与关联替换算法源自上海锟钛于 2024 年开发的 Windows 应用程序（采用 C++、Qt 与 .NET 技术），并针对 VS Code 插件场景进行了重新设计和实现。

- 软件著作权登记号：`2024SR1374380`
- Copyright © 2024–2026 上海锟钛。
- 本项目使用 [Apache License 2.0](LICENSE) 开源。

完整的中英文版权声明及 Marketplace 发布信息见 [VS Code 插件发布文档](doc/VS%20Code%20插件发布.md)。
