# Codegen 全部应用 V1 实现与点检

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-19

本文件是简版“全部应用”的当前行为真源。V1 的目标是复用已经验证的单 JSON View 流程，快速提供工作区级串行入口，并在本次运行结束后给出一页轻量结构化报告；全量预检屏障、跨 JSON 冲突分析、独立批次 Problems、取消协议与持久化最近报告仍属于 [`全部应用 2.0`](Codegen全部应用与批量报告计划.md)。

## 1. V1 用户流程

1. Primary 显示文字按钮 `全部应用`；只有当前已发现的有效 Codegen JSON 进入批次。
2. 点击后一次确认：明确提示会逐个打开 JSON View，并逐份运行 Preflight 与 Apply。
3. 确认后冻结当前 Primary JSON 稳定列表，严格串行处理；运行中新增 JSON 不加入本批次。
4. 每份 JSON 都通过显式 URI 建立/切换自己的 Host session，再执行 `runPreflight(session)` 与 `apply(session)`；正确性不依赖“当前活动 View”。
5. 单份有错误、没有计划或未写入时记录结果并继续下一份。`missing-end/orphan-end` 的安全区域仍复用 Wing 的部分 Apply；其他错误继续 fail-closed。
6. 每份 JSON 的诊断保留在自己的 session Problems 中。V1 不建立独立批次 Problems。
7. 完成后 Output 输出每 JSON 一行和一个简单总计；同时自动新开一个临时 `Codegen 全部应用报告` 标签。报告直接消费运行过程中的结构化 DTO，不解析 Output。
8. 轻量报告上半部显示完成/部分完成/未写入/错误/警告/总耗时，下方显示每 JSON 的 URI、状态、预检区域/产物/诊断/错误数、实际修改文件数、实际写入区域数和单项耗时，再下方列出最小问题字段 `severity/code/message/file/line`。实际写入数来自单项 Apply 的结构化 outcome，不能用预检命中数冒充；报告不保存源码或 artifact 正文，关闭后不持久化。

## 2. 运行锁与遮罩

- Primary 与所有已打开/新打开的 Codegen JSON View 显示 `N / M + 当前文件名` 的运行遮罩，阻止重复点击 Auto Code 操作。
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
| A4 | 每项显式 `openKnownDocument(uri)` 后取同 URI session | Host characterization | [x] |
| A5 | 每项严格 Preflight → Apply，异常后继续下一项 | Host characterization + 单项既有测试 | [x] |
| A6 | 完成/部分完成/未写入总计不混淆 | `batchApplyV1.test.ts` | [x] |
| A7 | Primary 有真实进度才显示遮罩 | `primaryPanel.test.ts`、`panelHtml.test.ts` | [x] |
| A8 | 残留 batch operation 无进度时自动解锁 | `primaryPanel.test.ts`、`panelHtml.test.ts` | [x] |
| A9 | JSON View 遮罩消费 `codegenBatchState` 并设置 `aria-busy` | `editorHtml.test.ts` | [x] |
| A10 | 运行时 Editor/Primary 操作锁定，ready 仍可完成模型初始化 | Host characterization | [x] |
| A11 | 批次期间 watcher 请求延后，结束后恢复 | Host characterization | [x] |
| A12 | V1 不新增第二套写盘算法，仍调用既有 `apply(session)` | Host characterization | [x] |
| A13 | 每批完成自动新建一个非持久、无脚本报告 Panel | `batchApplyReportViewController.test.ts` | [x] |
| A14 | 报告由结构化 DTO 汇总，错误只保留最小定位字段 | `batchApplyReport.test.ts` | [x] |
| A15 | 报告 HTML 支持主题、CSP 与不可信文本转义 | `batchApplyReportHtml.test.ts` | [x] |
| A16 | 单项 Apply 早退返回零写入，成功返回实际修改文件/区域与完整诊断 | `applyOutcome.test.ts`、Host characterization | [x] |
| A17 | 报告合并预检与 Apply 的 error/warning，且不重复同一问题 | `batchApplyReport.test.ts`、Host characterization | [x] |

## 4. 人工点检

2026-07-19 用户回执：`全部应用` 已可运行，运行遮罩表现正常；批次内容和新报告明细尚未人工核对，所以下列逐项回执仍保持未勾选。

- [ ] 在真实 PNX CAA 工作区点击 `全部应用`，确认弹窗准确显示 JSON 数量。
- [ ] 确认 Primary 和逐个打开的 JSON View 均显示相同 N/M 与当前文件名，不能继续点击 Auto Code 操作。
- [ ] 准备一份成功、一份 `missing-end` 但有安全区域、一份不可写入 JSON；确认后续 JSON 仍执行，Problems 分别保留。
- [ ] 完成后确认遮罩立即消失，重新进入 Auto Code 不出现“正在准备 JSON View”的幽灵遮罩。
- [ ] 检查 Output 只有简短逐项行和总计，完成/部分完成/未写入数量与实际一致。
- [ ] 确认批次结束后自动新开 `Codegen 全部应用报告`；上半汇总、运行明细和问题列表数量一致。
- [ ] 选一份实际写入多个区域的 JSON，确认“修改文件/写入区域”与 Apply 日志一致，不等同套用预检命中数。
- [ ] 制造源码未保存或回执写入失败，确认问题列表分别显示 Apply error 或 warning。
- [ ] 检查报告在深色/浅色主题和窄窗口下可读，表格只横向滚动；关闭报告后不产生 `.phoenix` HTML 文件。
- [ ] Windows 发布态由用户后续手工点检，不冒充当前自动通过。

## 5. V1 明确不做，转入 2.0

- 批次开始前完成所有 JSON 的全量预检屏障。
- dirty/conflict、跨 JSON 同 Region 冲突的整批分析。
- ready/blocked/skipped 精确确认表。
- 取消协议、失败后停止策略和跨项事务语义。
- 可重新打开的最近 BatchReport、状态筛选、打开 JSON/源码、复制 TSV/Markdown。
- 独立 `kt-codegen-batch` DiagnosticCollection，保证批次错误不随单 JSON Problems 切换。
- V1 的临时轻量报告只记录本次预检/写入计数和最小问题定位；可重建的完整错误归档、取消/冲突/receipt 统计仍由 2.0 补齐。
