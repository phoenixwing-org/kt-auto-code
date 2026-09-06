# Codegen 快速原型演进状态

## 当前布局

```text
左侧唯一 Module Block                  当前编辑区（不新建 Split）
┌────────────────────────┐             ┌────────────────────────────┐
│ 打开 / 自动发现 / CSV / 刷新 │             │ Save / Revert / Preflight  │
│ 活动 JSON 与 Prefix/Middle   │  active     │ Preflight / Controls / Apply│
│ JSON列表 + 工作区候选源码列表 │ <─────────> │ Wing Table + 下方收缩 Block │
└────────────────────────┘             └────────────────────────────┘
```

- 一份 JSON 对应当前编辑区一个 View；重复打开时定位已有 View，不创建并列 Split。
- 发现只更新左侧列表，必须点击 JSON 才打开 View，不自动打开第一份。
- 切换当前编辑区的 Codegen 标签后，Block 自动显示活动 JSON 的四个属性和 dirty 状态。
- 表格内置旧 Qt 的17列、Sort、Copy/Paste、Insert、Duplicate、Move 和 Delete。
- 表格使用 VS Code 主题变量及 Shadow DOM，并对深色、浅色、高对比主题显式传入边框/焦点变量，同时保留 DeskTools 复用边界。

## Wing 分层

### `KtCodegenTableCore`

已迁到 `@phoenix-wing/kt-codegen` 包根：

- 只修改共享 `KtCodegenParam.items`，不持有文件和四个文档属性。
- 封装字段转换、行操作、旧 Qt Sort、内部剪贴板、dirty 和 checkpoint。
- `replaceData()` 接收 Webview 整表草稿；`setData()` 建立新 checkpoint。
- `revertToCheckpoint()` 只还原 items，保持 Param/items 数组身份。

### `KtCodegenTable`

已迁到 browser-only 子路径 `@phoenix-wing/kt-codegen/table`：

- 输入：`setData(KtCodegenTableData)`；输出：`getData()`。
- clean/dirty 跃迁使用 `kt-codegen-table-dirty-change`；内部数据变化使用 `kt-codegen-table-change`。clean→dirty 的首份整表草稿立即交换以保护快速关闭，后续连续修改防抖 600ms 后再交换。
- 内置按当前内容自适应列宽；该动作只改变布局，不触发 dirty。
- 使用显式 `ktCodegenDefineTableElement()` 注册；包根不会在 Node 中求值 `HTMLElement`。
- 文件 URI、JSON 写盘、Preflight 和 Apply 不进入组件。

## 文件发现和转换

- 每个 Workspace Folder 第一次打开 Codegen 时同时发现根目录/子目录 JSON/CSV；0 个结果也记录为已初始化。
- 四个 VS Code 文件检索直接接收取消令牌；单根 JSON 或 CSV 超过 300 份时明确停止并提示缩小工作区或手工打开，不返回悄悄截断的列表。
- 独立 `KtcCodegenWorkspaceWatchService` 监听 JSON/CSV/源码，过滤 `.phoenix`、依赖和构建目录，并分别以 500/750ms 合并刷新。
- 只有 Wing Reader 确认为旧17列格式的 CSV 才会自动转换。
- JSON/CSV 与源码 Marker Index 复用同一个严格 UTF-8、UTF-8 BOM、GBK codec，统一返回原始字节 sha256 与 LF/CRLF；不在两个 Service 中维护分叉的编码逻辑。
- 转换使用临时 JSON、复读规范化、原子替换；全部成功后才删除 CSV。用户明确覆盖已有 JSON 时若目标复读或删除 CSV 失败，会恢复覆盖前的 JSON。
- 同名 JSON 内容相同时清理重复 CSV；内容不同时保留两边，手动确认后才能覆盖。
- 工作区级发现与候选扫描通过独立 operation coordinator 串行化；watcher 的重复请求会合并，但不会误取消另一类正在运行的扫描。用户显式刷新仍可替换当前任务。

## 预检和控制符

- `.phoenix/cache/codegen/marker-index-v1.json` 缓存工作区源码文件及控制标记候选。
- 源码 watcher 会把实际所属 Workspace Folder 的索引标脏、立即清空旧候选并取消运行中预检；下一次候选扫描/预检会强制复读该根，即使文件修改后 `mtime` 与尺寸碰巧未变也不复用旧条目。
- 左侧“扫描候选源码”直接展示工作区级候选列表，不需要先选择或打开 JSON。
- 多根工作区会聚合所有 Workspace Folder 的候选，并在列表路径前显示根目录名；某份 JSON 的预检与 `.phoenix` 缓存始终落在实际包含它的最深 Workspace Folder。
- Extension Host 运行中新增或移除 Workspace Folder 会取消旧 scope 操作、失效预检/候选并自动重扫 JSON/CSV，不需要关闭重开 Codegen Block。
- 移除根后，已关闭且 clean 的旧会话不再回填到列表；仍打开、dirty 或存在外部冲突的草稿继续可见，避免为了列表整洁丢失内存工作。
- `.phoenix/cache/codegen/preflight-v1/` 按 JSON 缓存 Wing `KtCodegenPlan`。
- marker index 与 plan cache 的 schema、generator、工作区、scope、ignore、文档 revision 校验集中在纯数据模块；不满足任一条件就拒绝复用旧缓存。
- 页面下方可收缩 Block 展示 Wing 的32个旧 Block、VB 友好标题、deprecated 标签、四个预设、单选模式、源码命中、诊断和 Artifact 预览，不再打开第二个 View。
- 单选/多选模式属于每份 JSON 会话状态；重新渲染、切换 View 或只改变模式时不会丢失，也不会无故作废已有 Preflight Plan。
- 每份 JSON 独立缓存 Preflight Plan；没有缓存时点击 Apply 会先自动预检。Apply 前重读全部目标源码并校验 sha256、未保存编辑器、区域重叠和工作区边界，保持 UTF-8/BOM/GBK 原编码后写入；事务内每个文件写入前再比较原字节，中途变化或写入失败会回滚此前文件。回滚也只覆盖仍等于本次 `after` 的内容，不会静默覆盖第三方再次修改。
- Preflight/Apply 的 warning 与 error 发布到 VS Code Problems；点击后打开源码定位到行，并显示黄色整行标识。
- 工作区发现、候选扫描和单文档预检均支持取消；长扫描会把当前阶段/文件数回传到对应 View。
- 预检写完缓存后还会再次检查取消状态，总 Controller 也会复验任务所有权；被源码 watcher 取消或被新任务替换的旧结果不能回填页面。
- 候选范围超过 5000 个源码文件时明确拒绝生成不完整索引，并提示先用工作集或 Ignore 缩小范围，不会在 VS Code 的结果上限处静默漏检。
- 切换工作集范围会取消旧范围扫描、清空候选列表并使所有内存 Preflight Plan 失效，避免 Apply 继续引用旧 scope。

## 外部修改保护

- 打开 JSON 时记录磁盘字节的 sha256 checkpoint；watcher 只负责尽早提示，不是保存正确性的唯一依据。
- 保存先写临时 JSON 并用 Wing 复读，替换前再次核对 checkpoint/删除 guard，原子替换后再复读目标；checkpoint 不一致时必须选择“从磁盘重新加载”或“覆盖保存”，文件被删时只能明确选择“重新创建文件”。
- clean 文档的有效外部修改自动原地 reload；dirty 文档保留内存草稿并进入冲突状态，不会静默覆盖。
- clean 文档若被外部改成无效 JSON、无法解码文本或不可读取内容，会保留最后一份有效内存模型并显示错误冲突；修复磁盘内容后才能恢复自动 reload。
- 冲突状态同步到右侧标签、状态文案、重新加载按钮和左侧 JSON 标签；源码变化会立即使旧 Preflight Plan 失效。

## 可重复验收与诊断

- `pnpm ext:launch:codegen` 每次把 tracked fixture 复制到新的系统临时目录，生成用于取消测试的批量源码，再启动仅加载 Code 插件的 Extension Host。
- `pnpm ext:prepare:codegen` 只准备临时工作区，适合先检查 fixture 或手动选择 VS Code 版本。
- `pnpm ext:verify:codegen -- <临时工作区>` 在 Apply 前检查源码 sha256 基线；完成真实 Apply 后用 `--checkpoint-e` 核对源码确有变化、Start/End 仍配对以及两层缓存类型。
- 每个临时工作区自带 `.phoenix/codegen-qa-report.json`；验证器只回写机器检查字段，A–F 的人工状态继续保持 pending，便于分晚、分 checkpoint 接续测试。
- `pnpm ext:report:codegen -- <临时工作区>` 显示当前进度和下一项；记录人工 passed/failed 时会强制 A/C/E verifier、A 诊断复制和 F 深浅主题门禁，不需要手改报告 JSON。
- “打开 JSON / 导入 CSV / 全部应用 / 刷新列表 / 扫描候选源码 / 复制运行诊断”由 Codegen 当前工具 Block 与命令面板提供；不占用原生 View Header，也不复用 Toolbar Strip 仅用于 Ribbon 定制的唯一 `…`。诊断导出发现、CSV、会话、revision、冲突、缓存和运行中任务摘要，不导出表格单元格及源码内容。
- 每次用户 single Apply 写一份 single 报告；一次“全部应用”只写一份包含 N 项的 batch 报告。报告使用规则文件名和相对路径原子写入 `.phoenix/reports/codegen/`，Primary“应用报告”列表可在 View 关闭后重新打开。
- 报告以“正常/有警告/有错误”和“已更新/内容一致/部分更新/未应用”双轴显示；正常零写入是 `正常 · 内容一致`。动态 View 的 Combo 可选全部或单个 JSON，JSON 链接进入 Codegen View，问题链接定位源码。批量执行默认只建立后台 session，不批量创建 JSON Panel。
- 分阶段人工步骤见 [Codegen 手工验收](codegen-plan/Codegen手工验收.md)。
- [验收覆盖矩阵](codegen-plan/CodegenAcceptanceCoverage.json) 将13项目标分别标记为自动已证明、自动部分证明和人工待验证；只有 A–F 报告完成后才允许关闭目标。
- [Qt/VB 迁移矩阵](codegen-plan/CodegenQtVbMigrationMatrix.json) 现在区分两个原始工程根、受控状态语义和 A–F Feature 映射；当前明确未完成项只有下一架构阶段的 Hot Exit 与批量 Apply All。

## 当前保留边界

- 右侧仍使用现有 `WebviewPanel` 会话；600ms 防抖整表同步可在重开 View 时恢复内存草稿，但尚未迁到 `CustomEditorProvider`，因此还没有原生 Hot Exit/Backup/Save All。
- 保存、整表 revision、从磁盘 Revert、watcher 和保存时 fingerprint 门已完成；真实 Extension Host 的文件系统时序仍需 E2E 点检。
- Apply All、DeskTools Vue wrapper 和大表虚拟化不在本次实现内；当前只 Apply 活动 JSON 的有效计划。
