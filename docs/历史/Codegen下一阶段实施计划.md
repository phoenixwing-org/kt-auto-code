# Codegen 下一阶段实施计划

> 历史归档：当前路线与剩余事项以 [`current-roadmap.md`](../current-roadmap.md) 为准。

> 状态说明（2026-07-17）：本文保留最初阶段规划。当前实现已按实测反馈把控制符/预检内嵌到 JSON View 下方，并开启带源码指纹复验、原编码写回和失败回滚的真实 Apply；下文关于独立控制符 View 与 dry-run 的描述仅作历史决策记录。

> 状态：第三轮可靠性点检已完成。除第二轮内容外，独立 Workspace Watch Service、根/子目录发现回归测试、外部 JSON fingerprint 冲突门、扫描/预检取消与进度也已完成；Custom Editor/Hot Exit、真实 Apply 和 DeskTools wrapper 尚未执行。

## 1. 目标

在保留现有 Codegen 快速原型布局验证成果的基础上，完成一条可长期维护的 Codegen 编辑链路：

- 继续复用 KT Auto Code 的单 Block 容器；一份 Codegen JSON 对应右侧一个编辑 View。
- 切换右侧 View 时，左侧 Block 自动切换到该 JSON 的文件信息和四个属性。
- 将 `KtCodegenTableCore` 与独立 Web Component `KtCodegenTable` 迁入 Phoenix Wing，供 VS Code 插件和 DeskTools 共同使用。
- 不把每个单元格修改发送给 Extension Host；组件内部 change 信号由 View 防抖 600ms 后交换整表，保存、还原、预检等文档级动作立即交换。
- 第一次进入 Codegen 功能时自动发现 JSON/CSV；安全转换确认成功后才删除 CSV。
- 预检工作区内的旧控制标记，形成可复用的文件索引和按 JSON 缓存的生成计划。
- 恢复 32 个旧控制符/生成块的选择与预览 View；第一阶段的 Apply 只输出结构化日志，不改源码。

## 2. 本轮确认的架构决定

| 项目 | 决定 |
| --- | --- |
| 总体布局 | 单 Codegen Block + 右侧 JSON 编辑 View |
| 文档关系 | 一份 JSON 对应一个 View；重复打开时定位已有 View |
| 活动状态 | 活动 View 是事实来源，Block 只展示并编辑当前活动文档的属性 |
| 左侧 Block | JSON 列表、发现/刷新、CSV 状态、Prefix/Middle/Namespace/Append、当前文档摘要、工作区级控制符候选列表 |
| 右侧 View | 文档级工具栏 + `KtCodegenTable`；不再重复放四个属性 |
| Table | 独立 Web Component，内置所有行级操作和 17 列编辑器 |
| TableCore | 纯 TypeScript、无 DOM/VS Code/Node/Vue 依赖，原地更新 `KtCodegenParam.items` |
| 数据交换 | 整表快照 + revision；不逐单元格跨 Webview/Extension Host 通信 |
| 文档生命周期 | 目标形态使用 VS Code `CustomEditorProvider`，获得原生 Save/Revert/Backup/dirty 支持 |
| CSV | 首次进入自动发现；只有无冲突并验证写入成功后自动删除源 CSV |
| 预检 | 工作区 Marker Index + 按 JSON 的 Preflight Cache 两层缓存 |
| Apply | 本阶段只读取有效缓存并输出日志；源码写入另设验收门 |
| 控制符 View | 32 Block 目录/选择与预检命中放在同一个 View 的两个区域 |

## 3. 现状分析结论

### 3.1 当前快速原型

当前实现已经完成第一层 MVC 拆分：

- `documentModel.ts` 是无 VS Code/DOM/文件系统依赖的单文档 Model，集中维护共享 Param、revision、dirty、checkpoint、控制符选择和预检失效。
- `documentService.ts` 通过文件系统端口处理 JSON/CSV；`workspaceDiscovery.ts` 负责多 Workspace Folder 发现；`workspaceWatchService.ts` 负责监听生命周期、过滤和 debounce；`preflight.ts` 负责 Marker Index/Plan Cache。
- `editorViewController.ts` 与 `controlViewController.ts` 只适配 WebviewPanel，不修改领域数据。
- Wing `KtCodegenTable` 使用 Shadow DOM；URI、四个属性和文件写盘不进入组件。
- 当前仍使用手工 `WebviewPanel`；600ms 防抖整表同步可保留会话草稿，但原生 Hot Exit/Backup 仍需 `CustomEditorProvider`。

### 3.2 Phoenix Wing

`@phoenix-wing/kt-codegen` 已经具备可直接复用的领域基础：

- `KtCodegenParam`、`KtCodegenItem` 和保持对象/数组身份的 `KtCodegenAdapter`。
- JSON/CSV Reader、Writer、Controller、Core。
- `KtCodegenPlan`、Marker Region、Artifact、Diagnostic。
- 32 个 `KT_CODEGEN_LEGACY_BLOCKS` 和 9 个生成 Target；32 个生成块均已迁移。

因此下一阶段不是重写生成器，而是补 Table/Core 的 UI 边界和宿主编排。

### 3.3 Qt/Ktd

旧 Qt 界面的有效信息应按新布局重新归位：

- `KtdAtcCodePropertyPanel` 的四个属性正是 Prefix/Middle/Namespace/Append，适合迁入左侧 Block。
- 项目面板负责 JSON 列表、读取、列出、Apply All、Import CSV。
- Table 内部操作包括 Sort、Copy、Clone/Paste、Insert、Move Up/Down、Delete。
- Sort 不只是普通排序，还包含按 Suffix/ID 分组和组内重新编号，需要作为兼容算法做 golden test。
- Qt 的 CSV 转换会覆盖同名 JSON，并在保存结果未验证时删除 CSV；新实现不能照搬这一风险。

### 3.4 VB/WinForms

VB 是实际旧生成流程和“控制符列表”的来源：

- Apply 前按 Suffix × 选中 Block 形成组合，再扫描源码中的 Start/End 标记。
- `FormCAAWspGuide` 有 32 行生成块表，列为启用、ID、标题、控制词、说明。
- 旧预设包括全选、全不选、C++ only（旧 ID 10–13）、Field Code（旧 ID 19–31）和单选模式。
- 旧实现每次 Apply 都重新扫描源码，没有可复用索引；本次新增的预检缓存用于消除这部分重复成本。

## 4. 目标分层

```text
VS Code Codegen Block
  ├─ JSON/CSV discovery + active document summary
  ├─ workspace marker candidates (JSON independent)
  ├─ Prefix/Middle/Namespace/Append
  └─ open/refresh/import/status commands
                  │ active document + property patch
                  ▼
VS Code CustomEditorProvider / KtCodegenDocument
  ├─ shared KtCodegenParam (source of truth)
  ├─ save/revert/backup/dirty/revision
  ├─ marker index + preflight cache orchestration
  └─ bulk message bridge
                  │ KtCodegenTableData snapshot
                  ▼
Right JSON View
  ├─ document toolbar: Save/Revert/Preflight/Controls/Apply
  └─ <kt-codegen-table>
        └─ KtCodegenTableCore -> local/shared KtCodegenParam.items

Phoenix Wing
  ├─ pure model/controller/reader/writer/analyze/render
  ├─ KtCodegenTableCore (pure)
  └─ @phoenix-wing/kt-codegen/table (browser-only Web Component)
```

### 4.1 左侧 Codegen Block

负责：

- 当前工作区的 Codegen JSON 列表和状态。
- 当前活动文档、已打开、未保存、预检状态。
- Prefix、Middle、Namespace、Append 的编辑。
- 首次发现、手动刷新、导入 CSV、CSV 冲突处理。
- 打开 JSON；切换 View 后立即显示新文档属性。

不负责：

- 保存一份独立的 `KtCodegenParam` 副本。
- 表格行操作或单元格状态。
- 直接读写源码或执行生成替换。

Block 属性修改通过文档级 patch 更新活动 `KtCodegenParam`，并使 Custom Document 变脏。切换 View 后，Block 从新的活动文档重新取值，不能把上一个 View 的输入覆盖过去。

### 4.2 右侧 JSON View Header

保留文档级动作：

- Save、Revert。
- Preflight。
- 打开/定位“控制符” View。
- Apply；第一阶段仅输出日志。
- 预检摘要：命中文件数、区域数、诊断数、缓存是否有效。

不再放 Prefix/Middle/Namespace/Append，也不放 Insert/Delete/Move 等行级动作。

### 4.3 `KtCodegenTable`

内置：

- 17 列展示和各列合适的 text/number/combo/checkbox 编辑器。
- 列宽、固定首列/行号、选中行、键盘导航、主题变量。
- Insert、Delete、Move Up/Down、Copy、Paste/Clone、Duplicate。
- 旧兼容 Sort/Normalize ID。
- 表格内部校验提示；未知 Combo 字符串原样保留，不自动清空。
- 本地 checkpoint、dirty、revert 和整表 get/set。

不内置：

- URI、文件名、工作区、JSON/CSV 读写。
- Prefix/Middle/Namespace/Append。
- Preflight、Apply、生成 Target 或 VS Code 命令。

对外最小接口建议：

```ts
interface KtCodegenTableElement {
  setData(data: KtCodegenTableData): void;
  getData(): KtCodegenTableData;
  markCheckpoint(documentRevision: number): void;
  revertToCheckpoint(): void;
  focusRow(row: number): void;
}
```

对外发送 clean → dirty / dirty → clean 状态跃迁，以及不携带整表的内部 change 信号。单元格输入、选择变化和行操作仍留在组件内部；View 对 change 防抖后调用 `getData()` 做整表交换，Save/Preflight/Apply/Revert 等动作立即交换。

`selectedRow` 是 View 会话状态，只用于整表同步后恢复焦点，不写入旧 v4 JSON。`documentRevision` 是并发保护信息，同样不属于 `KtCodegenParam`。

### 4.4 `KtCodegenTableCore`

Core 接受一个 `KtCodegenParam`，只修改其 `items`，保留 Wing 现有“共享、公开、可变、原地更新”的性格：

- 同一 JS Realm 中，VS Code Webview 或 DeskTools 可以 `bindParam(param)` 并共享实例。
- Extension Host 与 Webview 不在同一 Realm，不能假装共享对象身份；必须用 `KtCodegenTableData` 快照传输，再由 Adapter 原地合并到 Host 的 Param。
- checkpoint 只备份 Table 拥有的 items，不备份四个文档属性，避免旧表格快照覆盖 Block 的新修改。
- Sort、插入、复制、粘贴、移动、删除和字段转换全部由 Core 提供，UI 不复制业务算法。

## 5. Wing 文件和导出边界

主类文件名与类名保持一致：

```text
packages/kt-codegen/src/
  KtCodegenTableCore.ts
  KtCodegenTableData.ts
  table/
    KtCodegenTable.ts
    KtCodegenTableColumns.ts
    index.ts
```

建议导出：

- 包根 `@phoenix-wing/kt-codegen`：导出纯 `KtCodegenTableCore` 和类型，不加载 DOM。
- `@phoenix-wing/kt-codegen/table-core`：可选的显式纯 Core 子路径。
- `@phoenix-wing/kt-codegen/table`：只供浏览器/Webview/DeskTools 使用，导出 `KtCodegenTable` 和 `ktCodegenDefineTableElement()`。

约束：

- 不在包根求值 `HTMLElement`，否则 VS Code Extension Host/Node 导入时会失败。
- 不在模块加载时隐式 `customElements.define`；由宿主显式调用 `ktCodegenDefineTableElement()`，保持 `sideEffects: false` 真实有效。
- Web Component 使用 Shadow DOM 封装结构和默认样式，通过 `--pnw-kt-codegen-*` CSS 变量接入 VS Code 深色/浅色主题或 DeskTools 主题。
- 暂时放在已有 `@phoenix-wing/kt-codegen` 的 browser 子路径；只有后续出现多个独立 Codegen 控件时，再评估拆成单独 UI package。

## 6. 文档和数据一致性

### 6.1 一份 JSON 一个 Custom Document

目标实现迁移到 `CustomEditorProvider`：

- `openCustomDocument` 读取 JSON，生成文档级 `KtCodegenParam`、revision 和保存 checkpoint。
- `resolveCustomEditor` 将整表快照发送给右侧 View。
- 表格第一次变脏时，Webview 只发送 dirty 通知；Host 发出 Custom Document change event。
- `saveCustomDocument` 向 View 请求整表快照，检查 revision，和 Block 属性合并后使用 Wing Writer 保存。
- `revertCustomDocument` 从磁盘重读并同步 View 与 Block。
- `backupCustomDocument` 获取整表快照，支持 Hot Exit。
- 默认禁止同一资源多个编辑实例，避免两个 View 同时编辑同一 JSON。

这提供了 VS Code 原生关闭提示、Save All、Revert、Backup；Table 的 Core 是类似 Qt Model 的纯数据控制层，Web Component 是 View。VS Code 本身没有可直接套用的 Qt `QAbstractTableModel`，需要保留这层自有 Model/View 分离。

### 6.2 Revision 规则

- `documentRevision` 每次 Host 接收有效文档修改时递增。
- Table 快照携带它加载时的 revision。
- 保存时 revision 不匹配，先重新同步或报告冲突，不能静默覆盖 Block 属性或外部修改。
- 文件保存成功后建立新 checkpoint，Table 和 Block 同时回到 clean。
- 外部文件变化以磁盘 fingerprint 检测；dirty 文档只提示冲突，不自动覆盖。

## 7. JSON/CSV 发现与生命周期

### 7.1 第一次进入 Codegen

每个 Workspace Folder 维护一次 `initialized` 状态，即使扫描结果为 0 也不反复全量扫描：

1. 按现有 workset/ignore 规则递归查找候选 JSON/CSV。
2. JSON 只在 Reader 确认为 Codegen 协议后进入列表。
3. CSV 只有表头可识别为旧 17 列协议时才进入转换流程，不能处理普通业务 CSV。
4. 手动“刷新”始终可重新执行发现；FileSystemWatcher 已实现，连续事件合并后自动刷新。

发现完成只更新左侧列表，不自动打开第一份 JSON；用户点击列表项后才建立/定位右侧 View。当前已完成多 Workspace Folder 发现和自动监听。

### 7.2 自动 CSV 转换

按同名 JSON 分三种情况：

1. **目标不存在**：解析 CSV → 写临时 JSON → 重新读取并规范化对比 → 原子替换目标 → 删除 CSV。
2. **目标存在且规范化数据相同**：验证两者后删除冗余 CSV，并记录日志。
3. **目标存在且内容不同**：保留两者，Block 显示冲突；只有用户执行“覆盖转换/另存为”后才能继续。

任何解析、临时写入、重读、重命名失败都必须保留 CSV。手动导入沿用同一事务，不维护第二套逻辑。

## 8. 预检、缓存与 Apply

### 8.1 两层缓存

```text
.phoenix/cache/codegen/
  marker-index-v1.json
  preflight-v1/<document-key>.json
```

`marker-index-v1.json` 是工作区级、与具体 JSON 无关的控制标记索引：

- 相对文件路径、编码、EOL、文件 fingerprint。
- 已识别的 classId、suffix、blockKey、Start/End 数量。
- 孤立、嵌套、错配、未知标记等结构诊断。
- workset/ignore 配置 fingerprint 和扫描器版本。

单文档 Preflight Cache 是配置相关的 Wing Plan 宿主投影：

- JSON URI 与规范化 `KtCodegenParam` fingerprint。
- 选中的 targets/blockKeys。
- 所依赖 Marker Index revision 和源文件 fingerprints。
- Region、Artifact 内容、诊断和摘要；不缓存完整源码。
- Wing package/generator/plan schema 版本。

### 8.2 失效条件

- Table 或 Block 属性修改：该 JSON 的 Preflight Cache 失效。
- block/target 选择变化：该 JSON 的 Preflight Cache 失效。
- 源文件 fingerprint 变化：相关文档缓存失效，并增量重建 Marker Index 条目。
- workset/ignore 改变：Marker Index 和全部文档缓存失效。
- Wing/generator/schema 版本改变：不兼容缓存失效。

缓存文件使用临时文件 + 原子替换，`.phoenix` 自身必须排除在源码扫描之外。

### 8.3 第一阶段 Apply

Apply 只在以下条件下可执行：

- JSON 已保存，当前配置 fingerprint 与缓存一致。
- 所有受影响源文件 fingerprint 与缓存一致。
- Wing Plan `canApply` 为 true，且没有阻断诊断。

按钮第一阶段不写源码，只在现有输出/日志区域打印：

- 当前 JSON、targets、blockKeys、缓存生成时间和有效性。
- 命中文件数、Region 数、Artifact 数、warning/error 数。
- 每个候选文件的相对路径、编码、行号、blockKey、预计替换字节范围。
- stale/blocked 的具体原因。

真实 Apply 写盘单独设门：重验所有 fingerprint、按文件内 offset 倒序替换、保持编码/EOL、原子写入、生成 diff/日志。它不属于本轮 UI/架构完成条件。

## 9. 控制符 View

建立一个随活动 JSON 切换的复用 View，而不是每个 JSON 再开一个控制符 View。

### 9.1 Block 目录/选择

- 从 `KT_CODEGEN_LEGACY_BLOCKS` 派生完整 32 行，不复制第二套静态 ID/Key。
- 展示启用、旧 ID、标题、控制词、平台、target、状态；deprecated 使用标签而不是隐藏。
- 恢复全选、全不选、C++ only（10–13）、Field Code（19–31）和单选模式。
- 选择属于当前文档会话/预检请求，第一阶段不写入 v4 JSON，避免改变旧文件协议。
- VB 的友好标题、控制词和调用说明已进入 Wing `KT_CODEGEN_BLOCK_PRESENTATIONS`，四个预设规则也由 Wing 统一提供。

### 9.2 预检命中

- 按文件分组展示 Marker Region、blockKey、classId、suffix、起止行和诊断。
- 点击命中项在源码编辑器定位对应行。
- 可查看生成 Artifact 预览以及“配置选中但源码缺失”的 Block。
- 目录选择变化只使预检缓存失效，不立即遍历/修改文件。

## 10. 不重复迁移的旧功能

以下能力已有 KT Auto Code 模块或不属于 Codegen 核心，本轮不在 Codegen 内复制：

- 通用搜索/替换。
- 编码管理和通用文件夹工具。
- VB 的发布、清理、复制等历史工作区操作。
- Qt Output Panel 的整套 UI；直接复用现有日志/状态区域。
- Apply All 在单文档链路稳定前暂缓，之后只作为批量编排复用同一 Preflight/Apply 服务。

## 11. 分阶段实施与验收

### Phase 0：基线和协议冻结

交付：

- 将本目录的点检 JSON 转成 TypeScript contract/fixture。
- 固化 Qt Sort、17 列字段、未知 Combo 保留、Adapter 身份保持的测试。
- 确定 Wing package 的发布版本和 kt-auto-code 的升级方式。

验收：

- 数据 contract 不包含 URI、文件名和四个文档属性。
- 示例数据可由 schema/类型验证。
- 现有 Wing 读写 round-trip 与 32 block golden test 继续通过。

### Phase 1：迁移 `KtCodegenTableCore`

交付：

- `KtCodegenTableCore.ts`、`KtCodegenTableData.ts` 进入 Wing。
- 行操作、Sort、checkpoint/dirty、整表 replace 的单元测试。
- kt-auto-code 删除本地重复 Core，改用 Wing 导出。

验收：

- Core 无 DOM/Node/VS Code/Vue 依赖。
- 原地保持 Param 和 items 数组身份。
- 未知 Combo 字符串、17 字段和 source extensions 不丢失。

### Phase 2：迁移 `KtCodegenTable` Web Component

交付：

- browser-only 子路径、显式 define、Shadow DOM 和主题变量。
- 内置行工具栏与 17 列编辑器。
- VS Code Webview 集成和 DeskTools 薄 wrapper 示例/契约测试。

验收：

- Extension Host 直接导入包根不会访问 `HTMLElement`。
- 深色/浅色 VS Code 与 DeskTools 均可读、可编辑。
- 连续编辑 100 个单元格不产生 100 次宿主消息；只产生 dirty 跃迁，保存时整表交换一次。

### Phase 3：Custom Editor 与 Block 同步

交付：

- 一 JSON 一 Custom Document/View。
- Save/Revert/Backup/dirty/revision 和外部变化冲突检测。
- 四个属性迁入 Block；活动 View 切换后 Block 自动更新。

验收：

- 两个 JSON 同时打开并来回切换，Block 永远显示活动 JSON 的属性。
- 表格和 Block 任一修改都会触发原生 dirty；Save/Revert 同时同步两侧。
- 关闭未保存 View 出现 VS Code 原生保护；重启可从 backup 恢复。

### Phase 4：发现和 CSV 事务

交付：

- 每工作区一次的 JSON/CSV 自动发现、Watcher、刷新。
- CSV 无冲突自动转换、相同内容清理、冲突展示和手动处理。

验收：

- 0 个结果时不会每次点击都全量扫描。
- 普通 CSV 不被转换。
- 任意写入/校验失败时原 CSV 保留。
- 冲突 CSV/JSON 不会被静默覆盖或删除。

### Phase 5：Marker Index、Preflight Cache、控制符 View

交付：

- 工作区 Marker Index 和单文档 Preflight Cache。
- 32 Block 选择、旧预设、命中文件列表、源码定位和 Artifact 预览。
- 增量失效和缓存状态 UI。

验收：

- 第二次预检在文件未变时复用缓存，不重新读取全部源码。
- 修改一个源码文件只失效相关索引项和计划。
- 孤立/嵌套/错配/未知标记均有结构化诊断，不能进入 Apply。

### Phase 6：Apply 日志模式和收口

交付：

- Apply 日志模式、命令可用性和完整摘要。
- 布局、键盘、主题、空状态、错误状态测试。
- Wing + kt-auto-code 联合构建、测试、类型检查和迁移文档。

验收：

- 有效缓存时输出每个候选变更；无效缓存时给出明确 stale 原因。
- Apply 不修改源码，可通过前后文件 fingerprint 断言。
- 现有非 Codegen 模块行为不回归。

## 12. 推荐的长任务执行顺序

按以下 checkpoint 推进，每个 checkpoint 独立可回退和验收：

1. 先在 Wing 完成 Core 与 contract，不动 VS Code 生命周期。
2. 完成 Web Component 和现有原型的替换，确认 UI/主题/批量交换。
3. 再迁 Custom Editor 和 Block 属性，解决文档一致性。
4. 接入自动发现与安全 CSV 事务。
5. 最后做 Marker Index、Preflight Cache、控制符 View 和 Apply 日志。

不要把 Wing 发布、Custom Editor、CSV 删除策略和真实源码 Apply 放在同一个不可分割提交中。

## 13. 执行门与工程治理

### 13.1 跨仓库发布顺序

1. Phoenix Wing 先完成 Core、browser 子路径、测试和 package exports；在本地 workspace override 下联调。
2. Wing 发布明确版本后，kt-auto-code 再升级正式依赖并移除本地 override；发布产物不能依赖开发机绝对路径。
3. kt-auto-code 先替换本地 Table/Core，再迁 Custom Editor；两步分别构建和验收。
4. DeskTools 只在 Wing API 稳定后接入薄 wrapper，不反向引入 Vue/Element Plus 依赖。

每一步都保持包根 Node 导入、browser 子路径导入和现有 JSON round-trip 测试通过。Wing 版本号由发布阶段确定，不在规划文档中猜测。

### 13.2 Custom Editor 迁移与回退

- Custom Editor 达到 Save/Revert/Backup/dirty/多 JSON 切换验收前，保留当前 WebviewPanel 入口作为开发期对照。
- 新旧实现共享 Wing Reader/Writer/Table contract，不维护两套数据算法。
- 切换默认入口前，用真实 JSON 完成一次“原型打开 → 新编辑器打开 → 修改 → 保存 → 重启恢复”迁移演练。
- 切换后若出现阻断问题，只回退 VS Code provider/入口，不回退已经验收的 Wing Core 和 Web Component。
- 稳定后删除旧 Panel 和本地 Table/Core，避免长期双轨。

### 13.3 Webview 安全门

- CSP 默认拒绝网络和任意脚本，只允许 nonce/hash 授权的本地 bundle 和受控样式。
- JSON、CSV、文件名、诊断和生成预览全部按文本渲染，不把输入拼进 `innerHTML`。
- Webview 消息在 Host 和浏览器两侧校验 kind、schemaVersion、documentRevision 和字段类型。
- 资源 URI 通过 VS Code Webview API 转换；不把 Extension Host 文件系统能力暴露给组件。
- 缓存和日志默认使用工作区相对路径，不存完整源码；Artifact 内容仅存在单文档 Preflight Cache。

### 13.4 缓存治理

- cache schema/version 不兼容时直接丢弃并重建，不做高风险跨版本就地修复。
- Workspace Folder 移除、JSON 删除或重命名时清理关联缓存。
- 启动时清理不可解析、依赖不存在和超过保留期的缓存；建议初始保留期 30 天。
- 缓存总量超过建议上限 100 MB 时按最近使用时间清理 Preflight Cache，Marker Index 保留并可重建。
- 清理失败只记录 warning，不能阻止打开或保存 JSON。

30 天和 100 MB 是初始治理值，Phase 5 用真实工程测量后允许调整，但调整必须写入配置/测试而不是成为隐式常量。

### 13.5 性能与规模基线

Phase 0 建立小型、常规和压力 fixture；以下为进入长任务时的初始验收线：

- 500 行 Table 的首次渲染不超过 1 秒，普通单元格/行操作主线程响应不超过 50 ms。
- 缓存有效时，控制符 View 恢复和 Apply 日志摘要不超过 500 ms。
- 5,000 个候选源码文件的首次 Marker Index 扫描在基准开发机上不超过 10 秒，并提供进度与取消。
- 单文件变化只增量处理该文件，不触发全部 5,000 文件重扫。
- Webview 与 Host 单条整表消息超过 5 MB 时给出诊断；若真实数据达到此规模，再引入分片/虚拟化，不提前增加复杂度。

所有时间门槛都记录基准机和 fixture；CI 以功能断言为主，性能回归在固定基准环境检查，避免共享 CI 抖动造成假失败。

## 14. 数据模型点检文件

- `docs/codegen-plan/KtCodegenTableData.example.json`
- `docs/codegen-plan/KtCodegenMarkerIndex.example.json`
- `docs/codegen-plan/KtCodegenPreflightCache.example.json`
- `docs/codegen-plan/KtCodegenControlViewModel.example.json`

这些文件是设计样例，不参与当前运行时。实施 Phase 0 时再把它们转成正式 TypeScript 类型、schema 和测试 fixture。
