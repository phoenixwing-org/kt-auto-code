# KT Auto Code

面向 **CAA / MSVC C++ 与 CAD** 的小工具集合：核心在 `src/`，通过 **CLI** 或 **VS Code / Cursor 插件** 使用。本仓库同时产出基础插件 `KT Auto Code` 与依赖它的可选模块 `KT Auto CAD`，两者共用一个 Activity Bar 入口。

源码仓库：[PhoenixWing321/kt-auto-code](https://gitee.com/PhoenixWing321/kt-auto-code)。

当前插件提供 **头文件编码修正、文件转码、Ignore 设置、工作区搜索替换、C++ 成员排序、UUID 替换、CAA 对话框定位、工程环境管理与 Codegen 参数表原型**。成员排序、UUID、搜索替换、CAA 扫描和 Codegen 预检可共用 `.phoenix/worksets.json`；工程环境 Block 直接维护操作系统用户环境变量，不使用 VS Code Settings 伪装系统值；其他插件配置仍使用 VS Code Settings。写盘前会检查冲突和文件快照，结果统一显示在单 Block 中；Codegen Apply 会自动预检、重验源码指纹并保持 UTF-8/BOM/GBK 原编码，批量写入失败时尝试回滚。

## 快速开始

```bash
pnpm install

# 本地 Wing 联调：要求 ../phoenix-wing，构建并启动 Code + CAD
pnpm dev

# npm Registry 精确版本对照
pnpm dev:registry

pnpm test
pnpm extensions:typecheck
pnpm extensions:build
pnpm scan-encoding --headers --ascii tests/fixtures/multiChar   # 预检
pnpm fix-headers tests/fixtures/multiChar                         # 修复（慎用）
```

**基础插件**：`pnpm ext:watch` → 本仓库 **F5** → Host 窗口打开 CAA 工程 → Side Bar **KT Auto Code**。

开发环境使用 Node.js 22 LTS 与 pnpm 10。`pnpm dev` 是默认双插件联调入口，强制消费并列本地 Wing；Wing 构建后先用 PNXBomAnalysis 反例验证“2 条 missing-end、5 个后续区域、旧级联 0 条”，再把 Code/CAD 扩展复制到独立临时快照并启动全新 Host 窗口，后续普通 Registry 构建不会覆盖本次联调产物。旧 Development Host 不会自动关闭，必须只在带 `Auto · Wing 本地` 状态栏标识的窗口验收；悬停标识或查看 `KT Auto Code` Output 首行可核对临时 `extensionPath` 与 `wingRoot`。AI 只构建验证可用 `pnpm ext:dev:prepare`。正式 npm 包行为用 `pnpm dev:registry` 对照，详见[本地 Wing 并列开发](doc/本地Wing并列开发.md)。CAD 不创建第二个 Activity Bar 图标，Code/CAD 在工具栏 Header 独立勾选，工具按钮共用同一个 Ribbon。后续可选模块按[可选模块接入契约](doc/可选模块接入契约.md)接入。

## 文档

| 文档 | 内容 |
| --- | --- |
| [doc/README.md](doc/README.md) | 文档索引 |
| [当前路线](doc/current-roadmap.md) | 当前优先级、完成基线与 92.5 联合治理接入责任 |
| [Phoenix 三形态产品架构计划](doc/Phoenix三形态产品架构计划.md) | VS Code 双插件、Tauri/Web、共享 core 与统一发布总纲 |
| [项目调查](doc/项目调查.md) | 项目定位、实际实现、架构、当前状态与行为边界 |
| [PNXCaaStudy CAA 命名规则调查](doc/PNXCaaStudy-CAA命名规则调查.md) | I/E、TIE、dico 命名证据与完整名称/末词段两种模式 |
| [工作区验收记录](doc/真实工作区只读验收.md) | CAA、C++、Web 只读预览与一次性工作区真实写盘验收 |
| [代码规范](doc/代码规范.md) | 命名前缀、代码整理、MVC、状态与测试规则 |
| [UI 开发规则](doc/前端开发规则.md) | Ribbon、单显示多打开、Block 布局、范围、缓存、结果、Diff、主题与验收的权威规范 |
| [Codegen 快速原型](doc/Codegen快速原型.md) | Codegen 单 Block、多 JSON View、共享 Table 与 MVC 边界 |
| [Codegen 总 Controller 会话提炼点检](doc/codegen-plan/Codegen总Controller会话提炼点检表.md) | Session Controller、VS Code Host adapter 责任图与后续拆分边界 |
| [Codegen 手工验收](doc/codegen-plan/Codegen手工验收.md) | 可重置 fixture 工作区、深浅主题与冲突/取消测试步骤 |
| [搜索替换](doc/搜索替换.md) | 文本/文件名/文件夹名替换、字节精确处理与安全边界 |
| [源文件编码扫描](doc/源文件编码扫描.md) | CLI、扫描范围；**CP1252 / 全角标点映射表** |
| [编码修正](doc/编码修正.md) | 整文件编码检测与转换（`encodingFix`） |
| [开发与测试](doc/开发与测试.md) | F5、测试、选项与检查清单 |
| [本地 Wing 并列开发](doc/本地Wing并列开发.md) | `pnpm dev` 本地双插件联调、AI 构建与 Registry 对照门禁 |
| [VS Code 插件发布](doc/VS%20Code%20插件发布.md) | Marketplace 发布流程、上架检查清单与版权说明 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` / `pnpm ext:dev` | 构建并列 `../phoenix-wing`，构建并启动 Code + CAD |
| `pnpm ext:dev:prepare` | 使用本地 Wing 构建双插件并验证来源，不启动 GUI |
| `pnpm dev:registry` | 清除本地模式并用 Registry 精确版本构建、启动双插件 |
| `pnpm ext:dev:registry:prepare` | 使用 Registry 精确版本构建双插件，不启动 GUI |
| `pnpm ext:watch` | 监听编译扩展 |
| `pnpm ext:launch` | 同时加载 Code + CAD 的 Extension Host（默认 F5 配置） |
| `pnpm ext:launch:code` | 只加载 KT Auto Code 的 Extension Host |
| `pnpm ext:launch:codegen` | 构建插件、复制新 Codegen QA fixture 并启动 Extension Host |
| `pnpm ext:test:host` | 在独立配置中启动真实 VS Code，自动验收 Codegen 代表宿主流程 |
| `pnpm ext:prepare:codegen` | 只准备新的临时 Codegen QA 工作区 |
| `pnpm ext:verify:codegen -- <路径> [--checkpoint-a|--checkpoint-e]` | 验证 fixture 基线、CSV 或真实 Apply 结果 |
| `pnpm ext:report:codegen -- <路径>` | 查看或记录 A–F 手工验收进度 |
| `pnpm fix-headers` | 头文件纯 ASCII 修复 |
| `pnpm scan-file-encoding` | 整文件编码预检（GBK / BOM / UTF-16） |
| `pnpm convert-file-encoding` | 转换为 UTF-8 |
| `pnpm scan-encoding --headers --ascii` | 头文件预检（含 GBK / BOM） |

## 仓库结构

```text
src/           # 核心（无 vscode 依赖）
extension/     # VS Code 插件壳
extensions/kt-auto-cad/ # 可选 CAD VS Code 插件壳
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
