# KT Auto Code 当前路线

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-19

## 已完成基线

- Code、CAD 两个扩展可以独立 typecheck、打包为 VSIX，并由制品检查验证必要文件。
- 自动测试覆盖纯核心、宿主 adapter、Codegen 文档模型、事务与回归场景；精确数量由 CI 结果维护，不作为源码断言。
- Wing 依赖均锁定 Registry 0.4.2；manifest、override 与 lockfile 的本地路径回退已被 `verify:wing-dependencies` 阻止。Auto Code 直接消费 Registry 内的 Codegen、Workspace Schema 和纯能力契约 fixture，不再保留 Apply 契约副本。
- 0.4 Block 工作流、Codegen 预检/Apply 与共享 workset 已进入稳定基线；旧实施清单保留为历史证据。

## 当前优先级

1. 将字符串型架构检查升级为 AST/import graph，固化 pure core、Extension Host 与 Webview 的依赖方向。
2. 与 Wing、Desk 共享 Analyze/Apply/Schema golden fixtures，避免宿主用自己的样例解释同一协议。
3. 真实 Extension Host 的打开、预览、冲突、Apply、保存复读和失败回滚已进入自动 smoke；继续补齐浅色、深色、高对比、取消和 VSIX 安装的人工视觉矩阵。
4. 从 P1 去重队列提炼两个无 UI 能力；优先 workset/ignore/path 与 encoding/file-core，不迁移 VS Code 命令或 Webview 状态。
5. 保持双 VSIX 可复现，并在 Wing 升级时先运行 Registry 防回退、全测和制品门禁。
6. Codegen `全部应用` V1 已落地：一次确认后冻结当前 JSON 列表，逐个打开 View，串行 Preflight → Apply，并用 Primary/View 遮罩锁定 Auto Code 操作；单份错误继续后续项，最终输出简短总计并自动新开一次性轻量结构化报告。全量预检屏障、跨 JSON 冲突、独立批次 Problems、取消与可重建完整报告保留为 2.0，见 `codegen-plan/Codegen全部应用与批量报告计划.md`。

## 已完成第一波：Codegen 控制符目录与模板日志

来源：旧 VB 程序可以输出全部控制文本，供新建源码尚无控制符时手工复制，也可用于排查“为什么 Apply 写不进去”。该能力作为显式辅助功能恢复，但不能把正常的未命中重新变成 warning。

实现状态（2026-07-18）：Auto 内部高层 `ktc-codegen-control-panel` 已由 Primary `compact` 与 JSON View `full` 两处消费，内部只保留一个 `ktc-codegen-control-catalog`；full 形态才装配 View 专属预检结果。Host session 是选择、单选与“展开缺失模板”的唯一真源，命中/未命中/已选/类型范围属于各 Webview 的本地显示筛选。单项和“输出筛选并复制”只发送结构化语义命令，Host 校验可见 blockKeys、按 legacy 顺序去重，再用当前 session 的 Wing Analyze/Renderer 生成真实完整 artifact。控制符 DTO、ViewModel 与消息状态机已经从 `index.ts` 提炼到 UI-neutral `controlViewModel.ts` / `controlSessionController.ts`，总 Controller 只保留 Host 导航、日志、剪贴板和发布适配。

### 交互决定

- 控制符工具栏增加会话级 checkbox：`展开缺失模板`，默认关闭，不写入 Codegen JSON，也不作为全局设置。checkbox 只表达持续显示状态，不承担一次性日志命令。
- 勾选后只在当前活动 JSON 中，为“已选且预检未命中”的控制符展开精确 Start/End；已命中项继续显示命中数量和源码定位，不重复展开模板。
- 高频第一行只做显示筛选：状态为命中/未命中/已选/全部，范围为全部类型/C++ only/Field Code；筛选不得修改 Preflight/Apply checkbox。
- 工具栏主动作是 `输出筛选并复制 (N)`：只输出当前可见 block，不要求用户先改勾选范围。全选、全不选、选中/取消当前筛选和单选收进低频“选择工具”。
- 每个控制符行使用一个 `⧉` 动作按钮，tooltip/aria-label 明确“输出〈友好标题〉控制块到日志并复制可粘贴源码”；它只处理该 block × 当前 Param 的去重 classId，并自动显示既有 `KT Auto Code` Output Channel。
- 行首现有 checkbox 继续只表示“是否参与 Preflight/Apply”，不能复用成日志范围；选择状态、缺失模板显示状态和日志动作三种语义保持分离。
- 日志保留带 legacyId/blockKey/classId 的诊断标题；剪贴板只保留源码块。单项行不再堆第二个复制图标，`⧉` 同时完成两件事。
- 首版不自动插入源码、不猜测插入位置、不生成工作区 `.txt` 文件。将来若做自动插入，必须另有 target/anchor 契约、diff 预览和单独确认，不能复用本 TODO 暗中写盘。

### 两处消费与 Web Component 决定

- Primary 与 JSON View 都消费高层 `ktc-codegen-control-panel`。Primary 使用 `compact`，只显示共享 catalog；JSON View 使用 `full`，在同一组件内组合 catalog 与预检/诊断/Artifact 预览。
- catalog 实例在切换右侧命中/问题/全部时保持复用，不能重置左侧本地筛选。两处不得复制 32 项 DOM、样式和事件逻辑。
- 两个 Webview 位于不同 Realm，不能共享组件实例。Host 的 `kt.codegen.control-view-model` / 文档 session 仍是状态真源；任一处改变选择或显示状态后由 Host 更新 session 并广播新快照，另一处同步刷新。
- Web Component 只接收结构化 model/property，并派发标准 `CustomEvent`（选择、显示缺失、输出全部、输出单项、定位）；Primary/View 的薄 wrapper 再映射为 VS Code `postMessage`。组件不得直接调用 `acquireVsCodeApi()`、Output Channel、clipboard 或文件系统。
- 先在 Auto Code 内部落地，因为当前只是同一产品的两个消费位置。只有 Desk Tools 成为第二个产品消费者、DTO 和交互稳定后，才评估迁入 Wing browser 子路径；不能因为“用了 Web Component”就提前变成公共 API。

### 文本与数据真源

- Start/End 必须调用 Registry `@phoenix-wing/kt-codegen@0.4.2` 的 `KtCodegenMarker.createStart()` / `createEnd()`，class identity 使用当前 `KtCodegenParam` 的 Prefix/Middle 与各行 `NameSuffix`；前端不得硬编码 Kevin marker 文本。
- Primary compact 与 JSON View full 的单项/当前筛选日志动作共用同一规则：当前 JSON 已打开且 Host session 存在时，必须用该 session 的共享 `KtCodegenController` 调用 Wing Analyze/Renderer，输出包含真实参数生成代码的完整 artifact；只有没有打开 session/controller 时才允许退化为仅含 Start/End 的空框架。两处不得分别拼接正文。
- JSON View 的输出按钮必须先交换当前整表草稿、再发送与 Primary 相同的 `codegenControlOutput` 语义命令；Extension Host 依消息顺序更新 session 后统一生成并写日志，Webview 不直接拼接或持有日志实现。Primary 直接使用 Host 中同一 session，View 是否显示不改变日志服务边界。
- 单项和当前筛选输出同时复制可直接粘贴的源码块：剪贴板不得包含 `[Codegen]` 摘要或 `# legacyId` 标题；真实 artifact 沿用 Wing Renderer 的空行与 `clang-format off/on`，无 session 的空框架必须保持 `Start → 空行 → clang-format off → 空行 → #error \"Run KT Auto Code Apply to generate this block\" → 空行 → clang-format on → End`。显式 `#error` 防止首次布点后忘记执行 Apply 却静默编译通过，Apply 替换整个 marker 区域后自然消失。剪贴板由 Extension Host 写入，Webview 不直接访问 Clipboard API。
- 输出按 legacyId/blockKey → classId 稳定排序；每组包含友好标题、block key、classId、建议 target（若 Analyze artifact 可确定）、当前命中状态和两行可直接复制的标记。
- 同一 `(blockKey, classId)` 去重。没有有效参数行或协议不兼容时输出结构化原因；没有 artifact 只表示 target 暂不可建议，仍可输出由 Wing 生成的合法 Start/End，满足首次手工布点场景。
- 普通 Preflight/Apply 日志继续只显示“已找到 X 个已选控制符，共 Y 个区域”；checkbox 关闭时不得输出缺失列表，也不得发布 `marker.not-found` Problem。

### 验收门禁

- 纯 formatter 测试覆盖：缺失/已命中混合、多个 `NameSuffix`、重复 classId、无 artifact、稳定 legacy 顺序和 Windows/Unix 换行显示；全量底层能力必须覆盖 32 个 legacy block key，当前筛选/单项动作不得泄漏其它 block。
- 同一 Web Component characterization tests 必须分别挂载 `compact` / `full`，证明两处按钮、checkbox、键盘、tooltip/aria-label 与 CustomEvent payload 一致；不再分别对两份手写 DOM 做字符串断言。
- Webview 消息只传结构化语义命令；Output/clipboard 属于 Extension Host adapter，Wing 不依赖 VS Code API。
- Extension Host smoke 至少验证：默认无噪声、勾选只展示已选缺失项、单项/当前筛选 Output 范围正确、Primary 改状态后 View 同步、关闭后恢复简洁日志，以及底层全量能力覆盖 32 个 legacy block key。
- 文档与手工验收说明必须明确：这是首次布点/诊断工具，不代表 Apply 可以在没有 Start/End 配对时自动写入。

### UI Bug 收口

- [x] JSON View `full` 改为页面唯一纵向滚动：控制符目录与预检结果按内容自然撑高，不再各自强制纵滚，也不再使用固定 `44vh/58vh` 和绝对 `inset`。
- [x] 两区始终保持左右结构，中间使用可拖动、可键盘调整的 separator；20%～75% 限幅，比例经 Host `workspaceState` 持久化，不写业务 JSON。
- [x] Browser 在 1600×900、1000×650、760×480、560×420 下验证 32 行目录和 32 条结果均为 `clientHeight == scrollHeight`；560×420 页面为 `420 / 2331`，右侧宽内容为 `306 / 520` 横向滚动，左右没有纵向滚动。
- [x] 预检完成后左目录和右结果默认只显示命中；显示筛选与 Preflight/Apply 勾选语义拆开，输出只处理当前筛选。
- [ ] 深色、浅色、高对比真实 VS Code 中的滚轮、滚动条 thumb 和 Artifact 横向滚动仍由用户/真实宿主回执；详见 `codegen-plan/Codegen控制面板滚动筛选点检表.md` D 组。
- [x] 参数表的 Header 和工具位于 Wing `KtCodegenTable` Shadow DOM；Auto 已通过公开 `layout="page" + collapsible` 属性接线，不穿透私有 DOM。折叠只隐藏 table shell/statusbar，Header 和全部工具保留；每个隐藏 JSON View 依靠 `retainContextWhenHidden` 保留本地折叠状态。正式 Registry 消费仍随 Wing 后续版本发布与依赖升级闭环。

## 已完成第二个切口：Primary Codegen 页面壳

- `ktc-codegen-primary-panel` 现在拥有工具栏、活动文档摘要、四个元数据字段、JSON 配置列表、compact 控制符目录和候选源码列表；Primary 的工作区级阅读顺序固定为“JSON 配置 → 控制符目录 → 控制符候选”。它只接收 `KtcCodegenPrimaryViewModel`，并以 `ktc-codegen-primary-action` 上报语义动作。
- `sidebar/panelHtml.ts` 不再创建 Codegen 行、标签、输入框或按钮，也不再知道刷新/取消的显示规则；它只把 Host `ToolUiState` 投影为组件 model，并将 Primary 与内嵌 catalog 的 CustomEvent 映射回既有 Webview 消息协议。
- `panelHtml.ts` 从本切口前 2911 行降到 2603 行；新增 295 行产品内聚组件和 37 行纯 ViewModel 契约。行数不是最终目标，但旧总页面减少 308 行且没有把 VS Code API、文件系统或 clipboard 带入组件边界。
- characterization tests 实际挂载 Primary 组件，冻结扫描取消、文档/候选打开、元数据修改、繁忙状态、无障碍标签与 catalog model 传递；架构门禁把 `primaryViewModel.ts` 纳入纯图，把 Primary 组件/入口纳入 View Root。
- 本地 `kt-auto-code-0.5.0.vsix` 已包含 `codegen-primary-panel.js`；产物门禁验证组件 tag、统一 action 事件及 `acquireVsCodeApi()` 隔离。当前产物为 28 个文件、414,506 字节。

## 已完成第三个切口：JSON View 消息契约与纯路由

- Codegen 专属 inbound、outbound、Editor Model 和控制符消息已迁入 `editorContracts.ts`；全工具 `types.ts` 从 405 行降到 331 行，只组合并再导出该产品契约，不再定义两份消息形状。
- `editorMessageRouter.ts` 在 UI-neutral 边界按 session URI 拒绝跨文档消息，并把 transport message 收敛为 dirty、exchange、control、ready、revert、cancelPreflight、preflight 与 apply 命令。它不读取 VS Code、DOM、workspace 或领域文件。
- `editorViewController.ts` 只接收 `KtcCodegenEditorInboundMessage`，不再依赖全工具 `WebviewInboundMessage` 总表；总 Controller 只消费路由后的语义命令。
- 定向测试冻结跨会话拒绝、整表保存、带 table 的 Apply、控制符显示和无负载动作；全仓 81 个测试文件、392 项测试通过，架构门禁为 117 个生产源文件、22 个 pure graph、8 个 View root。
- 本地 VSIX 仍为 28 个文件，414,672 字节，四个发布 bundle 和组件/Registry 产物门禁通过。

## 已完成第四个切口：Editor session Presenter

- `editorSessionPresenter.ts` 通过 `KtcCodegenEditorSessionViewPort` 统一建立 Editor Model、同步标签 dirty/conflict、发布 document state、完整 model、control model 与 Problems diagnostics；Presenter 不拥有文档或控制符状态。
- 总 Controller 只在装配点把 `KtcCodegenEditorViewController` 与 `KtcCodegenProblemReporter` 映射为端口。`editorModel`、`notifyDocumentState`、`postModel`、`postEditor`、`updateControlPanel` 五组输出方法已从 `index.ts` 删除。
- Presenter characterization tests 使用 fake port 验证 show、document state、model/problems、controls 和普通 Editor message 的输出次序与 payload，不需要启动 VS Code 或读取文件。
- `Codegen/index.ts` 从本切口前 1,460 行降到 **1,418** 行；全仓 82 个测试文件、396 项测试通过，架构门禁为 118 个生产源文件、22 个 pure graph、9 个 View root。
- 本地 VSIX 仍为 28 个文件、414,940 字节，发布 bundle 和产物门禁通过。

## 已完成第五个切口：真实控制块日志与剪贴板

- Primary compact 与 JSON View full 继续只派发同一个 `codegenControlOutput`；共享 `controlSessionController` 用 Host 当前文档 session 调用 Wing Analyze/Renderer，日志正文不再只是相邻的 Start/End。
- JSON View 点击输出前先交换仍在 600ms 防抖窗口内的整表草稿，再发输出命令；Host 按同一消息通道接收最新 table 后生成，View 不持有第二套 Renderer 或日志实现。
- 单项与筛选输出动作同时写入 Output 与系统剪贴板。日志保留定位标题，剪贴板仅含可粘贴源码；无 session 的空框架包含真实空行、`clang-format off/on` 和显式 `#error`，防止忘记 Apply 后静默编译通过。
- 定向行为测试为 5 个文件、38 项，包含全部 32 个 legacy block 均产生真实 Renderer artifact 的断言；全仓为 82 个文件、398 项。Extension typecheck、118/22/9 架构边界、Registry Wing 0.4.2 依赖门禁、57 份 Markdown 分类/链接均通过。
- 当轮本地 `kt-auto-code-0.5.0.vsix` 为 28 个文件、415,786 字节，产物门禁通过；滚动问题随后由第六个切口独立治理。

## 已完成第六个切口：控制面板筛选与单一纵向滚动

- 新增高层 `ktc-codegen-control-panel`：Primary compact 和 JSON View full 共用同一组件；catalog 负责显示筛选、选择和输出，full 外层只负责 View 专属的命中/问题/Artifact。
- 显示筛选与 Apply 勾选彻底分开。预检前默认已选，预检后左右默认命中；当前筛选输出携带可见 blockKeys，Host 过滤非法 key、去重并恢复 legacy 顺序。
- 后续按真实使用反馈把三层纵向滚动收敛为 JSON View 页面唯一纵向滚动；左右 section 自然增高，只为宽路径和 Artifact 保留局部横向滚动，Primary compact 的限定高度纵滚不受影响。
- full 面板新增 8px separator、Pointer Capture、Left/Right 键盘步进和 Host `workspaceState` 恢复。窄窗口不再转上下布局，560px 宽仍保留左右语义，右侧宽内容自己横向滚动。
- Browser 长内容夹具在 1600/1000/760/560 四档实测：32 行目录 `1261 / 1261`、32 条结果 `1852 / 1852`，面板 `1887 / 1887`，证明左右没有独立纵向滚动；页面在低高度形成唯一纵向溢出。
- 门禁结果：83 个测试文件、405 项测试；119 个生产源文件、22 个 pure graph、9 个 View root；58 份 Markdown；7 个 Wing Registry 0.4.2 引用；VSIX 28 个文件、422,617 字节。

## 已完成第七个切口：自动代码入口视觉一致性

- Primary Ribbon 不再把 `codegen` 缩写为容易与普通生成动作混淆的“生成”，入口统一显示产品名“自动代码”；工具对象、手工验收文档和 Desk Tools 保持同一名称。
- Auto Code 的表格旧图标替换为 Desk Tools `kt_codegen` 已使用的 Element Plus `Operation` 图标路径，继续通过 `currentColor` 适配 VS Code 主题。
- 图标来源与完整 MIT 许可进入扩展 `NOTICE`；契约测试同时锁定中文名称、Operation 路径特征和旧图标退出，避免两端随后再次漂移。

## 已完成第八个切口：Document session Controller

- 新增 UI-neutral `documentSessionController.ts`，集中拥有 session registry、活动 URI，以及 snapshot → Wing parse → `KtcCodegenDocumentModel` 的打开状态机；失败不会污染 registry，重复打开继续复用同一 Param。
- `Codegen/index.ts` 只把 `identity.fsPath` 适配到 `vscode.Uri.file` / `DocumentService`，并继续拥有对话框、discovered 列表、Presenter、Problems、日志和命令编排；它不再直接建立 Document Model。
- CSV 已准备 Controller、真实磁盘 fingerprint、关闭活动 View、dispose 清理和既有/new session 的 show 异常边界均由 characterization 冻结；本切口不引入并发 open 去重。
- marker、Preflight、Apply 门禁和控制符目录均未修改。责任图、自动点检与后续 Save/Revert/Editor command TODO 见 `codegen-plan/Codegen总Controller会话提炼点检表.md`。
- 自动门禁结果：88 个测试文件、431 项测试；124 个生产源文件、22 个 pure graph、9 个 View root；64 份 Markdown；7 个 Wing Registry 0.4.2 引用；Extension typecheck 通过。

## 已完成第九个切口：C++ 成员排序 Page shell

- `ktc-reorder-members-panel` 现在拥有 C++ 成员排序的 Sidebar/Detail 页面壳、长路径文件列表、三态组选择、Running 禁用、blocked/applied 展示和 Realm 本地“显示无变更”筛选；组件不调用 VS Code API。
- 纯 `reorderMembersPanelState.ts` 冻结 revision 与选择收敛：新 revision 默认 pending，同 revision 显式空选择由 Host 覆盖，同 revision 缺字段才保留本地 optimistic，并始终过滤非 pending。
- `sidebar/panelHtml.ts` 从 2604 行降到 2388 行，只把 `ToolUiState` 投影为组件 model，再将单一带 `kind` 的语义事件精确映射回既有 `run` / `reorderAction` / `reorderSelection`；扫描、确认、fingerprint、写盘与还原仍由 Extension Host Controller 拥有。
- 独立 bundle 已进入 build、watch 与 VSIX 制品门禁。Browser 夹具在 360px/280px 验证无页面横向溢出，并覆盖两种 presentation、Running、blocked、applied、Host 空选择和单行/批量 Apply 事件；责任图与后续真实主题 TODO 见[成员排序 Page shell 拆分点检](成员排序PageShell拆分点检表.md)。

## 已完成第十个切口：Editor 语义命令 Controller

- 新增 UI-neutral `editorCommandController.ts`，集中编排 ignore/control/dirty/exchange/ready/revert/cancelPreflight/preflight/apply 九类语义命令、整表三态和动作短路；VS Code、文件系统、Presenter、日志及写盘实现继续由 Host adapter 持有。
- `Codegen/index.ts` 删除 `handleEditorMessage()` 与 `acceptActionTable()` 分支状态机，从 1,500 行收敛到 1,447 行；Router 继续只做 URI/transport 分类，Domain Model 继续独占 revision、dirty、preflight 与 `stale / accepted / unchanged` 判定。
- Apply 的总计时与自动 Preflight 独立计时、无 plan 停止、stale 阻断均由 spy trace 和 source characterization 冻结；本切口不修改 Marker、Preflight、Apply、Save/Revert 或控制符行为。

## 已完成第十一个切口：关联规则选择器 Web Component

- `ktc-associated-rule-picker` 已接管原先散落在 `sidebar/panelHtml.ts` 的 Dialog DOM、Shadow DOM 样式、候选/自定义行、确认门禁、焦点以及 close/cancel/Escape；组件只接收一次性 ViewModel，并通过一个 `ktc-associated-rule-picker-action` union 事件返回 confirm/cancel。
- Sidebar adapter 继续在确认时读取最新的 `state.replace.search` / `state.replace.extraRules`，映射为既有 `appendAssociatedRules`；候选派生、同 Source 竞争、追加去重与写盘仍属于纯 Model/Extension Host，组件不访问 VS Code API、clipboard、工作区或持久状态。
- `SidebarViewProvider` 已把 `associatedRulePicker` 明确设为 transient：它不进入 durable `toolStates`，只投递给发起请求的 Ribbon 或 Module View，另一存活 View 只收到 durable 状态；后续状态更新和 Webview 重建都不会回弹旧 Dialog。
- 独立 bundle 已进入 build/watch、架构 viewRoots 与 VSIX 必需制品门禁；组件、adapter、双 View transient、全仓测试、类型检查、架构和制品检查均通过。责任图与保留点检见[关联规则选择器组件化 Baseline 点检](关联规则选择器组件化Baseline点检表.md)。

## 已完成稳定性修复：Primary 控制符复制与界面位置

- 控制符单项/筛选输出只写 Output 与 Clipboard，不再为了 Codegen 中被隐藏的通用状态区发布整份 Sidebar snapshot；成功复制不会触发 Primary 全量重绘。
- Primary 的“JSON 配置 / 控制符目录 / 控制符候选”三个 Block 分别保存用户折叠状态，JSON 与候选列表保存各自滚动位置。活动 JSON 只更新选中样式，不再在每次 Host snapshot 后调用 `scrollIntoView()` 带动外层页面。
- 共享控制符目录继续复用同一个 Web Component 实例，并额外保留 Tree 分组、“选择工具”的展开状态和 compact 列表滚动位置。状态只属于当前 Webview 生命周期，不写入业务 JSON。

## 已完成安全修复：错误区域隔离后的部分 Apply

- Auto Host 不再用全局 `plan.canApply=false` 提前阻止全部写入；Apply 投影统一交给 Wing 判断可安全写入的完整 Region/Artifact。
- Wing 只把 `marker.missing-end` / `marker.orphan-end` 视为可隔离的边界错误：错误控制块不形成 Region，完整的后续控制块仍可写入。模型、Renderer、Artifact 绑定、源码指纹、区域范围或重叠错误继续 fail-closed。
- 部分成功后回执只记录实际写入的文件/区域，原预检错误继续进入 Problems；状态和日志显示“Apply 部分完成”，同时给出写入区域数、保留错误数和耗时。

## 大型 UI 暂停后的 TODO（2026-07-18）

用户决定暂停本轮大型 UI 拆分。以下事项只登记，不在本轮继续实施；恢复目标前不得把它们悄悄并入普通修复或发布提交。

1. **关联规则真实 Browser 回执**：通过 localhost fixture 或真实 VS Code Webview 验证 430/320/280px、Tab 焦点圈、关闭后的焦点恢复、Escape、backdrop 和长候选内部滚动。本次 Browser 自动化因 `file://` URL 策略拒绝而停止；自动测试、bundle 与 VSIX 已通过，这一项是人工/真实浏览器证据缺口，不是已知产品失败。
2. **Auto Code 后续大壳**：搜索替换完整 Page shell、`Codegen/index.ts` 剩余 Host adapter，以及“全部应用 2.0 / 批量报告”继续分别立 characterization 和独立小提交；V1 已完成的逐 View 串行流程可演进但不冒充 2.0。2.0 的错误必须同时进入 Host 持有的批次报告与独立 `kt-codegen-batch` Problems，不能复用会被活动 JSON View 清空的单页集合。
3. **Desk Tools 后续大页**：Unit Tests 的 Result pane 与“全部复测”语义、FCStd Map 扫描 Controller、Assembly RowGroup/样式收口、CAA Editor 剩余 session/writeback Host 边界继续留在 Desk `doc/TODO.md`；已有 RunScope/Watchlist、FCStd panes、Assembly row、CAA Controller 不返工。
4. **Wing 后续条件项**：`KtCodegenTable` 已到首轮合理停止线；页面布局能力完成发布和 Registry 消费验证前，不为降行数继续拆。只有出现第二产品消费者或真实复用需求时，才评估公开更多 visual primitive。
5. **跨仓人工证据**：Windows NSIS 真实回执，以及 VS Code/Desk 的浅色、深色、高对比视觉矩阵继续由用户手工并行；不阻塞当前代码归档，也不追溯提高联合评分。
6. **Codegen 控制符单入口与显式修复提醒**：下一轮可把 Primary 定义为控制符目录、筛选、选择和输出的唯一入口，JSON View 只保留预检结果/Artifact/问题定位；当前已验收的 full 双栏与分隔柄在新方案点检前不删除。要增加“问题 N”控制符筛选，先让 Wing 诊断提供结构化 `blockKey/classId/boundary`，不得从英文 message 猜 block。`marker.missing-end` 只允许用户在问题行 `⋯` 中显式选择“插入编译期修复提醒”，经确认后在下一条 marker 前写入可识别的 `#error`；不得预检时自动写入，也不得自动猜测补 End，且入口不能只依赖不可发现的右键菜单。

暂停期间联合成熟度保持 **92.00 / 100**。恢复时从本 TODO 重新选择一个最小切口，不默认续跑整套大型 UI 计划。

## 已合并的旧路线

- `下一阶段实施计划.md`：已完成的 Ignore/搜索替换主体成为稳定基线，未完成 Extension Host 验收进入本路线第 3 项。
- `Codegen下一阶段实施计划.md`：已完成的预检和 Apply 不再作为未来计划；Custom Editor/真实宿主验证并入第 3 项。
- `0.4.0-Block工作流改造计划.md`：完成态 Block 改造转为历史证据。
- Codegen 各轮评分只保留当时证据，不再作为当前全工程评分。

## 边界

- Wing 是跨宿主纯算法与契约真源；本仓只拥有 VS Code Extension Host、Webview/VSIX、工作区权限和产品编排。
- Desk/Tauri 壳层和原生 CAD provider 不复制进入 Auto Code。
- 用户已于 2026-07-18 接受联合成熟度 **92.00** 作为停止线；Windows 发布态回执保留为用户手工后续项。大型 UI 拆分目标已在完成若干小切口后暂停，恢复前仍禁止向大文件加入新的领域算法或文件真相。
- 测试数量、bundle 大小和版本关系由 CI/manifest 产生，不在当前路线复制易漂移数字。
