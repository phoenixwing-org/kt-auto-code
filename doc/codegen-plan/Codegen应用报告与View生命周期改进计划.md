# Codegen 应用报告与 View 生命周期改进计划

状态：implemented，核心 Extension Host 人工点检通过

Owner：KT Auto Code maintainers

适用版本：0.5.x 后续迭代

建立日期：2026-07-20

实现日期：2026-07-20

本文处理当前 Codegen 单次 Apply 与“全部应用”报告的四个真实使用问题：正常的内容一致被显示为红色“未写入”、报告关闭后无法找回、报告中的 JSON 链接打开了普通文本编辑器，以及批量执行后遗留大量 JSON View。完整的跨 JSON 预检屏障、冲突、取消和批次 Problems 仍见 [`Codegen全部应用与批量报告计划.md`](Codegen全部应用与批量报告计划.md)。

## 1. 已确认的现状

1. V1 只有 `applied / partial / not-written` 一条状态轴。`writtenRegionCount === 0` 会进入 `not-written`，因此“生成结果与源码一致”和“发生错误而没有应用”被混为一类。
2. 单项 Apply 的状态文案已经知道“安全区域的生成结果与源码一致，没有需要写入的变化”，但 `KtcCodegenApplyOutcome` 没有把这个原因传给批量报告；批量层还会在没有诊断时补造 `batch.apply-not-written` error。
3. 报告 DTO 目前只存在 Extension Host / Webview 内存中。新批次替换旧 DTO，关闭报告 View 后不能重新打开，Primary 也没有报告列表。
4. 报告的 JSON 链接调用 `openTextDocument + showTextDocument`，绕过了现有 `openKnownDocument → showSession → Codegen JSON View` 流程。
5. “全部应用”逐项调用 `openKnownDocument`，每份 JSON 都创建或显示一个 Codegen WebviewPanel；批次结束后没有关闭批次新建的 Panel，因此 JSON 多时会留下很多标签。

## 2. 产品决定

### 2.1 一次用户 Apply 动作对应一份报告

- 单 JSON 点击 `Apply`：写一份 `kind: "single"` 报告，包含一个 item。
- 点击 `全部应用`：写一份 `kind: "batch"` 报告，内部包含本批次全部 item。
- 批量内部的 N 次 Apply 不再各写一份 single 报告，避免报告列表被内部步骤刷满。
- 内容完全一致也写报告；它是一次成功、可审计的 Apply 结果，不是“什么都没发生”。
- 在第一次可能写盘前创建内存 report builder，在操作到达终态后只落一个最终 JSON；异常终止也尽量形成 `error` 报告。

### 2.2 报告存储目录

固定写入当前工作区：

```text
.phoenix/reports/codegen/
```

报告只保存结构化摘要、相对路径、计数、诊断和定位，不保存源码正文、生成 artifact 正文、表格草稿或剪贴板内容。

单根工作区直接写入该根。多根工作区中，single 报告写入 JSON 所属根；batch 报告写入用户触发 Primary 所属根，并在 item 中记录 `workspaceFolder` 与工作区相对路径。不能为了方便重新打开而把个人主目录绝对路径写入持久报告。

### 2.3 文件名规则

格式：

```text
<UTC时间>__<kind>__<subject>__<reportId前8位>.json
```

示例：

```text
2026-07-20T13-02-45-123Z__single__PNXCombinedCurveParam__8f3a2c1d.json
2026-07-20T13-05-10-456Z__batch__11-json__5b21d94a.json
```

规则：

- UTC 时间使用 `YYYY-MM-DDTHH-mm-ss-SSSZ`，避免 Windows 文件名中的冒号，并保持文件名字典序等于时间顺序。
- `kind` 只能是 `single` 或 `batch`。
- single 的 `subject` 来自 JSON 基础文件名，去除 `.json` 后只保留可移植字符；batch 使用 `<数量>-json`。
- `reportId` 使用 UUID；文件名只取前 8 位防同毫秒重名，JSON 内保留完整值。
- 写盘使用同目录临时文件、复读 schema 校验和原子 rename；临时文件不进入报告列表。

### 2.4 必需元数据

每份报告至少包含：

```jsonc
{
  "kind": "kt.codegen.apply-report",
  "schemaVersion": 1,
  "reportId": "完整 UUID",
  "applyKind": "single | batch",
  "startedAt": "ISO-8601 UTC",
  "finishedAt": "ISO-8601 UTC",
  "health": "success | warning | error",
  "change": "updated | unchanged | not-applied | partial",
  "summary": {},
  "items": []
}
```

`schemaVersion + reportId + startedAt` 是列表加载和去重的硬门禁；缺失、重复、未来 schema 或路径越界的报告不得直接进入 View。

## 3. 状态与标签改进

### 3.1 拆成两条正交状态轴

不再用“未写入”同时表达健康度和变化结果。

| 维度 | 值 | 用户文案 |
|---|---|---|
| `health` | `success` | 正常 |
| `health` | `warning` | 有警告 |
| `health` | `error` | 有错误 |
| `change` | `updated` | 已更新 |
| `change` | `unchanged` | 内容一致 |
| `change` | `not-applied` | 未应用 |
| `change` | `partial` | 部分更新 |

组合示例：

- `正常 · 已更新`：有真实源码变化，零 warning/error。
- `正常 · 内容一致`：Apply 成功完成，生成结果与现有源码一致；使用成功色，不再使用红色。
- `有警告 · 已更新`：源码已更新，但例如 receipt 写入失败。
- `有错误 · 部分更新`：安全区域已更新，其他区域被错误阻止。
- `有错误 · 未应用`：预检、读取、编码、并发校验或写盘失败，没有源码变化。

### 3.2 报告表格与汇总

- 原“状态”列拆为“结果”和“源码变化”两列，分别显示上述标签。
- 汇总第一组显示 `正常 / 有警告 / 有错误`；第二组显示 `已更新 / 内容一致 / 部分更新 / 未应用`。
- `内容一致`不计入错误、不生成 `batch.apply-not-written` 诊断，也不把 Primary 总状态染成 error。
- 保留修改文件数、写入区域数作为事实列，但不能再用零值推断失败。
- item 增加稳定 `reasonCode`，至少区分 `content-unchanged`、`no-artifact`、`preflight-blocked`、`apply-blocked`、`write-failed` 和 `receipt-warning`。
- 汇总标签采用紧凑 checkbox，只在 Webview 前端过滤运行明细和问题列表；选中具体 JSON 后标签转为只读并绕过先前筛选，返回“全部 JSON”时恢复筛选。
- JSON Combo 的选项前置显示“健康度 · 源码变化”，相邻上一个/下一个按钮包含“全部 JSON”并首尾循环，便于快速定位异常项。

## 4. Primary 报告列表

Primary 新增可折叠的“应用报告”区，默认放在“JSON 配置”之后：

- 标题显示磁盘有效报告总数；首屏按 `startedAt` 倒序显示最近 20 份。
- 每行显示时间、单次/批量、对象或 JSON 数量、健康标签和变化标签。
- 点击一行读取并验证对应 JSON，再复用 `Codegen 全部应用报告` View 展示。
- 提供“查看最新报告”和“打开报告目录”；清理/删除操作必须显式确认，不在首轮静默自动删除。
- 新 Apply 完成后增量刷新列表，不要求重新扫描 Codegen JSON。
- 文件损坏、schema 不支持或引用路径已经移动时，在列表中显示“无法读取/路径已变化”，不让整个列表加载失败。

首版可以只加载最近 100 个合法文件，列表只渲染最近 20 个；先观察真实增长速度，再决定保留上限，不在没有用户确认时自动删除历史报告。

## 5. 报告中的 JSON 导航

- JSON 名称和“在 Codegen View 中打开”按钮不得再调用普通文本编辑器。
- 报告 Controller 只负责验证当前报告中的 item identity，然后通过注入的 Host callback 请求打开。
- Workspace Controller 使用现有 `openKnownDocument`：已有 Codegen View 时 reveal；只有 session 时显示该 session；没有 session 时按发现规则安全加载并创建 Codegen View。
- 持久报告只保存 `workspaceFolder + jsonRelativePath`；Host 在当前工作区内重新解析并检查仍是已发现的 Codegen JSON，禁止报告文件构造任意绝对路径。
- 问题位置链接仍打开源码编辑器并定位行；JSON 配置链接与源码问题链接保持不同语义和按钮文案。

## 6. 批量执行时的 JSON View 生命周期

目标不是“批量打开后再全部关闭”，而是批量过程默认不创建这些 Panel。

### 6.1 正确方案

- 将“确保 Host session 存在”和“显示 Codegen View”从当前 `openKnownDocument` 流程中拆开。
- Primary 或报告点击 JSON 时调用 `ensureSession + showSession`。
- “全部应用”调用 `ensureSession({ reveal: false, owner: "batch" })`，在后台串行 Preflight / Apply，不创建或激活 JSON WebviewPanel。
- 批次开始前已经由用户打开的 View 保持原样；批次不得关闭、替换或改变其 dirty 草稿。
- 批次结束后释放只由 batch 创建且 clean、无冲突、无运行任务的临时 session；用户原有 session 和 View 保留。
- 报告点击某项时再创建或 reveal 对应 Codegen View，用户可以针对异常项继续检查。

### 6.2 过渡保护

如果后台 session 拆分不能一次完成，过渡版本必须记录 `openAtBatchStart` 与 `createdByBatch`：批次结束只关闭由本批次新建且 clean 的 Panel，绝不关闭用户原先打开、dirty 或外部冲突的 View。该过渡方案完成后仍应继续收敛到“不创建 Panel”。

同时修改确认文案：从“将依次打开 N 个 JSON View”改为“将在后台依次处理 N 份 JSON；完成后可从报告打开需要检查的 JSON”。

## 7. 建议实现顺序

### Phase A：结果契约与标签

1. 扩展 `KtcCodegenApplyOutcome`，显式返回 `health / change / reasonCode`，不能继续由 `writtenRegionCount === 0` 猜测结果。
2. 单次与批量共用同一结果归并函数。
3. 更新报告 View 的结果列、变化列、汇总卡和颜色。
4. 删除正常一致时补造的 error。

### Phase B：持久报告与 Primary 列表

1. 新增 UI-neutral report schema、解析校验、文件名生成和排序测试。
2. 新增 Host report store，写入 `.phoenix/reports/codegen/`，使用临时文件 + 原子替换。
3. single 与 batch 都在用户 Apply 动作结束后写一份最终报告。
4. Primary ViewModel 加入 report summaries，并新增“应用报告”区及打开消息。
5. 报告 View 支持读取已保存 JSON，关闭后可从 Primary 重新打开。

### Phase C：导航与 View 收敛

1. 报告 JSON 链接改走 Workspace Controller 的 Codegen View callback。
2. 拆分 `ensureSession` 与 `showSession`，批量默认 headless。
3. 释放 batch-owned 临时 session，保留用户原有 View。
4. 更新批量确认文案与人工验收。

## 8. 自动验证要求

- `success + unchanged` 显示“正常 · 内容一致”，error 数量为 0。
- `error + not-applied` 显示“有错误 · 未应用”，不能与一致项混淆。
- single 一次 Apply 只写一份报告；batch N 项仍只写一份 batch 报告。
- 文件名在 Windows/macOS/Linux 均合法，字典序按时间稳定；同毫秒不会覆盖。
- 报告写入失败不反向伪装源码 Apply 失败，但产生明确 warning 并保留 UI 内存报告。
- store 拒绝损坏 schema、重复 reportId、目录穿越、绝对路径和 symlink 越界。
- Primary 列表按时间倒序，单个损坏文件不阻断其他报告。
- 报告 JSON 点击调用 Codegen View callback；伪造 item/path 消息被拒绝。
- 批量处理 N 份未打开 JSON 后，新增 Codegen Panel 数量为 0。
- 批量前用户已打开的 View、active 状态、dirty 草稿和冲突状态不被关闭或覆盖。

## 9. 人工验收

- 对内容已经一致的 JSON 执行 Apply：报告显示“正常 · 内容一致”，没有红色“未写入”。
- 制造预检错误且零写入：显示“有错误 · 未应用”，问题列表可定位。
- 分别执行 single 和 batch：磁盘各新增一份符合命名规则的 JSON。
- 关闭报告 View，从 Primary“应用报告”列表重新打开，内容与原报告一致。
- 从报告点击 JSON：打开或定位到 `文件名 · Codegen` View，不打开普通 JSON 文本编辑器。
- 对 10 份以上 JSON 执行“全部应用”：批次过程不产生 10 个新标签；用户原先打开的 View 保留。
- 在深色、浅色和窄窗口检查双标签、报告列表及问题导航。

## 10. 本计划明确不包含

- 跨 JSON 全量预检屏障、Region 冲突分析和跨项事务。
- 取消协议、失败停止策略与独立批次 DiagnosticCollection。
- 在报告 JSON 中保存源码、生成代码、完整 artifact 或未保存表格草稿。
- 未经确认自动删除全部历史报告。

## 11. 实施回执

- [x] Apply outcome 与报告改为 `health + change + reasonCode`，正常零写入显示“正常 · 内容一致”。
- [x] single 一次用户 Apply 写一份 single 报告；全部应用只写一份 batch 报告。
- [x] `.phoenix/reports/codegen/` 使用规则文件名、工作区相对路径、严格 schema、临时文件复读与原子 rename。
- [x] Primary 新增“应用报告”列表、重新打开和打开报告目录入口。
- [x] 报告 JSON 链接通过 Workspace Controller 打开/定位 Codegen View，源码问题仍定位文本编辑器。
- [x] 批量使用后台 session；完成后释放 batch-owned clean session，不创建 JSON Panel，不关闭用户原有 View。
- [x] 真实 Extension Host 人工点检通过：内容一致标签、single/batch 报告落盘、Primary 历史重开、Codegen View 导航、批量无额外标签、用户原有 View 保留、部分更新错误状态和顶层 schema 字段均已确认。

自动验证回执：107 个测试文件、539 项通过；Extension TypeScript 检查通过；140 个源码文件、24 个纯依赖图和 13 个 View Root 的架构门禁通过；69 份 Markdown 分类与链接通过；Extension 构建与同级 Wing 联合准备通过。
