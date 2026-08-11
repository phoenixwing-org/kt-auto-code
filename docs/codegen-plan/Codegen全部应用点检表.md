# Codegen 全部应用 V1 实现与点检

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-20

本文件是简版“全部应用”的当前行为真源。V1 的目标是复用已经验证的单 JSON Preflight/Apply 流程，快速提供工作区级后台串行入口，并在本次运行结束后给出可持久化、可重开的轻量结构化报告 View；全量预检屏障、跨 JSON 冲突分析、独立批次 Problems、取消协议与完整 receipt 归档仍属于 [`全部应用 2.0`](Codegen全部应用与批量报告计划.md)。

## 1. V1 用户流程

1. Primary 显示文字按钮 `全部应用`；只有当前已发现的有效 Codegen JSON 进入批次。
2. 点击后一次确认：明确提示会在后台逐份运行 Preflight 与 Apply，不批量创建 JSON View。
3. 确认后冻结当前 Primary JSON 稳定列表，严格串行处理；运行中新增 JSON 不加入本批次。
4. 每份 JSON 都通过显式 URI 建立后台 Host session，再执行 `runPreflight(session)` 与 `apply(session)`；正确性不依赖“当前活动 View”。批次临时 session 在结果投影完成后释放，用户原先打开的 View/session 不关闭。
5. 单份有错误、没有计划或未应用时记录结果并继续下一份。`missing-end/orphan-end` 的安全区域仍复用 Wing 的部分 Apply；其他错误继续 fail-closed。
6. 已打开 JSON 的诊断继续保留在自己的 session Problems；后台临时 session 的问题完整投影进持久报告后释放。V1 仍不建立独立批次 Problems。
7. 完成后 Output 输出每 JSON 一行和一个简单总计；同时将一份 batch 报告原子写入 `.phoenix/reports/codegen/` 并显示 `Codegen 全部应用报告` View。批量内部 N 次 Apply 不产生 N 份 single 报告；View 已打开时复用同一标签。
8. 报告用“结果：正常/有警告/有错误”与“源码变化：已更新/内容一致/部分更新/未应用”两轴表达，正常零写入明确显示 `正常 · 内容一致`。顶部 Combo 可选择全部或单个 JSON。JSON 链接打开/定位现有 Codegen View，问题链接打开源码行；Host 只接受当前报告中精确存在的目标。Primary 的“应用报告”列表可从磁盘复读并重新打开报告。

## 2. 运行锁与遮罩

- Primary 与批次开始前已经打开的 Codegen JSON View 显示 `N / M + 当前文件名` 的运行遮罩，阻止重复点击 Auto Code 操作；后台项不创建 Panel。
- 遮罩只覆盖 Auto Code Primary 和 Codegen JSON View，不阻塞整个 VS Code。
- 扩展重载、重新进入工具或批次结束后，没有有效 `{current,total,fileName}` 进度对象时不得仅凭残留 operation 显示遮罩；该幽灵状态必须自动解除。
- watcher 触发的 JSON/源码刷新在批次期间合并延后，批次结束后再恢复，不能插入当前串行 Apply。
- View 切换不影响批次：批次始终使用冻结 URI 查找 session。

## 3. 自动点检

| ID | 点检项 | 自动证据 | 状态 |
|---|---|---|---|
| A1 | Primary 有 `全部应用`，无 JSON 时禁用 | `primaryPanel.test.ts` | [x] |
| A2 | 点击前一次 modal 确认，取消时零 Preflight/Apply | Host characterization + `index.ts` | [x] |
| A3 | 候选来自冻结的 `summaries()` 稳定列表 | `index.ts`、既有列表排序测试 | [x] |
| A4 | 每项显式 `ensureKnownDocument(uri)` 建立后台 session，不创建 Panel | Host characterization | [x] |
| A5 | 每项严格 Preflight → Apply，异常后继续下一项 | Host characterization + 单项既有测试 | [x] |
| A6 | 健康度与源码变化分别汇总，内容一致不计为错误 | `applyOutcome.test.ts`、`batchApplyV1.test.ts` | [x] |
| A7 | Primary 有真实进度才显示遮罩 | `primaryPanel.test.ts`、`panelHtml.test.ts` | [x] |
| A8 | 残留 batch operation 无进度时自动解锁 | `primaryPanel.test.ts`、`panelHtml.test.ts` | [x] |
| A9 | JSON View 遮罩消费 `codegenBatchState` 并设置 `aria-busy` | `editorHtml.test.ts` | [x] |
| A10 | 运行时 Editor/Primary 操作锁定，ready 仍可完成模型初始化 | Host characterization | [x] |
| A11 | 批次期间 watcher 请求延后，结束后恢复 | Host characterization | [x] |
| A12 | V1 不新增第二套写盘算法，仍调用既有 `apply(session)` | Host characterization | [x] |
| A13 | 每批完成自动显示并复用单个非持久报告 View | `batchApplyReportViewController.test.ts` | [x] |
| A14 | 报告由结构化 DTO 汇总，错误只保留最小定位字段 | `batchApplyReport.test.ts` | [x] |
| A15 | 报告 HTML 支持主题、nonce CSP、JSON 安全序列化与不可信文本转义 | `batchApplyReportHtml.test.ts` | [x] |
| A16 | 单项 Apply 早退返回零写入，成功返回实际修改文件/区域与完整诊断 | `applyOutcome.test.ts`、Host characterization | [x] |
| A17 | 报告合并预检与 Apply 的 error/warning，且不重复同一问题 | `batchApplyReport.test.ts`、Host characterization | [x] |
| A18 | Combo 只选择本批次 JSON；JSON/问题链接由 Host 对当前报告精确校验 | `batchApplyReportHtml.test.ts`、`batchApplyReportViewController.test.ts` | [x] |
| A19 | single/batch 报告使用 schema、相对路径、规则文件名和原子写入 | `applyReportPersistence.test.ts`、`applyReportStore.test.ts` | [x] |
| A20 | Primary 投影最近报告并发出重开/打开目录语义动作 | `primaryPanel.test.ts`、`panelHtml.test.ts` | [x] |
| A21 | 报告 JSON 链接复用 Codegen View callback；batch-owned session 完成后释放 | `batchApplyReportViewController.test.ts`、`documentSessionController.test.ts`、架构 characterization | [x] |
| A22 | 汇总状态支持纯前端筛选；选中单个 JSON 时绕过残留筛选并改为只读标签 | `batchApplyReportHtml.test.ts` | [x] |

## 4. 人工点检

2026-07-19 用户回执：`全部应用` 已完成真实 11 份 JSON 的串行运行，运行遮罩正常，结束后自动打开轻量报告且 11 份 JSON 均有一行。报告的修改文件/写入区域/错误/警告已有初步效果，但尚未逐项与真实 warning 对账；逐 JSON 错误数直接展示及点击钻取明确留给 V2。

2026-07-20 用户回执：持久报告改进的核心路径全部通过。内容一致显示 `正常 · 内容一致`；single/batch 文件数量与命名范围正确；Primary 可重开历史报告；JSON 链接进入 Codegen View；批量未创建额外 JSON Panel，也保留了用户原先打开的 View；真实错误场景显示 `有错误 · 部分更新`；报告顶层 schema/identity/time/health/change/summary 字段存在。

2026-07-20 最终 UI 回执：多 JSON 汇总标签筛选、带状态 Combo、左右循环、报告目录入口、24px Primary 图标和问题列表列宽/长路径换行均通过；从多项筛选切到具体 JSON 时，该单项会强制显示并使用只读标签，切回“全部 JSON”后恢复原筛选。

- [ ] 在真实 PNX CAA 工作区点击 `全部应用`，确认弹窗准确显示 JSON 数量。
- [x] 确认 Primary 和批次前已打开的 JSON View 运行期间由遮罩锁定，结束后正常解除；批次未打开的 JSON 不产生新标签，用户原先打开的 View 不关闭。
- [ ] 准备一份成功、一份 `missing-end` 但有安全区域、一份不可写入 JSON；确认后续 JSON 仍执行，Problems 分别保留。
- [x] 完成后确认遮罩消失；关闭旧 Extension Development Host 后重新运行 `pnpm dev` 不再出现幽灵遮罩。
- [ ] 检查 Output 只有简短逐项行和总计，正常/警告/错误及已更新/内容一致/部分更新/未应用数量与实际一致。
- [x] 确认批次结束后自动显示 `Codegen 全部应用报告`；真实批次 11 份 JSON 均有一行。
- [ ] 报告保持打开时再次运行批次，确认复用同一标签且只显示最新批次。
- [x] 在 Combo 中选择单个 JSON，确认汇总、逐项表和问题表只显示该 JSON且不受残留筛选影响；恢复“全部 JSON”后恢复原筛选。
- [x] 点击 JSON 名称，确认打开/定位对应 Codegen View，而不是普通 JSON 文本编辑器。
- [x] 对内容已经一致的 JSON Apply，确认显示 `正常 · 内容一致`，没有红色“未写入”或伪造错误。
- [x] 确认 `.phoenix/reports/codegen/` 每次 single Apply 新增一份 single 报告、一次全部应用只新增一份 batch 报告；关闭 View 后可从 Primary“应用报告”重开。
- [x] 制造真实错误，确认有安全区域写入时显示 `有错误 · 部分更新`；报告 JSON 顶层包含 `schemaVersion/reportId/startedAt/health/change/summary`。
- [ ] 逐项核对“修改文件/写入区域/错误/警告”与 Apply/Problems；当前只确认报告形态和行数，尚未精确核对 warning。
- [ ] 制造源码未保存或回执写入失败，确认问题列表分别显示 Apply error 或 warning。
- [ ] 检查报告在深色/浅色主题和窄窗口下可读，表格只横向滚动；关闭报告后不产生 `.phoenix` HTML 文件。
- [ ] Windows 发布态由用户后续手工点检，不冒充当前自动通过。

## 5. V1 明确不做，转入 2.0

- 批次开始前完成所有 JSON 的全量预检屏障。
- dirty/conflict、跨 JSON 同 Region 冲突的整批分析。
- ready/blocked/skipped 精确确认表。
- 取消协议、失败后停止策略和跨项事务语义。
- 复制 TSV/Markdown 和历史报告删除/保留策略设置。
- 每 JSON 行直接显示 error/warning 数量，以及在报告内展开/折叠该 JSON 的完整问题详情。
- 独立 `kt-codegen-batch` DiagnosticCollection，保证批次错误不随单 JSON Problems 切换。
- V1 持久轻量报告记录预检/写入计数和最小问题定位；取消/冲突/完整 receipt 统计仍由 2.0 补齐。
