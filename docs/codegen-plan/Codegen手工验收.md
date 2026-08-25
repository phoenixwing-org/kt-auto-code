# Codegen 手工验收

这份清单面向快速原型的运行态验证。每次启动都会把 tracked 模板复制到新的系统临时目录；保存 JSON、删除 CSV、修改源码都不会污染仓库。

当前阶段记录（2026-07-17）：用户已确认 Checkpoint A、B、C、D 测试 OK，并确认“真实 Apply”核心路径 OK。Checkpoint D 使用 `PNXCombinedCurveParam.json` 验证，外部修改后正确显示“外部文件已变更 · 请重新加载或保存时处理”。E、F 继续作为回归 TODO；Apply 核心成功不等于候选取消、Problems 定位等整个 Checkpoint E 已通过。

## 启动

在仓库根目录执行：

```bash
pnpm ext:launch:codegen
```

终端会打印临时工作区路径。确认新窗口标题含 `[Extension Development Host]`，然后打开 KT Auto Code → 自动代码。

如果只想准备一份临时数据、不启动新窗口，可以执行 `pnpm ext:prepare:codegen`；终端会输出 `CODEGEN_FIXTURE_PATH=...`。

准备时会在临时目录的 `.phoenix/codegen-qa-baseline.json` 保存源码总数与两份控制符源码的字节指纹，并生成可续填的 `.phoenix/codegen-qa-report.json`。它们被 Codegen 扫描排除，只用于验收；结构参考 `docs/codegen-plan/KtCodegenQaBaseline.example.json` 和 `CodegenManualQaReport.example.json`。终端同时打印验证命令与报告路径。

启动器还会在临时目录生成 1200 个无控制标记的小 `.cpp` 文件，用于观察首次候选扫描进度和点击取消；它们不属于仓库 fixture。

## 查看和记录进度

不需要手工编辑报告 JSON。随时查看当前进度和下一项：

```bash
pnpm ext:report:codegen -- <临时工作区>
```

完成一个界面 checkpoint 后记录结果；失败也可以记录，修复后再改为 passed：

```bash
pnpm ext:report:codegen -- <临时工作区> --checkpoint B --status passed --note "两个标签切换正常"
pnpm ext:report:codegen -- <临时工作区> --checkpoint C --status failed --note "保存后需要重开确认"
```

门禁不会把机器检查冒充人工确认：A/C/E 必须先运行各自的 `ext:verify:codegen`；A 还必须确认已经复制运行诊断，F 必须记录实际点检的深色和浅色主题。例如：

```bash
pnpm ext:report:codegen -- <临时工作区> --checkpoint A --status passed --diagnostics-copied --vscode-version "1.xx"
pnpm ext:report:codegen -- <临时工作区> --checkpoint F --status passed --dark-theme "Dark+" --light-theme "Light+" --high-contrast-theme "High Contrast"
```

A–F 的人工状态和 A/C/E verifier 必须同时通过，报告整体状态才会变为 `passed`；任何后续机器复验失败都会重新打开对应门禁。

## Checkpoint A：首次发现与 CSV（约 5 分钟）

进入“自动代码”后先不要点击 JSON。

预期：

- 左侧最终显示 5 份 JSON：根目录 `PNXWidgetParam.json`、嵌套 `KtCourseGuardParam.json`、零行 `EmptyParam.json`、自动生成的 `PNXLegacyPanelParam.json`、已有的 `PNXConflictParam.json`。
- “JSON 配置”有独立标题和数量，位于“控制符目录”Block 之前；点击标题可收缩，列表最多显示 5 行，更多文件只在 Block 内滚动，点击文件不会改变列表顺序。
- 折叠“JSON 配置 / 控制符目录 / 控制符候选”中的任意 Block，并把 JSON 或控制符列表滚到中部；点击控制符 `⧉` 输出并复制后，外层页面、列表位置和三个折叠状态都不得跳动。
- 在两份已打开 JSON View 之间切换时，Primary 只改变当前 JSON 的选中样式，不自动展开/收起 Block，也不强制把当前行滚动到页面其他位置。
- `data/not-codegen.json` 不进入列表。
- 右侧不会自动打开任何 Codegen View。
- `legacy/PNXLegacyPanelParam.csv` 在成功转换并复读后被删除，同名 JSON 出现。
- `legacy/PNXConflictParam.csv` 因同名 JSON 内容不同而保留；已有 JSON 的 `Existing JSON Value` 不被覆盖。
- 状态文字包含“本会话自动转换 1；当前保留冲突/失败 CSV 1”；后续 watcher 刷新不会丢掉本会话转换计数。

工具界面右上角 `…` 应按工具条顺序显示“打开 JSON / 导入 CSV / 全部应用 / 刷新列表 / 扫描候选源码 / 复制运行诊断”，并带有对应的 VS Code Product Icon。点击最后一项后，粘贴内容应以 `kt.codegen.runtime-diagnostics` 开头并显示 5 份文档；诊断不包含表格单元格和源码内容，Primary 工具条也不再显示重复的诊断图标。
字段结构参考 `docs/codegen-plan/KtCodegenRuntimeDiagnostics.example.json`。

完成本 checkpoint 后执行：

```bash
pnpm ext:verify:codegen -- <临时工作区> --checkpoint-a
```

预期同时通过 5 份 JSON 协议、安全转换删除和冲突两边保留三项检查；命令会把 `verifierPassed` 写入报告，但 Checkpoint A 的人工 `status` 仍保持 `pending`，需要完成界面观察后手工确认。

超大配置目录保护：同一个 Workspace Folder 中 JSON 或 CSV 任一类型超过 300 份时，自动发现应明确提示缩小工作区或使用“打开 JSON…”，不得显示不完整列表。

## Checkpoint B：一份 JSON 一个 View（约 5 分钟）

1. 点击 `PNXWidgetParam.json`，确认只在当前编辑区打开这一个 View，不创建并列 Split。
2. 再点击 `KtCourseGuardParam.json`，确认在同一编辑区打开第二个标签。
3. 切换两个编辑标签。

预期：

- 重复点击同一 JSON 只定位已有 View，不创建重复标签。
- 左侧 Prefix/Middle/Namespace/Append 跟随活动 View 切换。
- JSON 列表分别显示“当前”和“已开”。

## Checkpoint C：整表编辑、Save 与 Revert（约 8 分钟）

在 `PNXWidgetParam.json`：

1. 修改一个单元格，执行 Duplicate、Move、Sort 或 Delete 中至少两个动作。
2. 首次修改会立即交换一份整表草稿；后续连续输入不出现逐单元格消息，停止输入约 600ms 后再同步。
3. 修改左侧 Prefix 或 Namespace，确认当前编辑标题仍指向同一文档。
4. 点击“保存 JSON”，再从 Explorer 打开原始 JSON，确认表格和属性一起写入。
5. 再做修改，点击“还原”，确认表格和左侧属性回到磁盘 checkpoint。

预期：dirty 期间右侧标签有 `●`，列表显示“未保存”；保存或还原后清除，Table 状态栏保留可读的“已保存/已还原”结果而不是被 checkpoint 重绘立即清空。

另打开 `EmptyParam.json`，确认显示零行空态；点击“插入”后出现第一行，并可正常保存。

完成两份 JSON 保存后执行：

```bash
pnpm ext:verify:codegen -- <临时工作区> --checkpoint-c
```

预期两份 JSON 都和准备时的字节指纹不同；根字段和 `headers` 顺序保持不变，并统一为 4 空格格式。命令只证明写盘与布局，不代替 dirty、状态文字和 Revert 的人工观察。

## Checkpoint D：外部冲突（约 8 分钟）

1. 在 Codegen View 内先制造未保存修改并等待 1 秒。
2. 从 Explorer 用普通 JSON 文本编辑器修改同一文件的 `NameSpace` 并保存。
3. 回到 Codegen View。

预期：

- 标签出现 `⚠`，左侧显示“外部变更”，当前内存草稿不被覆盖。
- “保存 JSON”要求选择“从磁盘重新加载”或“覆盖保存”；取消时两边内容都保留。
- “还原”会明确询问是否放弃草稿并从磁盘加载。

随后在 clean 状态从文本编辑器再次修改 JSON，预期 Codegen View 自动 reload。删除该 JSON 时，列表显示“磁盘已删除”，保存只允许明确重新创建。

可选异常点检：在 clean 状态把文件临时改成无效 JSON，或短暂换成无法解码的二进制内容。预期 View 保留最后一次有效内存内容，同时显示外部冲突和“外部 JSON 无法加载”；修复磁盘 JSON 后会恢复自动加载。

## Checkpoint E：候选、取消、预检与控制符（约 10 分钟）

1. 点击“扫描候选源码”，首次扫描期间按钮变为“取消候选扫描”；尝试取消一次。
2. 再次扫描到完成。
3. 预期索引约 1202 个源码文件，但候选列表只有 `src/PNXWidget.cpp` 与 `src/KtCourseGuard.cpp`。
   “控制符候选（工作区级）”标题可独立收缩，候选较多时只滚动内部列表。
   先在 VS Code 用户设置中启用 `workbench.editor.enablePreview`，再点击候选：应以斜体 preview 标签打开并定位第一条 START/END，全部控制符行显示主题黄色高亮；未编辑时点击另一候选替换旧预览，编辑过或双击固定的标签由 VS Code 保留。若特意关闭该全局设置，另测插件内回退：Auto Code 只替换自己刚打开且未修改、未固定的上一普通候选，不修改用户设置。
4. 打开 `PNXWidgetParam.json`，点击“预检”。
   首次预检期间可修改任一 `bulk-source/*.cpp`，预期当前预检自动取消并提示源码已变化；随后重新执行。
   取消后旧候选列表应立即清空，重扫完成前不得回填被取消任务的旧结果。
5. 在 Primary 的“控制符目录”切换命中/未闭合/未命中/全部以及范围 Combo；JSON View 不再重复显示这份目录。“选择工具”和“展开缺失模板”均不再显示，行与分组 checkbox 是选择入口。取消 checkbox 后只原位更新勾选和计数，当前列表、焦点、Tree 展开和滚动位置不得跳动；再次点击筛选标签时才重新投影列表。
   当前 JSON 的 Prefix/Middle/Namespace/Append 收拢在“当前配置”Block；Header 显示单行省略的 JSON 文件名及“类名 · 行数 · 当前编辑 View”，点击可收起，切换 JSON 或 Host snapshot 不重置折叠状态。
6. 展开当前 JSON 页面下方“预检结果”Block，切换命中/问题/全部；左侧选择命中或问题，右侧显示详情。左栏默认隐藏完整路径，开启“显示路径”后才展开完整位置；拖动中间 separator 并切换/重开 JSON View，比例应恢复。右详情 sticky 后尽量占满顶部工具栏下方的可见高度，命中详情预览 Artifact，“打开位置”定位源码；结构化 missing-end 可在右详情复制 END，普通/旧诊断不允许从 message 猜 END。
7. 点击“Apply”；也可先清掉/失效缓存，确认 Apply 会自动预检。
   Apply 成功或部分成功后，“预检结果”仍应保留刚才的命中、Artifact 和问题，并显示“已应用 · 需重新预检”；再次点击 Apply 必须先产生新预检，不能复用写入前旧计划。修改参数、控制符选择或源码后，旧结果可继续回看，但状态应变为“结果已过期 · 需重新预检”。
8. 将 JSON View 滚动到页面底部，确认顶部文档栏仍固定可见；参数表和预检结果从其下方滚过，页面仍只有一个纵向滚动边界。

预期：候选扫描、预检与 Apply 的完成摘要均包含扫描/命中/写入计数和从用户动作开始计算的耗时。`ready + artifacts=0` 的 Target 不占用默认 Output；非零产物、`scaffold`、`unsupported` 和诊断仍保留。Apply 成功后只用 `[Codegen][Apply][File]` 按文件名输出一行及区域数，不输出逐区域绝对路径、字节范围或 artifact 身份；这些审计明细仍完整保存在结构化回执中，Output 最后用简短的 `[Codegen][Apply][Receipt]` 确认回执已保存。源码 Start/End 标记仍保留。预检或 Apply 的 warning/error 同时进入 Problems，点击可定位并显示黄色行背景。若在多文件 Apply 期间外部再次修改尚未写入的目标，应出现 `apply.source-changed-during-write`，此前文件回滚而第三方内容不被覆盖。

成功回执位于 `.phoenix/cache/codegen/apply-receipt-v1/`，一份 JSON 只保留最新一份。它只记录工作区相对路径、前后 sha256、编码/换行、字节数和已写区域身份，不保存源码正文；只有源码事务成功后才写入。回执落盘失败不会撤销已经成功的源码事务，而会以 `apply.receipt-write-failed` warning 同时进入 Output 和 Problems。
单选模式在勾选另一项及页面重绘后仍保持；只开关单选模式不会使已有预检缓存失效，真正改变控制符选择才会失效。
Primary 控制符目录在 compact 限高内独立滚动；JSON View 预检左列表不得建立内部纵向滚动，右详情 sticky 随整页滚动并在 Block 底部停止。只有详情中的代码/Artifact 预览允许在过长时局部滚动，详情标题、摘要和动作必须保持可见。窄窗口不能重新出现控制符目录或上下独立纵滚。

Problems 定位点检：在临时工作区中暂时删除一个 `PNXWidget.cpp` 的 `END KEVIN CAA WIZARD SECTION` 行，再预检。预期 Problems 出现 `marker.missing-end`，点击后打开该源码并以黄色背景定位 Start 行；随后撤销该临时修改并重新预检。

反向边界点检：只删除 START、保留对应 END，再预检。该问题内部仍属于 `marker.orphan-end`，但 Primary 与缺 END 的 `marker.missing-end` 统一显示“未闭合”，不得落入普通“未命中”。

完成预检和真实 Apply 后执行：

```bash
pnpm ext:verify:codegen -- <临时工作区> --checkpoint-e
```

预期 Marker Index、至少一份 Preflight Cache 类型正确；至少一份含控制符源码的 sha256 已改变，且每份源码 Start/End 数量仍配对。验证器还会读取 Apply Receipt，确认其 Apply 前指纹等于 fixture 基线、Apply 后指纹等于当前磁盘字节、文件属于控制符源码，并核对 `fileCount`、`regionCount` 与每个 `region/artifact/block/line` 明细。这样普通手工改动不能冒充 Apply 成功。命令只回写机器验证结果，不会冒充人工界面验收；Apply 前的基线检查省略 `--checkpoint-e` 即可。

边界错误回归：若预检同时包含 `marker.missing-end` / `marker.orphan-end` 和其他完整控制块，点击 Apply 应显示“部分完成”，只写入完整区域，错误块保持原文并继续列在 Problems。其他模型、Renderer、Artifact、指纹或范围错误仍应整份阻止，不能借部分 Apply 绕过。

2026-07-19 真实工作区回执：用户确认控制符缺失时，预检与 Apply 的错误提示正常，错误块未阻断其他合法区域修改；手工补齐缺失控制符后再次 Apply 成功且诊断归零。该回执完成了边界错误隔离和修复后重试闭环，不代表其他 fail-closed 错误分类已全部通过人工验证。

2026-07-19 真实 Host 补充回执：全局 Preview 开启后的候选斜体和 A → B 替换通过；`PNXCombinedCurveParam.json` 的筛选、checkbox、单项输出和复制真实内容通过；缺失 END 的 Primary“未闭合”呈现通过；浅色主题的滚动条、sticky、黄色高亮和焦点框通过；高对比主题的 separator、checkbox、按钮焦点和滚动条可见性通过。缺失 START 的 `marker.orphan-end` 反向边界仍须独立点检。

超大工程保护：当前 scope 超过 5000 个源码文件时，扫描应明确要求通过工作集或 Ignore 缩小范围，不得把截断结果显示为成功预检。

## Checkpoint F：主题与窄窗口（约 5 分钟）

分别切换一个 VS Code 深色主题和浅色主题，并把编辑区缩窄到约 760px。

检查：

- 表头、选中行、输入框、下拉框、焦点框和状态文字在两种主题下可读。
- 窄窗口把 View toolbar 换行并保留全部动作；表格及其工具栏水平滚动，而不是压坏17列或裁掉按钮。
- 空列表、扫描中、取消、冲突和保存失败均有文字状态，不只依赖颜色。

## 可选 Checkpoint G：多根工作区（约 5 分钟）

在 Extension Host 中临时“将文件夹添加到工作区”，第二个文件夹放一份有效 Codegen JSON 和一份含控制符源码。

预期：列表自动出现第二根 JSON，不自动打开；候选路径带根目录名前缀；点击第二根 JSON 后，预检缓存写入第二根自己的 `.phoenix/cache/codegen`。移除第二根后会自动重扫；仍打开或 dirty 的 View 继续可见，关闭且 clean 的旧会话不再留在左侧列表。

## 回报问题

优先使用 `pnpm ext:report:codegen` 续填临时工作区已经生成的 `.phoenix/codegen-qa-report.json`；也可以复制 [CodegenManualQaReport.example.json](CodegenManualQaReport.example.json)。填写 VS Code 版本、主题、A–F 状态和问题备注后一起回传。目标覆盖及哪些结论必须人工证明，见 [CodegenAcceptanceCoverage.json](CodegenAcceptanceCoverage.json)。

出现异常时请提供：

1. 当前 checkpoint 与操作序号。
2. 工具界面右上角 `…` → “复制运行诊断”复制的内容。
3. KT Auto Code Output 中相关几行。
4. 截图；若是主题问题，请附主题名称。

不要提供业务工程源码。诊断设计上只包含路径、计数、revision 和状态，不包含 JSON 表格内容或源码内容。
