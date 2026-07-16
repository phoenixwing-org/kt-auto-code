# CAD 插件：Desk Tools 功能克隆与界面规划

> 本文盘点 `phoenix-desk-tools` 的 CAD 页面，并规划在 `kt-auto-cad` 中继续完善的功能和界面。目标是复用已经验证的业务流程，不复制 Desk Tools 的 Vue/Element Plus 页面，也不增加 Activity Bar 按钮。

## 1. 结论

1. 保留当前唯一的 KT Auto Code Activity Bar、Code/CAD 复选标签、Ribbon 模块分组和共享 Block 容器。
2. 不把 Desk Tools 的每个页面都变成 Ribbon 按钮。现有六个 CAD 入口继续承担“当前上下文、快速动作和状态摘要”，复杂功能从 Block 内打开编辑区页面。
3. 第一批继续做不依赖 Desk Tools 的功能：TS 读取 FCStd、工作区索引、SQLite 只读查询、BOM/引用浏览、零件目录和只读文件详情。
4. 写回类能力必须先生成计划，再预览、确认、校验文件指纹、原子写盘和复读验证。是否由 TS 写盘或 Desk native 执行，按能力和真实样本验证决定，不能把整个 CAD 模块提前绑定到 Desk Tools。
5. STEP/FreeCADCmd 与 SolidWorks COM 仍由 Desk Tools 提供运行时。VS Code 只做启动、参数传递、进度和结果入口。
6. CAD 领域模型、文件名/XLink/BOM 算法和可序列化契约继续保持宿主无关；VS Code API、SQLite 驱动、Webview 和 Desk provider 只属于 adapter/presentation 层。

本文的 Code/CAD 同时显示规则，以已经人工验收的复选标签和 Ribbon 竖向模块分组为准；它替代旧计划中“Code/CAD 互斥切换”的描述。

## 2. 三种界面承载方式

### 2.1 左侧 Block

Block 适合当前文件或当前工作区的简短结果，通常在一屏内完成：

- 当前 FCStd 文件名和文档类型摘要。
- 当前文件对象数、BOM 数、XLink 数和诊断数。
- 索引状态、最近扫描结果、快速搜索和最近命中。
- 当前文件入向/出向引用计数与少量问题项。
- Desk provider、数据库和能力诊断。
- “打开完整页面”“重新扫描”“轻量读取”等快捷动作。

Block 继续消费 Shell 的统一标题、关闭、打开历史和当前态样式。CAD 只提供 `toolId + ViewModel + action`，不自行实现 Block 外壳。

### 2.2 编辑区页面

以下交互不适合塞进窄侧栏，应在 VS Code 编辑区打开 WebviewPanel：

- 大表格、分页、排序、分组、树形装配结构。
- 一个文件一个标签页的详情和编辑。
- 多步骤分析、逐项选择、Diff、确认和写回。
- 扫描任务历史、长日志和导出。

编辑区页面不是新的 Activity Bar View；它与普通编辑器标签并列。相同资源复用已有标签，不重复打开。页面标题、dirty 状态和关闭确认由统一的 CAD workbench adapter 管理。

首期不注册 FCStd 默认自定义编辑器，避免改变用户双击二进制文件的既有行为。先通过“在 CAD 文件详情中打开”命令显式打开；使用稳定后再评估 `CustomReadonlyEditorProvider` 和“Reopen Editor With”。

### 2.3 Desk Companion

必须调用外部 CAD 程序、Windows COM 或长时间原生批处理的流程留在 Desk Tools。Block 中只显示依赖、连接状态和“在 Desk Tools 执行”，必要时在编辑区提供任务进度页。

## 3. Desk Tools 功能映射

| Desk Tools 功能 | VS Code 当前原型 | 建议界面 | 默认依赖 | 决策 |
| --- | --- | --- | --- | --- |
| CAD 索引 | `cadScan` 已能扫描 FCStd、TS 入库和搜索 | Block 显示状态；编辑区“CAD 索引”展示完整表格 | VS Code FS + TS + SQLite | 优先完善；补增量扫描、过滤、缺失清理、任务进度和导出 |
| BOM 列表 | `cadQuery` 已有当前文件基础查询 | Block 显示摘要；编辑区“BOM 与引用”显示装配目录、全量引用和树 | SQLite；无库时可对当前文件 TS 即时分析 | 优先完善；先只读 |
| 文件详情 | `cadFilename`、`cadRead` 覆盖少量概览 | 一个 FCStd 一个编辑区标签，含概览/属性/引用/装配/改名子页 | TS 读取；深度语义可选 provider | 优先建立只读页面，写回后置 |
| 零件目录 | 无专门原型 | 编辑区单例目录页；Block 只保留当前 PartKey 快捷入口 | SQLite | 第二批；复用索引数据，不另建扫描器 |
| 零件详情 | 文件名中能识别 PartKey，但无页面 | 一个 PartKey 一个编辑区标签 | SQLite | 第二批；关联模型、图纸、装配和文档 |
| 改名分析 | 无 CAD 原型；Code 改名不可混用 | 文件详情“改名”子页；全局历史可独立页面 | TS/SQLite；写回阶段可选 native | 先分析和影响预览，最后开放写盘 |
| XLink 路径修正 | `cadRead` 有 missing/ambiguous 等诊断 | 当前文件操作进文件详情；全局修复进维护页面 | TS 分析 + SQLite；写回引擎按验证结果选择 | 先只读诊断和候选选择，再做计划式写回 |
| 编号查重 | 无原型 | Block 显示当前 PartKey 冲突；完整结果进维护页面 | SQLite/文件名解析 | 第二批，只读和 CSV 导出风险低 |
| STEP 批量转换 | 无原型 | Block 启动；任务详情可进编辑区 | Desk Tools + FreeCADCmd | 不克隆执行器，只做 handoff/进度 |
| SW→STEP | 无原型 | Block 启动；任务详情可进编辑区 | Windows Desk Tools + SolidWorks COM | 不克隆执行器 |

## 4. 当前原型缺口

当前六个 CAD Ribbon/Block 原型为：文件名、检索、读取、BOM 引用、连接、诊断。它们已经证明模块注入、Block 打开/隐藏、历史恢复和无 Desk Tools 降级能够工作，但还不是 Desk Tools 页面的一一替代。

### 4.1 已有入口、需要加深

- `cadFilename`：增加当前文件快捷打开详情、PartKey 跳转、同 PartKey 文件计数。
- `cadScan`：增加扫描范围、增量/全量模式、进度、取消、索引统计和打开完整索引页。
- `cadRead`：增加概览字段、对象/XLink 分组、诊断跳转和打开完整文件详情。
- `cadQuery`：增加当前文件引用摘要、装配树预览和打开完整 BOM 页面。
- `cadProvider`：保持为能力连接与修复入口，不承载业务页面。
- `cadDiagnostics`：汇总 TS、SQLite、Desk provider、Schema 和远程工作区支持状态。

### 4.2 尚无原型

- 完整 CAD 索引表格页面。
- BOM 总成目录、全量引用表和多级装配树页面。
- FCStd 文件详情及概览/属性/引用/装配/改名子页。
- 零件目录和 PartKey 详情。
- XLink 修复计划、候选目标选择和应用结果。
- CAD 改名历史、影响分析和引用修正。
- 编号查重及导出。
- STEP、SW→STEP 的 Desk Tools handoff 和任务进度。

这些功能不再新增顶层 Ribbon 项。主要入口放在现有 Block 的 header action、结果行操作、文件资源管理器右键菜单和命令面板。

## 5. 建议的编辑区页面

### 5.1 CAD 索引（单例）

- 搜索、类型/状态过滤、排序和分页。
- 工作区/工作集范围、增量或全量扫描、进度和取消。
- FCStd、Markdown、PDF、图片和 DXF/DWG 的统一资产列表；首版只保证 FCStd，其他类型逐步接入。
- 缺失项清理、JSON/CSV 导出和打开文件/文件详情。
- 调试 SQL 只保留为开发命令，不进入普通页面主操作。

### 5.2 BOM 与引用（单例，可切换当前宿主）

- 总成目录和搜索。
- 直接子项、完整装配树、入向宿主、出向引用四种视角。
- `resolved / missing / ambiguous / self` 状态过滤。
- 跳转文件详情、PartKey 详情和资源管理器。
- 首版只读；Label 同步作为后续独立计划操作。

### 5.3 FCStd 文件详情（按 URI 多标签）

- 概览：路径、大小、文档类型、PartKey、BOM 属性和引用计数。
- 属性：当前值、推荐值、来源、dirty 标记；首版只读。
- 引用：入向/出向引用、解析状态、候选目标。
- 装配：一级/完整树、循环和缺失诊断。
- 改名：推荐文件名、引用影响、不可变操作计划。

Desk Tools 的“一文件一工作台标签、最多若干标签”语义可以直接映射为 VS Code 编辑器标签，不需要在 Webview 内再造一层标签栏。

### 5.4 零件目录与零件详情

- 目录页单例：PartKey、类型码、系列、名称、文件数、缺失/失效状态。
- 详情页按 PartKey 多标签：元数据、关联 FCStd/图纸/文档、文件角色和状态。
- 从文件详情、BOM 表、索引表和资源管理器统一跳转。
- PartKey 元数据是否独立于 FCStd 写回，必须以 Schema 契约为准，不能让页面同时维护两份真值。

### 5.5 CAD 维护（单例）

把低频的全局操作集中在一个页面，以子页承载：XLink 修正、改名历史、编号查重。这样不增加 Ribbon 密度，也能共用扫描范围、结果表、导出和审计 UI。

## 6. MVC 与跨产品边界

建议在 `extensions/kt-auto-cad/src` 内按职责逐步整理，而不是按页面复制 Desk Tools 文件：

```text
domain/          # 领域 DTO、状态、纯规则；最终可提炼到 Wing
application/     # scan/read/query/plan/apply 用例，不引用 Webview
infrastructure/  # vscode fs、node:sqlite、Desk provider、原子文件写入
presentation/
  block/         # 将用例状态投影为 Shell Block ViewModel
  workbench/     # 编辑区页面注册、路由、session、消息校验
  views/         # 各页面的 HTML/CSS/JS 和页面 ViewModel
```

依赖方向固定为：

```text
presentation -> application -> domain
infrastructure -----------^ (通过接口注入)
```

约束：

- Domain/Application 不导入 `vscode`、DOM、Vue、Element Plus 或 Desk HTTP route。
- Block 与编辑区页面消费同一个 application service，不各自实现扫描、解析或 SQL。
- Webview 只接收可序列化、版本化的 ViewModel；所有消息先校验再执行。
- 只有出现两个真实消费者且语义稳定的纯算法/契约，才提炼到 `phoenix-wing`；本轮先在本仓库留 TODO，避开另一 agent 正在进行的 Wing/codegen 修改。
- Desk Tools 的页面可以继续消费相同契约，但不能成为 VS Code 的运行时 UI 依赖。

## 7. Block 容器继续封装的 TODO

CAD 不应知道 Shell 当前采用排他显示、MRU 切换还是上下分栏。后续统一布局能力放在 Shell：

- `single`：一次显示一个 Block，关闭后恢复最近使用项。
- `stacked`：多个 Block 上下分栏，同时保留各自状态。
- `auto`：根据侧栏宽度和用户设置选择。
- Block consumer 只实现 `render(toolId)`、`handleAction(toolId, actionId)` 和可选的状态订阅。
- Block 的标题、关闭按钮、dirty/running/error 标记、折叠、最小高度和滚动策略由 Shell 统一渲染。

这项 TODO 不阻塞 CAD 页面开发，也不能要求 Block 内部业务 UI 跟随布局模式改写。

## 8. 数据与依赖分级

| 级别 | 能力 | 实现策略 |
| --- | --- | --- |
| A：纯 TS/VS Code | 文件名、ZIP 探测、Document.xml 读取、轻量 BOM/XLink、文件枚举 | 默认可用，不提示安装 Desk Tools |
| B：TS + SQLite | 索引、搜索、PartKey 目录、BOM/引用查询、查重 | 插件内 adapter；数据库缺失时只影响对应功能 |
| C：受控写回 | BOM 属性、Label、XLink、改名及引用修正 | 先计划；TS writer 与 native writer 使用同一契约，经过真实样本验证后按能力选择 |
| D：外部 CAD 运行时 | FreeCADCmd、SolidWorks COM、需要 FreeCAD 语义重建的操作 | Desk Tools handoff，不进入 VSIX 二进制 |

TS 写回不能仅以“ZIP/XML 能修改”为完成标准。至少要验证：保留未知 ZIP entry、非 ASCII 名称、压缩方式、时间戳容忍度、大文件内存峰值、临时文件原子替换、备份、文件指纹冲突、写后复读，以及 FreeCAD 能重新打开真实样本。验证未通过前保持只读。

## 9. 分阶段计划

### P0：页面基础与只读 ViewModel

- 建立 CAD 编辑区页面注册、单例/按资源复用、CSP、消息 envelope 和 session 恢复。
- 建立 `CadBlockViewModel` 与页面 ViewModel 的版本化契约。
- 给现有六个 Block 增加“打开完整页面”和上下文跳转。
- 不改变当前 Ribbon、Code/CAD 复选和 Block 行为。

验收：打开/复用/恢复编辑区页面稳定；只安装 Auto Code + CAD 即可运行；不要求 Desk Tools。

### P1：CAD 索引与文件详情只读版

- 完善增量索引、进度、取消、状态和搜索。
- 实现 CAD 索引完整页面。
- 实现 FCStd 文件详情的概览、属性只读、引用和装配只读子页。
- 同一读取结果在 Block 和详情页一致，不重复解析。

验收：可以从 Ribbon → Block → 索引/文件详情完成闭环；真实 FCStd 样本只读无异常。

### P2：BOM、引用与零件目录

- 实现 BOM/引用完整页面和多级装配树。
- 实现零件目录、PartKey 详情和关联文件跳转。
- 实现当前文件/当前 PartKey 查重摘要与完整查重结果。
- 补 CSV/JSON 导出。

验收：同一 Schema v13 fixture 在 Desk Tools 与 VS Code 得到等价的目录、引用和 BOM 结果。

### P3：写回计划基础设施

- 定义不可变 `CadMutationPlan`、逐文件 patch、风险和预期指纹契约。
- 实现预览、逐项选择、确认、取消、冲突跳过、原子写入、复读和审计报告。
- 先用无损 fixture 和真实样本验证 TS writer；native writer 作为同一 apply 接口的可选实现。
- 本阶段不急于开放所有写命令，先把安全闭环做完整。

验收：取消和冲突零写盘；部分失败可定位；写后结果可复读并有审计记录。

### P4：属性、XLink 与 CAD 改名

- BOM 属性推荐与写回。
- Label 同步和 XLink 候选选择/修正。
- 推荐文件名、改名影响分析、文件改名与宿主引用修正。
- 写操作从文件详情或 CAD 维护页进入，不增加 Ribbon 项。

验收：每次操作先预览影响范围；真实装配样本在 FreeCAD 中可重新打开，引用解析结果符合计划。

### P5：Desk Tools 任务协同

- 定义 handoff/job protocol，而不是复用 Desk HTTP 页面。
- 接入 STEP 批量和 SW→STEP 的可用性、参数、启动、取消、进度、日志和结果定位。
- Desk Tools 未安装时只在对应 Block/操作内提示，不影响 A/B 级功能。

验收：VSIX 不包含 Rust/FreeCAD/SolidWorks 二进制；外部任务失败不会影响索引和只读功能。

## 10. 下一轮建议范围

下一轮先实施 P0 + P1 的只读部分，具体顺序：

1. 抽出当前 `CadBlockProvider` 中的读取/索引状态为 application service 和版本化 ViewModel。
2. 建立编辑区 CAD 页面壳，只实现索引页和文件详情概览。
3. 从 `cadScan`、`cadRead` Block 增加“打开完整页面”，验证相同状态跨两种 UI 复用。
4. 加入引用/装配只读子页，然后再开始 PartKey/BOM 完整页面。

这一范围绕过 Rust、Desk provider 和写回，能最快验证 MVC、页面路由和完整 Desk Tools 工作流在 VS Code 中是否成立。
