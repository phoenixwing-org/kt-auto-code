# Changelog

所有显著变更会记录在本文件中。

## 0.5.0

- 初步完成旧 Qt/VB Codegen 自动代码能力迁移：首次进入自动发现工作区内根目录及嵌套 Codegen JSON，但不自动打开编辑器；旧 CSV 可在验证成功后单向转换为 JSON，冲突时保留两边。
- 一份 JSON 对应当前编辑区一个 Codegen View；左侧 Block 跟随活动 View 显示 Prefix、Middle、Namespace 与 Append 属性，JSON 和工作区控制符候选均提供可收缩、有限高度的滚动列表。
- 新增可复用的 `KtCodegenTable` Web Component 与 `KtCodegenTableCore`，采用整表数据输入/输出、文档级 dirty/checkpoint 和批量操作，避免每个单元格修改都与扩展宿主交互。
- Codegen JSON 保存保持既有根字段和 `headers` 顺序，统一使用 4 空格；支持还原、外部文件变更/删除检测以及保存时指纹复验，避免静默覆盖磁盘修改。
- 恢复 32 项 Kevin 控制符目录、选择预设、单选模式、候选扫描、可取消预检、命中/问题/Artifact 预览和源码定位；控制符与预检固定内嵌在当前 JSON View，并支持横向和纵向滚动。
- 真实 Apply 复用 `@phoenix-wing/kt-codegen` 0.4.0 的 Marker、生成、区域投影与通用事务算法，保持 UTF-8/BOM/GBK 和原换行；写入前复读源码，批量失败时安全回滚。
- Apply 的 Output 按 Target、Marker、文件和区域输出稳定身份；warning/error 同步进入 Problems。成功事务额外生成不含源码正文的 Apply Receipt，可按前后 sha256 和区域身份复核实际写入。
- 增加可重复 JSON/CSV/源码 fixture、A–F 手工验收清单及自动 verifier；当前用户已确认 A–D、JSON 保存与 Apply 核心路径，主题和完整预检交互继续保留为后续回归项。

## 0.4.0

- Code 纯算法改为直接消费 `@phoenix-wing/code-core` 小包，不再通过带 Vue/Element 依赖的聚合包。
- Code/CAD 模块切换迁入原生 View Header；共享 Ribbon 根据当前模块渲染 manifest 数据定义的工具，不再增加独立 CAD 工具块或 Activity Bar 按钮。
- CAD 文件名分析、工作区 FCStd 检索、基础界面和已有 Schema v13 数据库只读查询无需 Desk Tools；只有 FCStd 原生读取在执行时检查 provider。
- 主侧栏保留最小高度 Ribbon；点击模块只在其正下方展开原工具界面 Block，不再立即扫描或预览。
- Ribbon 支持“单显示、多打开”状态：当前 Block 强高亮，后台已打开 Block 使用次级颜色；关闭当前项按最近使用顺序恢复上一个。
- 新增单 Block 双样板：编码修正用于验证多控件操作区，C++ 成员排序将扫描、状态、筛选、勾选和文件结果合并在同一 Block，不再自动打开第二个原生结果 View。
- 成员排序的会话缓存保留用户选择及执行后状态；支持单文件/批量应用、预览 Diff、按需 Git Diff、安全还原、取消候选和加入工作集，写盘后不会自动逐个弹出 Diff。
- Header 成员排序兼容 KtAlarmClock 的 clang-format 基线：普通成员及最终 `// clang-format on` 与 `};` 之间不留空行；不同注释段之间的原始空行（包括 `//END ...` 与 `// clang-format on` 之间）保持不变。
- Ribbon 下方默认采用排他展开：最近使用的模块获得主要高度，关闭或切换模块时保留缓存；可在设置中改为多开。
- 搜索替换恢复完整规则界面 Block，覆盖搜索词、替换词、文件层级、工作目录、Ignore、编码、关联规则、档案和预览/写盘选择；旧连续 QuickPick 命令改为直接打开此 Block。
- 搜索替换与头文件 ASCII 结果增加 VS Code 风格命中高亮：文件名中的匹配片段在 Block 结果行标记，右侧编辑器以醒目的查找黄色背景和概览尺标记显示全部命中。
- 头文件、编码、Ignore、搜索替换、成员排序、UUID 与 CAA 全部完成单 Block 迁移；清理六个旧结果 TreeView 及其标题/行菜单，命令面板执行也会先打开对应 Block。
- 新增独立“工程环境”Block：四个工程环境变量不再占用 VS Code Settings；Windows 刷新直接读取用户/机器注册表，并可编辑当前用户变量、选择目录或文件、清除和打开系统环境变量界面。
- Ignore 推荐迁入原生 Block，支持按规则组查看、勾选和追加，并保留需确认组的二次确认；不再打开独立推荐页面。
- 删除未调用的 ASCII、搜索替换和 Ignore Webview 面板及其消息协议；文件预览与 Diff 继续交给 VS Code 原生编辑器和 Git。
- 新增 `.phoenix/worksets.json` 原生入口；ASCII、编码、成员排序、UUID、搜索替换和 CAA 对话框在各自 Block 顶部按模块记忆工作区/工作集范围，不再在扫描时弹范围 QuickPick；结果仍可加入已有工作集。
- UUID 扫描新增“同值同替换”与“每处独立新值”策略，默认保持前者，并在结果 Block 标明当前策略。
- Ignore 分析复用 Desk Tools 的顶层构建/缓存目录启发式，只生成可审核建议，不自动写盘，Git 已跟踪文件继续阻断。

## 0.3.0

- 新增 UUID 替换与 CAA 对话框文件结果 View；成员排序、UUID、CAA 均采用主侧栏下方的 Git 风格文件列表。
- 结果 View 不再互相替换：已扫描的结果会同时保留，支持由 VS Code 记住各 View 的展开或收起状态。
- 成员排序与 UUID 支持全选复选框、按文件逐行应用、预览或 Git Diff，以及不写盘的 × 取消候选操作。
- 三项文件扫描统一遵守 `.phoenix/.ignore`；`.phoenix/` 为内建默认排除目录。
- 设置入口集中到主侧栏标题工具栏，覆盖全局工程环境与 CAA 外部编辑器配置。
- 头文件 ASCII 修正、编码修正和搜索替换的结果统一迁移为主侧栏下方的紧凑文件块；批量修复、转换和替换仍保留原有的预检与确认保护。

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
