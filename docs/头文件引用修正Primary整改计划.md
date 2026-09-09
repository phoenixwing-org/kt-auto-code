# 头文件引用修正 Primary 整改计划

状态：current（正式接线完成，保留人工验收项）

Owner：KT Auto Code maintainers

适用版本：0.9.0

最后核验：2026-09-09

## 1. 本轮定位

先确认 Preview，再接正式 Controller。本轮已完成共享 Primary、typed companion、目录动作、Ignore 与 Right 去重；原型仍只操作内存，正式端读取真实 Host 数据。代码/自动测试完成与人工验收分开记录。

本轮不改变 Primary 外层 Shell。Toolbar、外层 `目录`、Current Tool 和 Open Items 的数量、顺序、关闭与滚动语义继续遵守 [`前端开发规则.md`](前端开发规则.md)。本文中的“目录”仅指“头文件引用修正”Current Tool 内部的业务区块，不是外层工作目录条。

## 2. 已确认的 Primary 布局

Current Tool 内部固定按以下顺序设计：

1. 紧凑文字按钮行：`重新预览`、`回到 View`、`工程环境`。
2. `目录` 区块：`依赖`、`工程`两个可编辑输入框，依赖行保留`推导`、`选择`按钮，以及当前目录/扫描状态。
3. `Ignore` 区块：可折叠、默认展开。
4. 独立`结果` Block：状态提示、映射/扫描/忽略/命中及必要摘要；用标题与分隔明确区别于 Ignore。

按钮行采用已确认的紧凑文字 button block，不改回仅图标表达。`工程环境`在 Primary 首行保留，作为打开统一工程环境能力的入口。

2026-09-09 用户已确认上段原型（工具标题、首行三按钮、依赖/工程目录和 Ignore）效果 OK；结果分区是随后新增要求，验收分开记录。

### 2.1 目录区块

- `Package 目录`的可见标签缩为`依赖`，`工程目录`缩为`工程`；悬停/无障碍名称保留完整含义，标签列按两字收紧。
- 按用户 2026-09-09 澄清，只去掉按钮文案的省略号，不删除按钮：显示`推导`、`选择`。推导保留 `ROOT_DIR_INCLUDE` 与 `ROOT_DIR + SDK_PREFIX/core/include` 两个来源；选择保留原生目录选择器和缓存起点。
- `工程目录`只在新建 Right 任务时同步 Primary 当前工作目录的完整路径，不恢复上次输入值；当前目录为空则留空。Right 未关闭时保持内部草稿，切换外层目录或再次显示同一 View 均不重新同步；关闭 Right 后重新打开才再次取当前目录。
- 新任务的首帧 HTML 与首次 Primary 投影也必须使用该目录，不能先显示旧工程再等待环境读取修正。依赖目录的独立缓存不受影响。
- 业务区块内编辑工程目录不得反向改写外层工作目录，也不得绕过外层目录切换的 Host 校验。
- 输入变化必须使旧预览失效；重新预览后才允许写入。
- 显示真实扫描状态，例如“已扫描 126 个文件，未发现需要修正的 include。”；错误详情仍进入 Output 或 Right，不把任意未校验错误文本直接投影到 Primary。

### 2.2 Ignore 区块

显示内容沿用搜索替换当前已确认语义：

- 标题与状态：`忽略`、`已启用/已停用`、来源计数。
- 操作：`停用/启用`、`修改`。
- 来源：`插件`、`Git`、`自定义`三个 checkbox。
- 说明：停用后仍保留不可关闭的安全排除；规则正文统一在 Ignore 管理中修改。

该区块默认展开，用户可以折叠。折叠只影响当前 UI 呈现，不改变 Ignore 策略，也不创建或改写 `.phoenix/.ignore`。

## 3. 共享组件方向

Host-neutral 紧凑 `KtcIgnorePolicyBlock` 已在 Preview 与正式 Primary 接线，职责如下：

- 输入 model：总开关、三个来源选择、自定义规则数量与忙碌状态；组件默认展开，保留当前实例的折叠状态。
- 输出 `ktc-ignore-policy-action` 语义事件：切换总开关、切换单一来源、打开 Ignore 管理。折叠目前由原生 `details` 自身管理，不发送业务事件。
- 组件不读取 VS Code API，不读写 `workspaceState`，不读取或创建 Ignore 文件，也不自行清除扫描结果。
- Host adapter 继续把显式用户操作映射到既有 `setIgnoreEnabled`、`setIgnoreSourceEnabled` 和打开 `ignoreSettings` 的动作。
- 搜索替换和头文件引用修正复用同一组件，避免两处标签、提示和禁用态逐渐分叉。

现有 `KtcIgnorePrimaryPanel`是完整 Ignore 管理界面，不等价于本紧凑消费组件；不应为复用而把完整管理器嵌入每个扫描工具。

目录、按钮与摘要另封装为 `KtcPackageIncludesPrimary`，Preview/正式共用同一 DOM；两组件暂留 Auto，不引入 Preview fixture 到正式业务。

## 4. 正式能力映射

| UI 动作/信息 | 现有正式能力 | 正式接入要求 |
| --- | --- | --- |
| 重新预览 | Controller 的 `preview` action | 保留 panel/session/revision、ready 与 busy 门禁；复用同一预览服务 |
| 回到 View | Controller 的 `reveal` action | 继续 reveal 当前 Right，不新建第二个 Editor |
| 工程环境 | `ktAutoCode.environment.open` | 只保留 Primary 入口；Right 重复按钮删除 |
| Package 推导 | `pickEnvironmentPackageDirectory` + `useEnvironmentPackageDirectory` | Primary action 必须复用两个来源、缓存、错误日志和预览失效逻辑 |
| Package 选择 | `pickPackageDirectory` | 继续使用原生 folder dialog、缓存和目录存在性校验 |
| Package/工程目录编辑 | Right 的 `updateDraft` 语义 | 增加受 companion allowlist 保护的 typed payload；严格校验字符串和长度 |
| Ignore 总开关/来源 | Sidebar Host 现有 Ignore messages | 组件仅发语义事件；Host 仍负责持久化和广播策略变化 |
| 修改 Ignore | 打开 `ignoreSettings` Current Tool | 不创建新的 Right 或第二套规则编辑器 |
| 扫描状态/摘要 | Preview 的结构化计数和 Controller 状态 | 新增 typed Package Primary projection，不复制任意错误详情 |

正式 allowlist 包含预览、回到 View、工程环境、推导、选择与目录草稿。目录 payload 拒绝未知字段、超长字符串和换行/NUL；异步选择、缓存及扫描回包复核当前身份。输入等待 Host 确认期间保留最新草稿，不以旧回包覆盖用户输入。

## 5. Right 调整边界

正式接入完成后，Right 按以下边界做减法：

- 明确删除 Right Header 的`工程环境`按钮及其前端重复 handler。
- `工程环境`能力本身不删，Primary 第一行保留入口，Controller 的正式 action 继续存在。
- Primary 目录区块接入真实动作并完成回归后，再从 Right 删除重复的目录 UI；不能先删后接。
- Right 保留`预览/重新预览`和`写入修正`的正式工作流，除非用户后续另行决定入口去重。
- Right 保留完整结果表、逐行打开文件、同名冲突、未知编码、未加入映射等诊断。
- 表格原有点行定位已获用户点检确认。为提高可发现性，最新要求在最右侧固定`状态 / 操作`列，加文字`打开`按钮调用同一定位能力；点行仍保留。用户已澄清“保存功能”是“保持功能”笔误，并明确选择“打开”，不新增逐行写入。
- 写入呈现已实现：右侧固定列预览时为`待写入`，成功回执匹配冻结批次后为`已写入`；保留原结果，不自动重扫，只有用户再次预览才刷新。确认取消仍待写入；失败或回执不匹配标`待核对`，撤销重复写入资格。写入继续由 Right Header 统一执行，原型只模拟。
- 最新去重规则：顶部提示行完整保留，用于扫描、运行、错误及写入结果；其下直接显示表格，删除“预览”小标题及映射/扫描/忽略/命中四项重复统计（统计只在 Primary）。未知编码仍保留为诊断，不随统计删除。
- Right 保留写盘前确认、预览快照复核、写盘结果和 Git diff 提示。

“删除重复入口”不等于删除底层能力。任何暂未迁入 Primary 的能力都继续留在 Right。

## 6. 必须防止的功能遗漏

以下项目没有被用户要求删除，正式迁移不得丢失：

- Package 目录缓存，以及首次打开时从工程环境推导默认值。
- `ROOT_DIR_INCLUDE`与`ROOT_DIR + SDK_PREFIX`两个推导来源和对应成功/失败日志。
- Package 目录存在性反馈，以及无有效 Package/工程目录时禁用预览。
- 工程目录的“默认来自 Primary、仅本次 Editor 会话可临时修改”语义。
- 输入变化、Ignore 来源变化后撤销旧预览和写入资格。
- Package 根与工程根分别解析 Ignore 的双根语义，不能把一侧规则误用于另一侧。
- Ignore 总开关只关闭用户可选来源；不可关闭的安全排除继续生效。
- 三个 Ignore 来源的上次选择在停用期间保留；再次启用恢复选择。
- 未命中时的真实扫描文件数和“未发现需要修正”的明确状态。
- 映射头文件数、忽略目录数、命中数、未知编码文件数。
- 同名冲突全部排除、非 `source`/包目录结构头文件跳过等警告。
- 结果行打开源文件并定位到行号。
- 写入前 modal 确认、预览后文件变化复核、写入失败日志与成功回执。
- 同一 Right View 复用、Editor lifecycle、过期 panel/session/revision action 拒绝。
- `工程环境`统一能力；只删除 Right 的重复按钮。

## 7. 分阶段正式接入

### 阶段 A：Preview

- [x] 按“按钮 → 目录 → Ignore → 摘要”实现效果图。
- [x] Ignore 组件在 Preview 中验证展开/折叠、三来源、总开关、修改事件和窄栏布局。
- [ ] 目录区块验证长路径、目录不存在、扫描中、零命中、存在命中和错误状态。
- [x] 明确所有动作均为模拟，不调用真实 Host、不写配置、不扫描或写入文件。

### 阶段 B：共享组件

- [x] 固化紧凑 Ignore 组件的 model、事件、键盘和无障碍契约。
- [x] Search Replace 与 Package Primary 通过 adapter 使用同一组件。
- [ ] 为深色、浅色、高对比、窄栏、折叠恢复和禁用态补充组件测试。

### 阶段 C：typed Primary projection

- [x] 为 `packageIncludes`新增 typed Primary model，不继续依赖通用 label/value 摘要猜测。
- [x] 把目录值、存在性、结构化扫描计数和可信状态加入 snapshot。
- [x] 为推导、选择和草稿更新增加 allowlisted companion actions、payload 校验及过期 action 测试。
- [x] 保持 Ignore policy 变化通过现有 Host 广播使 Package 预览失效。

### 阶段 D：Right 去重

- [x] 删除 Right `工程环境`按钮，但保留 Primary action 与 Host command。
- [x] Primary 目录真实接通并验证后，删除 Right 重复目录 UI。
- [x] 保留 Right 的完整结果、诊断、写入和冻结安全能力。

## 8. 验收清单

### Preview 验收

- [x] Primary 首行严格为`重新预览 / 回到 View / 工程环境`，文字清晰、宽度紧凑。
- [x] 目录区块包含依赖/工程输入、推导/选择按钮及扫描状态；按钮文案不带省略号。
- [x] Ignore 默认展开，可折叠；三来源和安全排除说明完整。
- [x] 摘要位于 Ignore 之后，零命中和有命中状态都能表达。
- [x] Preview 交互不写用户文件、不改工作区设置、不执行真实扫描。
- [x] 外层 Directory、Toolbar、Current Tool Header、Open Items 和唯一滚动边界不变。

### 正式接入验收

- [x] 所有 Primary 动作经过 Host snapshot action allowlist、panel/session/revision 和 enabled 校验。
- [x] Package/工程目录编辑会撤销旧 session，旧预览不能写盘。
- [x] Ignore 变化会使旧 Package 预览失效，双根规则解析保持正确。
- [x] 关闭 Right 后的迟到 action 不执行；切换焦点不关闭已有任务。
- [x] Right `工程环境`入口已删除，Primary 入口可用，统一工程环境 command 保留。
- [x] Right 目录 UI 只在 Primary 真接入后删除。
- [ ] 完整结果表、警告、文件定位、modal、快照复核和写盘回执全部仍可用。
- [ ] 单元、Webview architecture、artifact marker 与真实 Extension Host 人工点检通过。

### 8.1 优先 TODO：Primary Ignore 真实生效与扫描剪枝（UI-12）

用户反馈（2026-09-09）：以前出现过未忽略、忽略设置不一致，导致检索大量本应排除的头文件，浪费时间。此项单独追踪，不能用 UI 勾选状态或 Preview 模拟结果判定通过。

状态：已完成真实 Controller/服务自动回归；真实用户目录、重开持久化与主题的人工点检仍保留。

- [ ] 核对 Primary 总开关、插件/Git/自定义三来源与 Ignore 管理、实际扫描参数一致；切换、停用再启用、关闭重开后的状态不分叉。
- [ ] 分别检查 Package 映射目录与工程扫描目录的规则根、相对路径和嵌套规则；两边都生效，不能只忽略工程扫描而仍遍历全部依赖头文件。总开关关闭时保留安全排除。
- [x] 命中整目录忽略时，在进入目录前剪枝；三来源各 500 个排除文件的目录/文件读取计数为零，正常映射与命中保留。
- [x] 修改 Ignore 后撤销旧预览/写入资格；扫描中的迟到结果不恢复授权，规则正文变化也参与复核。
- [x] 临时样例记录遍历/读取计数及当次耗时；不宣称相对旧版的性能收益。来源组合由独立服务/EH 样例覆盖。

完成条件：UI、Host、扫描器和回归测试证据齐全后，再关闭此 TODO。缺少耗时历史基线时先记录计数与当次耗时，不宣称已有性能改善。

初查与修复结论（2026-09-09）：

- 已有链路：`sidebarViewProvider.ts` 将策略同步给正式 Controller；`packageIncludeViewController.ts` 分别解析 Package/工程根；`packageIncludeService.ts` 的 `walkFiles` 在目录入队前判断忽略。不是“完全没有过滤”，仍需用读取计数和真实 Host 证明。
- 已修复扫描中 Ignore 变化的迟到结果风险：generation + Abort 撤销扫描，双根策略指纹复核。写入取消等待 provider 退出才释放互斥，随后恢复 idle；已写入项不会自动回滚。
- 写前冻结并重新核对 Package 头文件路径集合；新增同名头文件也会拒绝旧预览。映射只依赖路径，不读取头文件正文。
- 明确限制：当前只取最近仓库根 `.gitignore`，未扩展嵌套规则聚合或反选语义；不能宣称所有嵌套规则都支持。

## 9. 当前实现证据（2026-09-09）

当前交付：`be4079e` 已将新任务目录初始化与三视图关闭联动纳入内测包 `0.9.0-internal-right-close-20260909/`；全量 232 文件 / 1533 通过 / 2 条件跳过，prepare、单仓及 Auto+CAD EH、制品门禁通过。用户已确认状态/操作列、Primary 样式和目录同步两场景；关闭联动仍待人工验收。下列旧快照和未重打描述仅记录实现过程，最新哈希及边界以[内测说明](0.9.0-内测说明.md)为准。

- 子 agent 已只读核对真实 VS Code 新 Host `Nt5Qes`：正式 Primary 的两字标签、推导/选择、展开 Ignore 与 Right 目录去重可见，运行 extensionPath 与新快照一致；不是 Preview 或旧 Host。随后用户追加的 Right 统计去重单独更新，不借用此截图判定通过。
- 正式接线定向 9 文件 / 143 项通过；最终状态/操作列定向 6 文件 / 56 项通过，源码提交 `0f75037`，冻结后全量 231 文件 / 1511 项通过、2 条件跳过。真实单仓及 Auto+CAD EH 已运行：头文件 2 文件 / 3 处写入、旧源码整批拒绝和显式复扫零命中。浏览器已确认模拟写入后三行保留、固定列显示已写入与打开；不代表正式 Host 人工写入已验收。制品证据见[内测说明](0.9.0-内测说明.md)。
- 后续健壮性 TODO：预览开始前项目缓存写入异常时，补齐 busy 释放回归；不改变本轮正常预览/写入行为。
- 最新可见 Host 已启动为 `kt-auto-code-local-host-IcdwPk`，共享 Primary 与 extension bundle 哈希和最终 dist 一致；因 Mac 锁屏未取得新列的正式截图。上一 `Nt5Qes` 只证明此前局部界面，不覆盖本次状态/操作列。
- 随后用户以正式截图确认`状态 / 操作`、`待写入`和`打开`已出现；新列可见性通过，实际写入状态仍单列点检。
- 工程初始值阶段修订：仅创建 Right 时同步当前完整工作目录，移除旧默认值回退并同步首帧；同一 Right 内草稿不变。该阶段定向 3 文件 / 33 项，全量 231 文件 / 1515 项通过（2 条件跳过），typecheck、docs、架构及 `pnpm ext:dev:prepare` 通过；开发快照 `kt-auto-code-local-host-j00emL` 用于用户点检，后续已合入上述新内测包。
- 用户已确认 Primary 样式及两项目录同步通过；随后新增规则：头文件、项目改名、编译工具的最后一个 Right 关闭时联动关闭对应 Primary/Open Item，自动代码按 JSON 管理除外。此为明确授权的生命周期规则变更，旧“Right 关闭仍留 Primary”描述不再作为金样；联动的人工验收另记。
- 安全回归：`packageIncludePrimarySafety.test.ts` 7 项；`packageIncludePruning.test.ts` 4 项；共享 Primary DOM、typed contract、Sidebar 投影测试共同覆盖正式接线。

- 正式目录、预览、应用与 Right HTML：`src/tools/codeAssistant/packageIncludeViewController.ts`。
- Primary companion contract：`src/core/editorPrimaryCompanionContracts.ts`。
- 通用 Primary companion renderer 与 Search Replace Ignore 区块：`src/sidebar/panelHtml.ts`。
- Ignore Host 状态、事件和策略广播：`src/sidebar/sidebarViewProvider.ts`。
- Ignore 安全排除与来源解析：`src/ignoreConfig.ts`。
- 现有正式测试：`src/tools/codeAssistant/packageIncludeViewController.test.ts`。
- Preview companion fixture：`ui-preview/fixtures/right-primary.sample.json`。

新增原型证据：

- `ui-preview/src/previewPackageIncludes.ts` 是纯内存 adapter；`src/ui/KtcPackageIncludesPrimary.ts` 已同时接入正式 Controller 与 Preview。
- `src/ui/KtcIgnorePolicyBlock.ts` 在搜索替换、头文件引用修正的 Preview/正式消费者中复用。
- `src/test/primaryUiPreviewPackageIncludes.test.ts` 的 17 项真实 DOM 测试与 Ignore 组件 9 项测试通过；覆盖 Enter 禁用门禁、目录草稿、旧预览失效、来源投影与折叠保持，以及 Right 三行结果与应用后的零命中。未 mock Ignore；仍只是内存样例。
- 2026-09-09 浏览器点检：1053×748 视口，浅色当前栏宽、深色窄栏；首行、目录、Ignore 和底部摘要均可见，长路径省略，Right Header 使用任务工程目录。
- Right 原型及正式均已移除重复工程环境/目录入口；正式门禁检查实际 bundle 和 companion 接线。
- 空目录输入有提示，Right 样例支持三行结果与应用后的零命中；真实存在性、扫描中及错误矩阵尚未全部实现，保留未勾选项。

## 10. 任务目录固定边界

用户随后针对项目改名提出：移除 Primary 内重复的“选择目录…”，任务绑定目录固定至 Right 标签关闭，并把 `phoenix-open-issue @ /workspace` 与只读说明放到 Primary 工具内容最下方。当前只读审计已确认项目改名会话不跟随全局目录变化，但仍有明确的 `chooseRoot` 重新选择能力。

项目改名只读底栏已在 Preview 获用户确认，正式已迁移：有根时隐藏并拒绝旧 `chooseRoot` 消息；无根启动只允许首次有效选择，迟到选择不能覆盖新会话。Primary `×` 不等于 Right 关闭；真实根目录重命名仍同步新路径并撤销旧预览。此规则不自动推广至头文件工具：工程目录保留本次任务内编辑，Package 来源也保留。
