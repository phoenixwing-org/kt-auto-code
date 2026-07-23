# KT Auto Code 当前路线

状态：current

Owner：KT Auto Code maintainers

适用版本：0.6.x

最后核验：2026-07-23

## 已完成基线

- Code、CAD 两个扩展可以独立 typecheck、打包为 VSIX，并由制品检查验证必要文件。
- 自动测试覆盖纯核心、宿主 adapter、Codegen 文档模型、事务与回归场景；精确数量由 CI 结果维护，不作为源码断言。
- Wing 依赖均锁定 Registry 0.5.0；manifest、override 与 lockfile 的本地路径回退已被 `verify:wing-dependencies` 阻止。Auto Code 直接消费 Registry 内的 Codegen、Git、Run、Workspace Schema 和纯能力契约 fixture，不再保留 Apply 契约副本。
- 0.4 Block 工作流、Codegen 预检/Apply 与共享 workset 已进入稳定基线；旧实施清单保留为历史证据。

## 2026-07-22 Codegen 当前架构真源

- Primary 与 Control 的业务 DOM、主题 token、ViewModel 和语义事件现由 Wing `@phoenix-wing/kt-codegen/ui` 提供；Auto 的 `primaryPanelEntry.ts` / `controlCatalogEntry.ts` 只注册兼容 tag，`sidebar/panelHtml.ts` / `editorHtml.ts` 只做 VS Code 消息映射。
- Auto 继续独占文档 session、`workspaceState`、Commands、Problems、Output、clipboard、文件事务、报告和 Webview 生命周期。这些是 Host adapter，不迁入 Wing。
- 已删除 Auto 私有 `primaryPanel.ts`、`controlPanel.ts`、`controlCatalog.ts`、`controlCatalogState.ts` 及对应 DOM characterization tests；共享组件行为由 Wing 测试负责，Auto 测试只冻结 import 边界、ViewModel 投影和 Host 事件映射。
- 下方第一、二、六切口记录的是迁移前的历史演进。凡与本节冲突，以本节、[产品功能归属矩阵](产品功能归属矩阵.md)和 Wing [共享能力目录](../../phoenix-wing/doc/共享能力目录.md)为准。

## 当前优先级

1. 将字符串型架构检查升级为 AST/import graph，固化 pure core、Extension Host 与 Webview 的依赖方向。
2. 与 Wing、Desk 共享 Analyze/Apply/Schema golden fixtures，避免宿主用自己的样例解释同一协议。
3. 真实 Extension Host 的打开、预览、冲突、Apply、保存复读和失败回滚已进入自动 smoke；继续补齐浅色、深色、高对比、取消和 VSIX 安装的人工视觉矩阵。
4. **[2026-07-22 已完成/裁定]** Ignore 与 workspace path 已形成双端共享；Auto glob Workset 和 Desk SQLite entries 被确认是不同产品模型，不强行统一；encoding/file-core 因尚无第二消费者不启动公共包。P1 去重队列不再保留这条伪待办。
5. 保持双 VSIX 可复现，并在 Wing 升级时先运行 Registry 防回退、全测和制品门禁。
6. Codegen `全部应用` V1 已落地：一次确认后冻结当前 JSON 列表，在后台 session 中串行 Preflight → Apply，不再铺开 JSON Panel；单份错误继续后续项。single/batch Apply 报告按规则文件名原子写入 `.phoenix/reports/codegen/`，Primary“应用报告”列表可重开；View 用结果/源码变化双轴避免把正常内容一致误报为失败，并安全进入 Codegen View 或定位问题。全量预检屏障、跨 JSON 冲突、独立批次 Problems、取消与完整 receipt 报告保留为 2.0，见 `codegen-plan/Codegen全部应用与批量报告计划.md`。
7. **[已完成：0.5.1 发布]** 0.5.1 作为 patch 公开发布：只包含既有 Codegen 流程的安全性、状态稳定性、紧凑呈现与 Wing 0.4.3 消费升级，不新增公共命令或扩展 API；KT Auto CAD 0.1.0 同步完成 Marketplace 首发，两个公开制品哈希均与本地门禁产物一致并通过人工审查。
8. **[已完成：0.5.2 发布候选]** 0.5.2 收口持久 Codegen 应用报告、Primary 历史列表、后台批量 View 生命周期、结果/变化双轴与前端筛选，并加入工作区及文件类别级 ASCII/UTF-8/GBK 编码目标；真实宿主人工点检、全量自动测试和双 VSIX 制品门禁已通过。Marketplace 发布回执未在仓库中登记，不宣称已公开发布。
9. **[已完成：0.5.3 本地发布候选]** 0.5.3 统一补齐高对比度/高对比度浅色主题下 Sidebar Primary、功能 Block、Codegen 预检及 Shadow DOM 组件的边框、标签和 hover 对比反馈；Node 22 全量门禁、Registry/并列 Wing 构建和本地 VSIX 归档已通过。Marketplace 发布未执行，保持普通主题与公共命令/API 不变。
10. **[正式候选已归档：0.6.0]** Code 模块末尾已加入 Git 与 Run 两个独立 Primary Block；共享算法和 Node adapter 位于 Wing `git-core`/`git-node`、`run-core`/`run-node`。Phoenix Wing 0.5.0 已正式发布，Auto Code 的 15 处 Wing manifest 引用与 lockfile 已精确闭环到 Registry；Node 22 全量测试、Registry 构建、并列 Wing 来源门禁、真实 Extension Host、人工功能点检与正式 VSIX 制品门禁均已通过。Marketplace 上传由用户手动执行。

## 2026-07-20 简单 TODO 收口

- **[工程配置与隐藏状态存储规则](工程配置与隐藏状态存储规则.md) / 后续审计 TODO**：工程级 `ktAutoCode.*` 配置统一写入当前 Workspace Folder 的 `.vscode/settings.json`，路径优先保存为工作区相对路径并在每次运行前基于当前 project root 重新解析为绝对路径；本机 Desk Tools 配置和默认 CAA 版本继续使用 machine-scoped 用户设置。每个工程当前选择的 CAA 版本属于可切换运行状态，可进 `workspaceState`；团队多版本矩阵以后必须用显式 target/profile 表达。0.6.0 已迁移 Run 的 `caaRelatedProjects`；其余既有 key 在后续独立审计中统一。
- 旧 CAA external editor 与 Auto CAD provider 设置会在基础扩展激活时安全迁入 `ktAutoCode.deskTools.*`：只读取用户明确配置的值，新设置始终优先，默认值不迁移，失败时继续走兼容读取。
- CAA UI 当前交接契约已改用 `service.v1.json` 动态端口，新增 Windows/macOS 联合人工验收清单，并明确区分运行中的桌面服务与无需启动窗口的 CAD 深度读取器。
- 已删除独立 CAD 连接入口遗留的 `cad-provider.svg`，VSIX 制品门禁拒绝该死资源重新进入安装包。
- Ignore Host adapter 新增自动证据：预设操作只修改打开的文本缓冲区并保持 dirty，磁盘字节不变；保存监听使用的缓存失效路径能重新读取新规则。
- 开源仓库 URL TODO 已按当前 Git remote 核实为 Gitee；extension manifest 的 repository、bugs 与 homepage 已存在，无需重复修改。
- 搜索替换已开放底层原有的“同时匹配全大写”能力，状态可随 Block 和规则档案持久；真实预览/写盘回归已追加到 Extension Host 待测试列表。
- 编码修正的 UTF-8 / GBK 默认目标在写入后立即回传 Webview，不再因旧 `toolOptions` 渲染回弹；切换后主动废弃上一目标的预检结果。
- Ignore Host 入站守卫会校验 preset/action/推荐组 ID，分析结果最多默认勾选首个安全可追加组；工作集追加会在读取磁盘配置前拒绝 dirty 的 `worksets.json`，避免以旧磁盘内容覆盖用户缓冲区。
- 头文件 ASCII、编码修正与 Ignore 同步已补齐 Controller 级取消/缺失工作区/dirty 缓冲区测试；关联规则选择器显示候选数和默认选中数，降低批量追加前的误判。
- 今天累计的跨功能人工步骤统一收录于[2026-07-20 功能修复人工点检表](2026-07-20-功能修复人工点检表.md)，自动门禁与手工回执分开记录。

## 已完成第一波：Codegen 控制符目录与模板日志

来源：旧 VB 程序可以输出全部控制文本，供新建源码尚无控制符时手工复制，也可用于排查“为什么 Apply 写不进去”。该能力作为显式辅助功能恢复，但不能把正常的未命中重新变成 warning。

历史实现状态（2026-07-19）：Auto 曾由私有 `ktc-codegen-control-panel` / `ktc-codegen-control-catalog` 承载两处 DOM。2026-07-22 已迁入 Wing `KtCodegenPrimaryPanel` / `KtCodegenControlPanel`；Host session 仍是选择真源，单项和“输出筛选并复制”仍只发送结构化语义命令，Auto 的 `controlViewModel.ts` / `controlSessionController.ts` 继续负责 VS Code 会话附加字段、legacy 顺序校验、真实 artifact 生成、日志和剪贴板。

### 交互决定

- 经真实使用反馈，Primary 的 `展开缺失模板` 与控制符目录混在一起过于啰嗦，已移除 UI；底层模板生成协议暂时保留兼容，不由 Primary 消费。
- 勾选后只在当前活动 JSON 中，为“已选且预检未命中”的控制符展开精确 Start/End；已命中项继续显示命中数量和源码定位，不重复展开模板。
- 高频第一行只做显示筛选：状态为命中/未命中/已选/全部，范围为全部类型/C++ only/Field Code；筛选不得修改 Preflight/Apply checkbox。
- 工具栏主动作是 `输出筛选并复制 (N)`：只输出当前可见 block，不要求用户先改勾选范围。经真实使用反馈，低频“选择工具”与行/分组 checkbox 重复，已删除；显示筛选恢复“全部”，选择只保留行与分组入口。
- 每个控制符行使用一个 `⧉` 动作按钮，tooltip/aria-label 明确“输出〈友好标题〉控制块到日志并复制可粘贴源码”；它只处理该 block × 当前 Param 的去重 classId，并自动显示既有 `KT Auto Code` Output Channel。
- 行首现有 checkbox 继续只表示“是否参与 Preflight/Apply”，不能复用成日志范围；选择状态与日志动作保持分离。
- 日志保留带 legacyId/blockKey/classId 的诊断标题；剪贴板只保留源码块。单项行不再堆第二个复制图标，`⧉` 同时完成两件事。
- 首版不自动插入源码、不猜测插入位置、不生成工作区 `.txt` 文件。将来若做自动插入，必须另有 target/anchor 契约、diff 预览和单独确认，不能复用本 TODO 暗中写盘。

### 两处消费与 Web Component 决定

- Primary 消费 Wing `KtCodegenPrimaryPanel`，JSON View 消费 Wing `KtCodegenControlPanel`；两者共用 `KtCodegenControlUiModel`、选择/定位事件和主题 token，不再复制 32 项业务 DOM。
- 两个 Webview 位于不同 Realm，不能共享组件实例。Host 的 `kt.codegen.control-ui-model` / 文档 session 仍是状态真源；任一处改变选择后由 Host 更新 session 并广播新快照。
- Wing Web Component 只接收结构化 model/property，并派发 `kt-codegen-primary-action`、`kt-codegen-control-selection`、`kt-codegen-control-output`、`kt-codegen-control-open` 等标准 `CustomEvent`。Auto 薄 adapter 再映射为 VS Code `postMessage`。
- `acquireVsCodeApi()`、Output Channel、clipboard、文件系统和持久状态不得进入 Wing UI；Desk 与 Auto 只共享业务组件，不强行共享宿主能力。

### 文本与数据真源

- Start/End 必须调用 Registry `@phoenix-wing/kt-codegen@0.5.0` 的 `KtCodegenMarker.createStart()` / `createEnd()`，class identity 使用当前 `KtCodegenParam` 的 Prefix/Middle 与各行 `NameSuffix`；前端不得硬编码 Kevin marker 文本。
- Primary compact 与 JSON View full 的单项/当前筛选日志动作共用同一规则：当前 JSON 已打开且 Host session 存在时，必须用该 session 的共享 `KtCodegenController` 调用 Wing Analyze/Renderer，输出包含真实参数生成代码的完整 artifact；只有没有打开 session/controller 时才允许退化为仅含 Start/End 的空框架。两处不得分别拼接正文。
- JSON View 的输出按钮必须先交换当前整表草稿、再发送与 Primary 相同的 `codegenControlOutput` 语义命令；Extension Host 依消息顺序更新 session 后统一生成并写日志，Webview 不直接拼接或持有日志实现。Primary 直接使用 Host 中同一 session，View 是否显示不改变日志服务边界。
- 单项和当前筛选输出同时复制可直接粘贴的源码块：剪贴板不得包含 `[Codegen]` 摘要或 `# legacyId` 标题；真实 artifact 沿用 Wing Renderer 的空行与 `clang-format off/on`，无 session 的空框架必须保持 `Start → 空行 → clang-format off → 空行 → #error \"Run KT Auto Code Apply to generate this block\" → 空行 → clang-format on → End`。显式 `#error` 防止首次布点后忘记执行 Apply 却静默编译通过，Apply 替换整个 marker 区域后自然消失。剪贴板由 Extension Host 写入，Webview 不直接访问 Clipboard API。
- 输出按 legacyId/blockKey → classId 稳定排序；每组包含友好标题、block key、classId、建议 target（若 Analyze artifact 可确定）、当前命中状态和两行可直接复制的标记。
- 同一 `(blockKey, classId)` 去重。没有有效参数行或协议不兼容时输出结构化原因；没有 artifact 只表示 target 暂不可建议，仍可输出由 Wing 生成的合法 Start/End，满足首次手工布点场景。
- 普通 Preflight/Apply 日志继续只显示“已找到 X 个已选控制符，共 Y 个区域”；checkbox 关闭时不得输出缺失列表，也不得发布 `marker.not-found` Problem。

### 验收门禁

- 纯 formatter 测试覆盖：缺失/已命中混合、多个 `NameSuffix`、重复 classId、无 artifact、稳定 legacy 顺序和 Windows/Unix 换行显示；全量底层能力必须覆盖 32 个 legacy block key，当前筛选/单项动作不得泄漏其它 block。
- Wing 组件测试冻结按钮、checkbox、tooltip/aria-label 与 CustomEvent payload；Auto 架构测试证明组件只从 `@phoenix-wing/kt-codegen/ui` 导入，并冻结 Webview → VS Code 的薄事件映射。
- Webview 消息只传结构化语义命令；Output/clipboard 属于 Extension Host adapter，Wing 不依赖 VS Code API。
- Extension Host smoke 至少验证：默认无噪声、勾选只展示已选缺失项、单项/当前筛选 Output 范围正确、Primary 改状态后 View 同步、关闭后恢复简洁日志，以及底层全量能力覆盖 32 个 legacy block key。
- 文档与手工验收说明必须明确：这是首次布点/诊断工具，不代表 Apply 可以在没有 Start/End 配对时自动写入。

### UI Bug 收口

- [x] JSON View `full` 改为页面唯一纵向滚动：控制符目录与预检结果按内容自然撑高，不再各自强制纵滚，也不再使用固定 `44vh/58vh` 和绝对 `inset`。
- [x] 两区始终保持左右结构，中间使用可拖动、可键盘调整的 separator；20%～75% 限幅，比例经 Host `workspaceState` 持久化，不写业务 JSON。
- [x] Browser 在 1600×900、1000×650、760×480、560×420 下验证 32 行目录和 32 条结果均为 `clientHeight == scrollHeight`；560×420 页面为 `420 / 2331`，右侧宽内容为 `306 / 520` 横向滚动，左右没有纵向滚动。
- [x] 预检完成后左目录和右结果默认只显示命中；显示筛选与 Preflight/Apply 勾选语义拆开，输出只处理当前筛选。
- [ ] 深色、浅色、高对比真实 VS Code 中的滚轮、滚动条 thumb 和 Artifact 横向滚动仍由用户/真实宿主回执；详见 `codegen-plan/Codegen控制面板滚动筛选点检表.md` D 组。
- [x] 高对比主题下参数表选中行改用宿主 `list.activeSelection*` / `list.inactiveSelection*` token；用户已在真实 Host 确认文字清晰，修正随 Wing 0.4.3 正式发布并由 Auto Code 0.5.1 精确消费。
- [x] 参数表的 Header 和工具位于 Wing `KtCodegenTable` Shadow DOM；Auto 已通过公开 `layout="page" + collapsible` 属性接线，不穿透私有 DOM。折叠只隐藏 table shell/statusbar，Header 和全部工具保留；每个隐藏 JSON View 依靠 `retainContextWhenHidden` 保留本地折叠状态。正式 Registry 消费仍随 Wing 后续版本发布与依赖升级闭环。

## 已完成第二个切口：Primary Codegen 页面壳

- 此切口最初由 Auto 私有 `ktc-codegen-primary-panel` 验证页面壳边界；2026-07-22 已由 Wing `KtCodegenPrimaryPanel` 替代，兼容 tag 仅用于维持现有 bundle/HTML 接线。
- `sidebar/panelHtml.ts` 不创建 Codegen 行、标签、输入框或按钮，只把 Host `ToolUiState.codegen` 赋给共享组件，并将 Wing Primary/Control `CustomEvent` 映射回既有 Webview 消息协议。
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

- 此切口曾由 Auto 私有 `ktc-codegen-control-panel` / catalog 实现；2026-07-22 已删除私有 DOM，Primary/JSON View 分别消费 Wing Primary/Control 组件。Host 端 legacy 顺序、选择、输出和 artifact 规则保持不变。
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
- 当前控制符显示筛选属于 Wing 组件 Realm 内状态，不写入业务 JSON；选择仍由 Host session 广播。历史 Tree 分组/折叠实现已随 Auto 私有 catalog 删除，不再作为当前产品契约，详见已废止的[控制符目录 Tree 点检表](codegen-plan/Codegen控制符目录Tree与范围Combo点检表.md)。

## 已完成安全修复：错误区域隔离后的部分 Apply

- Auto Host 不再用全局 `plan.canApply=false` 提前阻止全部写入；Apply 投影统一交给 Wing 判断可安全写入的完整 Region/Artifact。
- Wing 只把 `marker.missing-end` / `marker.orphan-end` 视为可隔离的边界错误：错误控制块不形成 Region，完整的后续控制块仍可写入。模型、Renderer、Artifact 绑定、源码指纹、区域范围或重叠错误继续 fail-closed。
- 部分成功后回执只记录实际写入的文件/区域，原预检错误继续进入 Problems；状态和日志显示“Apply 部分完成”，同时给出写入区域数、保留错误数和耗时。
- 2026-07-19 真实工作区手工回执已验证：控制符缺失错误不阻断其他合法区域写入；用户补齐缺失控制符后再次 Apply 成功且诊断归零。

## 已验证性能停止线：继续使用 VS Code 文件 API

- 2026-07-19 真实工作区回执：候选扫描覆盖 1 个工作区根、49 个源码文件，命中 7 个控制符候选，耗时 30 ms；带 1 条隔离预检错误的部分 Apply 耗时 7 ms，相关诊断操作约 32 ms。
- 当前文件检索、候选打开、诊断与安全写入的用户可感知延迟已经足够低，不再引入 Rust/原生扫描器，也不增加双实现、跨进程协议和发布复杂度；除非用户再次发现性能问题，才基于新的真实回执和 profiling 重新评估。

## 已完成稳定性修复：Primary 编码日志与混合源码

- Primary 的头文件/源码编码预检不再把问题行固定按 Latin-1 输出；严格 UTF-8 优先，失败后仅接受可无损往返的 CP936/GBK，CAA 本地源码与 Qt UTF-8/GBK 源码均按各自编码分析。
- “保留多字节”模式不再把合法 GBK 中文逐字节误报成 `invalid_utf8`，也不再把合法 UTF-8 中文误报成不可 GBK 编码；“纯 ASCII”模式保留中文问题，但日志上下文仍显示正确文字。
- UTF-8 修复走 Unicode 字符映射并保持 UTF-8，避免复用 GBK 字节清理器破坏 Qt 中文；Primary 日志使用界面“修复”提示，扫描范围文案同时覆盖头文件和源文件。
- 2026-07-20 用户真实 Extension Development Host 已完成五项点检：CAA/GBK 日志、纯 ASCII 诊断、Qt/UTF-8 标点修复与编码保持、Primary 修复提示均通过。

## 大型 UI 暂停后的 TODO（2026-07-18）

用户决定暂停本轮大型 UI 拆分。以下事项只登记，不在本轮继续实施；恢复目标前不得把它们悄悄并入普通修复或发布提交。

1. **关联规则真实 Browser 回执**：通过 localhost fixture 或真实 VS Code Webview 验证 430/320/280px、Tab 焦点圈、关闭后的焦点恢复、Escape、backdrop 和长候选内部滚动。本次 Browser 自动化因 `file://` URL 策略拒绝而停止；自动测试、bundle 与 VSIX 已通过，这一项是人工/真实浏览器证据缺口，不是已知产品失败。
2. **Auto Code 后续大壳**：搜索替换完整 Page shell、`Codegen/index.ts` 剩余 Host adapter，以及“全部应用 2.0 / 批量报告”继续分别立 characterization 和独立小提交；V1 已完成的逐 View 串行流程可演进但不冒充 2.0。2.0 的错误必须同时进入 Host 持有的批次报告与独立 `kt-codegen-batch` Problems，不能复用会被活动 JSON View 清空的单页集合。
3. **Desk Tools 后续大页**：Unit Tests 的 Result pane 与“全部复测”语义、FCStd Map 扫描 Controller、Assembly RowGroup/样式收口、CAA Editor 剩余 session/writeback Host 边界继续留在 Desk `doc/TODO.md`；已有 RunScope/Watchlist、FCStd panes、Assembly row、CAA Controller 不返工。
4. **Wing 后续条件项**：`KtCodegenTable` 已到首轮合理停止线；页面布局能力完成发布和 Registry 消费验证前，不为降行数继续拆。只有出现第二产品消费者或真实复用需求时，才评估公开更多 visual primitive。
5. **跨仓人工证据**：Windows NSIS 真实回执，以及 VS Code/Desk 的浅色、深色、高对比视觉矩阵继续由用户手工并行；不阻塞当前代码归档，也不追溯提高联合评分。
6. **Codegen 显式修复提醒**：控制符单入口已完成，Primary 负责目录/筛选/选择/输出，JSON View 只保留预检结果、Artifact 与问题定位；预检结果自己的列表/详情 separator 不代表控制符目录回归。剩余 TODO 是“问题 N”控制符筛选与显式修复提醒：必须先由 Wing 诊断提供结构化 `blockKey/classId/boundary`，不得从英文 message 猜 block。`marker.missing-end` 只允许用户在问题详情中显式选择“插入编译期修复提醒”，经确认后在下一条 marker 前写入可识别的 `#error`；不得预检时自动写入，也不得自动猜测补 End，且入口不能只依赖不可发现的右键菜单。
7. **Auto Code Primary 工具条**：顶部 sticky、紧凑图标、tooltip 和无障碍名称已完成；未选择子工作目录时的空提示保持隐藏。工具界面标题右上角 `…` 原生菜单按工具条顺序提供打开、导入、全部应用、刷新和扫描命令，最后提供“复制运行诊断”，全部使用 VS Code Product Icon 并复用既有 Host Action；`X` 继续负责关闭当前工具界面，Primary 不再保留重复诊断图标。
8. **共享 Block 标题菜单接口（TODO）**：当前 `…` 仅在 Host 上下文 `ktAutoCode.modulePanel.activeTool == codegen` 时显示，先阻止其他共享 Block 误用 Codegen 菜单；共享 Panel 对已可见 Block 的重复 `show` 已做幂等保护，真实切换则按 `toolId` 保存和恢复外层滚动。后续目标模型是“Block 自描述、共享 Panel 投影、Host 路由”：内置 `KtTool` 与可选模块 `ktAutoCodeModule.tools[]` 提供有序 `titleActions`（`actionId / title / icon / order`）以及必要的 Block 视图状态；共享 Panel 获取当前 Block 的声明，空数组或无法获取时不显示 `…`，有动作时才放置菜单；用户点击后，Host 只把 `actionId` 发给当前 Block 的既有 action handler，不复制业务命令。实施前必须先验证 VS Code 原生 `view/title` 菜单的静态 contribution 限制：优先采用“共享 submenu + 各扩展静态贡献命令 + `activeTool / hasTitleMenu` context”适配层；若动态标题/数量无法投影，再单独评估通用 Quick Pick 或 Webview 内部菜单，不假设公共 API 可以运行时任意注册原生菜单项。

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
