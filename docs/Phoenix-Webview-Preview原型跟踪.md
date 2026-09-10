# Phoenix Webview Preview 原型跟踪

> 状态日期：2026-09-09
> 适用范围：KT Auto Code 内部 Webview UI 实验沙箱
> 原型名称：**Phoenix Webview Preview**
> 阶段状态：**四区外壳已归档；自动代码、头文件引用修正及 Git 已完成共享原型/正式接线。0.9.0 最新全量、Wing prepare、两个真实 EH 和内测 VSIX 门禁通过；人工验收另记，不扩大到 0.9.1。**

本文是本轮 Primary + Right View 原型的单一讨论与验收记录。它先固定用户已经确认的方向，再记录仍在原型中或待决策的事项；“已确认”表示设计方向已确认，不表示代码、自动测试或真实 Extension Host 验收已经完成。

## 当前增量与停止线（2026-09-09）

- 自动代码 Primary / Right 已共用 Wing 表格、控制符结果及文档模型；原型只运行内存 fixture，不能代替正式写盘验收。正式端另补保存快照、同 URI 保存/重载队列、迟到回执与旧预检拒收；已应用结果可查看源码但不可复活旧计划。最新按钮为 Primary“全部应用”、Right“应用”。
- Wing checkpoint 扩展与真实 Core / 已打包 Table JS 行为门禁已实现，验证保存期间新草稿不丢失。旧 Registry 缺少该能力时应拒绝制品；本地 Wing 内测与正式 Registry 发布保持分离，不能只凭 Preview 正常或来源 marker 宣称可发布。
- 头文件 Primary 已从手写样例迁为正式/Preview 共用组件：首行按钮、Package/工程目录、默认展开 Ignore 和摘要保持已确认方向；typed 动作已接原 Controller。Right 只留预览/写入、摘要与修正表，完整警告/逐行定位仍在，不静默删除能力。Git 同样复用正式 Primary / Tree，空态简化、递归搜索/停止及默认 2 条 commit 的原型不再另造 DOM。
- 新头文件服务烟测与回执门禁定向 2 文件 / 59 项通过；最终单仓 / Auto+CAD EH 均实际运行通过，隔离夹具覆盖双根 Ignore、旧源码拒绝、真实修正 2 文件 / 3 处与零命中复扫。
- 头文件最后增量 `0f75037`：Primary 状态/摘要独立为“结果”Block；Right 保留顶部提示、删除重复标题/四统计，最右固定状态/操作列。打开按钮与行点击共用定位；成功后保留原表并标已写入，不自动重扫，异常待核对。浏览器已核对三行模拟写入回执与文字打开按钮；定向 56 项通过，正式人工写入另验。
- 后续目录与关闭增量 `be4079e`：头文件新任务取当前目录，原型关闭后释放缓存；项目改名、编译工具、头文件最后一个 Right 关闭时移除对应 Primary/Open Item，保留 MRU/欢迎回退。正式自动代码按 JSON 管理，明确除外；其原型仍是既有单实例模拟，本次未扩展。正式目录同步两场景、状态/操作列及 Primary 样式已获用户确认，三视图关闭联动的手验另记。
- 0.9.0 最新全量 1533 项通过，最终 prepare、两个真实 EH、新 VSIX / receipt / SHA-256 通过，见[内测说明](0.9.0-内测说明.md)。Git 空态/有效外部仓库、两条 commit 与更多 15 条已点检；主题、焦点和真实 Host 的未验项仍按清单记录。其余代码辅助 Primary 排入 [0.9.1](0.9.1-代码辅助Primary整改计划.md)。

下文保留历史阶段的结论和证据；早期“仅 Preview / 尚未正式接线”、旧包哈希及旧停止线均应按本节理解，不作为最新候选验收。

## 0. 归档结论

2026-09-07，用户确认“Primary Right 框架的封装”可以归档，并同意进入正式应用阶段。本轮归档固定以下原型结果：

- Primary 由 `KtcPrimaryShell` 编排 `Directory → Toolbar → Current Tool → Open Items` 四段，四段全宽相邻且只有 Current Tool Body 承担主要纵向滚动；
- Directory、Toolbar、Current Tool 与 Open Items 分别使用 Host-neutral Web Components，消费者拥有 Store、MRU、路由和业务 Controller；
- Right 使用 `KtcRightViewShell` 提供固定 Header、actions slot、Main slot 和明确的滚动模式，Tool 消费者只提供自己的内容；
- Right 工作台底部使用唯一 `KtcSystemOutputBlock` 接收原型按钮反馈；它只是对 VS Code Output 的预览模仿，不属于任何 Tool、不作为业务状态真源，也不是正式插件能力；
- Preview Catalog 以同一 `toolId` 注册必需 Primary 和可选 Right Surface；两侧只交换可序列化快照与稳定 `actionId`；
- Preview State Store 可恢复主题、宽度、区域显隐、导航、活动 Tool、打开项和 MRU，并对损坏、旧版、未来版及存储异常安全回退。

“归档”表示结构与组件边界已经得到用户确认，预览代码和 `pnpm ui` 入口继续保留，作为正式实现的视觉与行为金样本；归档当时并不表示真实 Extension Host 已接入，也不把浏览器 fixture 当成正式业务实现。用户随后已单独批准正式接入，当前 v0.9.0 的 Primary / Right 外壳已经落地，并已在真实深色 Host 中确认整体视觉。尚未收口的是 Open Items / MRU 的 Extension Host 重启持久化、Right serializer / reload、完整多实例与 Registry Builder，以及主题、焦点和溢出等细粒矩阵。

Phoenix Webview Preview 是长期保留的 UI 设计沙箱，不是迁移完成后删除的一次性页面。后续大区域、宿主交互或视觉基线调整继续遵循“先在 Preview 修改并通过浏览器注释确认，再进入正式 Host”的顺序；正式实现只同步已确认的原型结论，避免在真实 Extension Host 中反复试错。

Preview-first 不意味着两套实现。构建配置等业务区至少先复用正式端相同的控件类型、字段关系、文案来源和语义动作，再用 fixture 驱动安全样例；排列是否继续优化可在 Preview 研究，经确认后才同步正式 adapter。禁止为了追图而复制 Controller、任务状态、配置读写或异步消息协议。

自 2026-09-07 起试行风险分流：外壳、大区域、不确定交互和有争议的视觉方向仍先在 Preview 验证；已经确认的共享组件内小尺寸调整可直接修改同一个 Host-neutral 实现；尚未确认的小视觉效果只通过 Preview adapter 覆盖 CSS token，正式 fallback 保持不变，确认后再提升同一 token 值。该流程不允许复制 DOM、业务逻辑或事件协议。后续若观察到重复维护、token 漂移，或确认后仍需重新实现，则记录点检并回顾是否终止试行。

正式实现形成可独立展示的阶段成果并通过对应自动门禁后，必须启动一次可见的 VS Code Extension Host 交给用户查看真实效果。这个阶段展示用于尽早暴露 VS Code 字体、缩放、主题、滚动和生命周期差异，不以后台 smoke 或 Preview 画面代替，也不自动表示用户已经验收。

## 1. 状态说明

### 2026-09-09 包后 UI 增量

- Run 原清理树保留三个直接执行快捷项，首行是“刷新 / 清理”文字按钮。“清理”默认 Git 未跟踪方式，复用 Wing 对话框；不显示 Run 额外风险勾选，但仍需先预览后点击清理。浏览器已点检模拟快捷项、预览、执行、关闭与日志，未删除真实文件。
- AutoBuild 配置首行按最新确认使用“打开 / 保存 / 另存 / 关闭 / 详细配置”文字按钮；状态在最近配置 Combo 下。此前图标方案已被用户否决，不再作为金样；其他执行/维护按钮保留。
- 头文件 Primary 原型采用“文字按钮 → 目录 → 默认展开 Ignore → 扫描摘要”，与搜索替换复用 `KtcIgnorePolicyBlock`；真实 Primary 迁移仍待 typed contract，见[独立计划](头文件引用修正Primary整改计划.md)。
- `KtcRightViewShell` 的目录上下文与工具标题分开；默认显示 `name @ parent`，完整路径在悬停/无障碍说明中保留。不以全局目录替换已打开任务的路径；正式四个消费者同步接入并单独验证。
- 项目改名 Primary 底部只读目录原型已获用户确认；正式迁移单列 TODO，不锁全局目录，不改 Primary `×` 语义。
- Run 与上述已确认组件批次已阶段提交 `9e09d0c`。自动代码后续原型另行推进，不据此关闭整轮目标。
- 自动代码 Right 已移除“选择模板 / Phoenix Web / CAA Command”占位，接入 Wing 参数表、控制符结果组件及 Auto 纯文档模型；Primary 与 Right 使用同一按 URI 管理的内存会话。预检、取消、Apply、JSON/CSV 输入、保存 checkpoint、重载、报告均有真实内存反馈；不会读写用户项目或系统剪贴板。
- 自动代码新原型 18 项 DOM 测试通过，临时预览服务实际打包并返回 HTTP 200；随后已在浏览器执行内存预检并核对浅色选中行。仍不等于整页用户确认或真实 Host 的外部文件冲突、写盘、回滚、多 Editor 实例验收。
- 用户随后截图确认参数表文字工具栏“好像可以的，辨识度提高”：`自适应 / 排序 / 复制 / 粘贴 / 插入 / 副本 / 上移 / 下移 / 删除`保留，原禁用态不变；其余 Right 区域仍单独验收。
- 自动代码两处选中行按最新确认减少自定义配色：移除 Preview 专属深色覆盖，Wing 中路径、编号及状态徽标继承主题选中字色。浏览器浅色、深色、高对比截图已核对并恢复浅色；正式 `Visual Studio Light - C++` 主题仍待新 Host 人工验收，不按主题名称硬编码。
- 以上包后变更不在已交付 SHA-256 `a162e52d20cf1c1750dddce691ea01e00a4e07d5352e96ed8ce9c696672d9fef` 的内测包中。最新 `pnpm ext:dev:prepare` 通过；`pnpm dev` 已发起新快照 `kt-auto-code-local-host-XzNWPZ` 的可见 Host，但查询窗口时 Mac 已锁定，人工验收未完成，也未重新制品。
- 随后用户以正式界面截图确认自动代码 Primary JSON 行与 Right 预检结果行配色通过。本条仅收口该选中态问题；组外工具收起 Navigator、Git 原型/正式整改另行追踪，不混同验收。

| 状态 | 含义 |
| --- | --- |
| 已确认 | 原型应按此方向设计；实现后仍需点检 |
| 原型中 | 已有局部代码或页面表现，但尚未形成完整验收证据 |
| 原型已验证 | 原型已具备自动化或可复现的浏览器证据；不代表已迁入真实 VS Code 宿主 |
| 待确认 | 需要继续通过浏览器注释或真实 VS Code 对比决定 |
| 正式迁移点检 | 原型可以先试，迁入正式插件前必须集中确认契约、兼容和回归 |
| 已完成 | 同时具备实现、所需自动验证和人工点检证据后才可使用 |

原型框架整体使用“已确认并归档”；单项只有具备相应证据时才标为“原型已验证”。真实 VS Code Host 的整体视觉已经用户确认，但这不等于完整迁移目标“已完成”；重启恢复、Right serializer / reload、多实例、完整 Registry Builder 和焦点 / 溢出细粒点检仍须单独记录证据。

## 2. 原型目标与边界

### 2.1 已确认

- 先完成独立浏览器原型并通过多轮注释收敛，再讨论迁入正式插件。
- 预览命名为 **Phoenix Webview Preview**；页面中的产品场景仍可显示 `KT Auto Code`。
- 开发入口使用：

  ```bash
  pnpm ui
  # 等价的显式命令
  pnpm ui:dev
  ```

- `pnpm ui` 是日常最短入口，`pnpm ui:dev` 是便于脚本、文档和排障引用的显式入口。两者都强制从默认并列 `../phoenix-wing` 解析 Wing UI；worktree 使用该位置指向当前活动 Wing 检出，不静默回退到 Registry 旧包。
- 原型只验证布局、视觉、交互状态、恢复和 Primary / Right View 联动；不调用真实 VS Code API，不执行文件修改、Git、进程或业务 Action。
- 浏览器预览通过不等于正式 Webview、Extension Host、Windows CAA 或发布门禁通过。

### 2.2 实验沙箱原则

Phoenix Webview Preview 允许先超越现行正式外壳契约，目的是低成本比较候选结构。原型与现行契约不一致时：

1. 不阻断原型研究；
2. 在本文登记为“正式迁移点检 / 待决策”；
3. 不据此直接修改正式插件契约、`AGENTS.md` 或权威前端规则；
4. 准备迁入正式插件时，再集中确认契约、状态迁移、兼容策略和回归范围。

正式迁移开始前曾存在三份不同的外壳事实：

1. 真实正式 Host 仍是 `Directory → Tool Area`，Toolbar 与当前 Surface 在 Tool Area 中；Native Header 仍有目录显隐、Ignore、Settings，当前 Surface 可折叠，Open Items 是其内部实验 Footer。
2. 当前 `AGENTS.md` 和权威前端规则写的是 `Toolbar → Directory → Current Tool` 三段，Native Header 只有 `Ignore → Settings`。
3. 本轮原型冻结为 `Directory → Toolbar → Current Tool → Open Items` 四个视觉区域、Header 的 `目录 → 忽略 → 设置`，并暂时禁止 Current Tool 一级 Block 折叠。

2026-09-07 仓库审查确认：原型基线提交 `d25780b` 曾提前修改 `AGENTS.md` 与 `docs/前端开发规则.md`，但没有同步迁改真实 Host，因此当时把偏差登记为正式迁移点检。随后用户明确批准新的四区外壳、Header 顺序、固定展开 Current Tool、共享组件与“原型长期保留”流程进入 v0.9.0 正式实现；当前治理契约已按该批准同步，以上三份事实只保留为迁移前历史，不再是现状描述。

## 3. 总体布局

### 3.1 已确认的原型顺序

```text
┌─ Native View Header ────────────────────────────────┐
│ KT Auto Code                         [目录][忽略][设置] │
├─ 1. Directory ──────────────────────────────────────┤
│ 目录  [当前工作区 / 项目                         ▾] [📁] │
├─ 2. Toolbar ────────────────────────────────────────┤
│ [⌄] [Ribbon：代码辅助][Git][Run][替换][自动代码] […] │
│     [下级工具紧凑网格……                         ][Aa] │
├─ 3. Current Tool ───────────────────────────────────┤
│ [Tool 图标] 当前工具名称                          [×] │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 当前工具内容；这里是主要纵向滚动区               │ │
│ └─────────────────────────────────────────────────┘ │
├─ 4. Open Items ─────────────────────────────────────┤
│ [图标 项目改名 ×] [图标 头文件修正 ×]             […] │
└─────────────────────────────────────────────────────┘
```

视觉层级固定为：

1. `Directory`
2. `Toolbar`，其中包含 Ribbon 和当前 Ribbon Group 的下级导航
3. `Current Tool`
4. `Open Items`

四个区域全宽相邻，以 VS Code section 分隔线形成层级，不使用卡片式外边距。Open Items 位于最底部且不随 Current Tool 内容滚动。

### 3.2 冻结的原型外壳

2026-09-06 用户已确认上述顺序与整体效果。从此阶段开始：

- 不再移动、新增、删除或相互嵌套这四个 Primary 大区域；
- 不再调换 Header 中 `目录 → 忽略 → 设置` 的候选顺序；
- 新的视觉、响应式、导航、工具内容和状态恢复实验只能发生在对应区域内部；
- 如后续发现必须改变大区域才能解决的问题，先记录新的原型决策点，不通过局部 CSS 或重复 DOM 绕过冻结结构。

“冻结”最初只是本轮原型的产品结论，并不自动授权真实 Host 变更。2026-09-07 用户已另行明确批准同步正式 Host；Primary / Right 外壳现已接入，且真实深色 Host 的整体视觉已获确认。该确认不替代重启恢复、serializer / reload、多实例和焦点 / 溢出等细粒验收。

2026-09-07，用户对 `Run` fixture 的 Current Tool Header 截图确认“效果 OK”：左侧使用当前 Tool 图标与标题，右侧保留独立 `×`，不再显示折叠箭头。该视觉关系纳入本轮冻结目标。

同日根据真实 Workbench 对照，Preview 在 Primary 与 Right 两侧外层都模拟 VS Code 宿主的圆角、边框留白和中间 gap；这是为了提高原型观感保真度的 preview chrome，不属于插件 Webview 能力或共享组件契约。VS Code 原生 View Header 的目录命令无法提供 persistent 蓝色 toggle 高亮，因此 Preview 也取消该视觉高亮，只保留 `aria-pressed`、图标切换和 tooltip 的状态语义。

### 3.3 响应式原则

```text
窄：     Header
         Directory
         Toolbar：固定尺寸 Ribbon，隐藏项进入唯一 …
                  下级导航自动减少网格列数
         Current Tool
         Open Items 横向滚动 + …

标准/宽：只增加容器可用空间和网格列数；
         不把 Ribbon 按钮拉宽，不改变按钮原有尺寸设定。
```

- 窄 / 标准 / 宽控制的是 Primary 容器宽度，不是 Ribbon 按钮密度。
- 拖动 Primary / Right View 分隔线时遵循同一原则。
- 分隔条支持键盘左右键按 `20px` 调整，并同步维护 `separator` 的 `aria-valuemin`、`aria-valuemax`、`aria-valuenow` 与像素说明。
- 页面本身不应成为日常纵向滚动边界；Current Tool 内容区负责主要纵向滚动。

## 4. 分区需求

### 4.1 Native View Header

| 编号 | 状态 | 要求 |
| --- | --- | --- |
| H-01 | 已确认 | Header 动作顺序为 `目录 → 忽略 → 设置` |
| H-02 | 已确认 | 恢复目录显隐按钮；状态图标和 tooltip 要能表达当前是“显示目录”还是“隐藏目录”，不模拟原生 Header 不支持的 persistent 蓝色高亮 |
| H-03 | 已确认 | 图标尽量使用或对齐 VS Code Codicon 的笔画、尺寸和对齐，不使用风格不一致的自绘替代 |
| H-04 | 待确认 | Ignore 图标保留两个候选做同屏或连续 A/B 对比：当前候选与原先候选，依据深色、浅色和高对比下的辨识度决定 |
| H-05 | 已确认 | Settings 恢复原来的设置图标与表现，不继续扩展为新的视觉样式 |
| H-06 | 已确认 | Ignore 与 Settings 只切换 Current Tool，不增加 Right View 标签 |
| H-07 | 原型中 | 三个动作的键盘焦点、`aria-pressed`、tooltip 和 16px 图标基线需要一起点检 |
| H-08 | 原型已实现 | 按 VS Code `1.136.1` 的宿主基线模拟固定 `35px` Header 外框与 `24px` Header 动作；该数值只提高 Preview 保真度，仍待新的真实 Host / 主题人工点检 |
| H-09 | 原型已实现 | “代码辅助”注册语义图标统一为 `code-assistant`；正式资源派生自 `media/tools/code-assistant.svg`，Preview 复用同一 SVG 轮廓并保持 `1.8` 笔画，不另造近似图标 |

### 4.2 Directory

- 固定为一行，只表达当前目录上下文、选择结果和目录选择动作。
- 左侧文字为 `目录`，中间选择器占用剩余宽度并整体截断，完整值保留在 tooltip / 无障碍名称中。
- 右侧只有可执行的文件夹选择按钮；不在目录行左侧放装饰性文件夹图标。
- Header 的目录按钮只控制整行显隐；显隐不得重置当前目录选择。
- 重载页面后恢复显隐状态和已选的原型目录场景。

### 4.3 Toolbar / Ribbon

| 编号 | 状态 | 要求 |
| --- | --- | --- |
| R-01 | 已确认 | Ribbon 紧凑态维持固定尺寸；展开态按内容宽度布局并保留 `50px` 最小宽度，宽模式不得均分撑满 |
| R-02 | 已确认 | 展开态使用“图标 + 短名称”，空间不足时可换行 |
| R-03 | 已确认 | 折叠态保持单行、图标优先；不可见项必须仍可从唯一 `…` 到达 |
| R-04 | 已确认 | 展开 / 折叠复用同一份 Ribbon 模型和激活通道，不复制第二套按钮或状态 |
| R-05 | 已确认 | Toolbar 只有一个 Ribbon `…`；它同时承担隐藏项入口和后续工具栏定制入口 |
| R-06 | 已确认 | 左侧 16px chevron 控制 Ribbon 展开 / 折叠；不增加密度按钮，不删除一级导航 |
| R-07 | 原型已验证 | 窄 / 标准 / 宽与自定义拖拽宽度下，按钮尺寸保持不变、选中态不丢失 |
| R-08 | 已确认 | 有下级工具的 Group 只增加小型折叠箭头，不另造一套按钮样式；箭头表达可展开性，蓝色下划线表达当前选中 |

`…` 不能只是视觉占位。菜单选择和可见 Ribbon 按钮选择必须进入同一激活逻辑，并在当前项上表达选中状态。

原型浏览器在窄 / 标准 / 宽三档实测：紧凑态始终为 `34 × 32px`；展开态高度为 `58px`，宽度按图标和正式短名称内容计算，最小 `50px`，不再固定为 `68px`。顶层搜索替换入口的正式 Ribbon 名称为“替换”。CSS 回归同时锁定展开态换行、紧凑态单行和下级导航 `20px` 左缩进；真实 Host 已确认整体观感，字体、缩放及主题极值仍按细粒矩阵复核。

### 4.4 Toolbar 下级导航

下级导航属于当前 Ribbon Group，不是独立的第五段。

```text
Ribbon 行
└── 左缩进 20px 的下级导航
    [icon 名称] [icon 名称] [icon 名称] [Aa]

隐藏名称后
└── 左缩进 20px 的下级导航
    [22px icon] [22px icon] [22px icon] [Aa]
```

| 编号 | 状态 | 要求 |
| --- | --- | --- |
| N-01 | 已确认 | 不显示“功能目录”等标题，不显示大纲边框，不提供“大纲 / 网格”双模式 |
| N-02 | 已确认 | 只保留紧凑网格布局，并相对 Ribbon 内容左缩进 `20px` |
| N-03 | 已确认 | `Aa` 是名称显隐开关，固定在下级导航右侧，滚动或列数变化时仍可到达 |
| N-04 | 已确认 | 纯图标态的工具图标为 `22px`，与 Ribbon 的可辨识尺度协调；不能缩回看不清的 16px 小图标 |
| N-05 | 已确认 | 显示名称时使用图标 + 短名称；完整名称保留在 tooltip 和无障碍名称中 |
| N-06 | 已确认 | 当前 Ribbon Group 没有下级按钮时，隐藏整个下级导航及 `Aa`，不保留空白行或分隔线 |
| N-07 | 原型中 | 网格列数应由下级导航自身宽度决定；改变侧栏宽度不能切换成另一套状态机 |
| N-08 | 已确认 | Ribbon 与下级网格之间不使用通长横线，依靠当前 Group 的底部选中线形成类 Tab 的连接感 |
| N-09 | 已确认 | 下级区域使用“上边开放、左右与底边包围”的下展面板，继续保留 20px 左缩进，表达它是当前 Group 的展开内容而非独立 Block |

`Aa` 只改变标签呈现，不激活工具，不改变当前 Tool、MRU 或 Right View。

### 4.5 Current Tool

- Current Tool 是唯一一级内容 Block，并已固定为始终展开；Header 左侧不显示 disclosure chevron，也不保留不可操作的折叠占位。
- Header 左侧依次显示当前 Tool 图标和标题，右侧仍保留独立 `×` 关闭动作。图标来自同一 Tool descriptor，不按标题或 DOM 位置推断。
- `×` 只关闭当前逻辑工具，并按现有 MRU 选择可恢复项；不得被解释为折叠、隐藏内容或停止任务按钮。
- Header 与 `×` 要支持键盘和清晰焦点；关闭后把焦点恢复到仍存在且合理的控件。
- Current Tool 内容始终显示，并作为 Primary 的主要纵向滚动区；Directory、Toolbar、Current Tool Header 和 Open Items 保持固定。
- 没有任何 Tool 打开时，不高亮 Navigator 中的 Tool，也不生成 Group 占位 View。Preview 按正式空态显示 `KT Auto Code` + `layout` Header，正文显示 PHOENIX、插件状态和 5 个常用链接；该空态不伪造当前 Tool 或打开项。

> 正式迁移 / 回归点检：“Current Tool 固定展开”已获用户单独批准，`AGENTS.md` 与权威前端契约已同步，v0.9.0 正式 Primary 源码也已按固定展开方向接线。未收口的是真实 VS Code 中长表单、运行中任务、窄侧栏、焦点与生命周期回归，不再把“是否取消折叠”列为待决策项。

### 4.6 Open Items

- 原型按第四个视觉区域显示 Open Items，固定在 Primary 底部。
- 使用共享 `KtcOpenItemsBar` 组件及一份可序列化模型；预览页不得继续维护一套外观相似但事件不同的手写栏。
- 每项显示图标、短名称和关闭动作；完整名称必须保留在 tooltip 与无障碍名称中。
- 项目过多时允许横向滚动，所有项目仍可从本区域自己的 `…` 到达。这个 `…` 与 Ribbon 的 `…` 分属不同区域，不违反 Ribbon“唯一 `…`”约束。
- 支持激活、关闭、关闭其他项、左右方向键、Home / End、Delete、Context Menu / Shift+F10 和 Escape。
- 激活项、打开项列表和 MRU 使用同一状态源；Primary 与 Right View 不得各自维护互相漂移的副本。

Open Items 作为第四段的层级已在原型中确认，随后已获批准并接入 v0.9.0 正式 Primary DOM；打开项、激活项、关闭和 MRU 仍由 Host 的同一状态源负责，真实 Host 的整体视觉也已确认。当前剩余点检是 Open Items / MRU 的 Extension Host 重启持久化、完整多实例，以及焦点恢复和溢出细节；不再把回退 Current Tool Footer 作为候选。

### 4.7 共享 Web Components 边界

四段大区域冻结后，后续实现以“外壳稳定、内部组件化”为目标。原型页和正式 Webview 应消费同一批 Host-neutral Web Components，不各自复制相似 DOM、CSS 和点击协议。

```text
Host / Preview Store（状态、MRU、路由）
└─ <ktc-primary-shell>                 只固定四个 slot 顺序与滚动边界
   ├─ <ktc-directory-bar>             Directory 的可序列化投影
   ├─ <ktc-toolbar-strip>             Ribbon、Group 折叠与唯一 …
   │  └─ <ktc-tool-navigator>         当前 Group 的紧凑工具网格
   ├─ <ktc-current-tool-region>       Tool 图标、标题、关闭和 Body slot
   └─ <ktc-open-items-bar>            打开项、溢出与上下文动作
```

组件契约：

1. 只接收可序列化 ViewModel 或明确 slot，只发出带稳定 ID 的语义事件；
2. 不导入 `vscode`，不读写文件、Git、进程、工作区设置或 `localStorage`；
3. 不拥有业务 Controller、MRU 真源、工具任务或跨组件路由；
4. 选中、折叠、关闭、溢出等公共行为由组件用语义事件请求，Host / Store 更新快照后再投影回组件；
5. 主题和密度使用 VS Code token 与组件自有 CSS，业务消费者不依赖 Shadow DOM 内部 selector；
6. 不为每个小按钮创建组件；以稳定的区域责任、可复用行为和独立测试边界作为拆分依据。

当前原型已经由 `KtcPrimaryShell`、`KtcDirectoryBar`、`KtcToolbarStrip`、`KtcToolNavigator`、`KtcCurrentToolRegion` 和 `KtcOpenItemsBar` 组合，不再为四个一级区域维护第二套手写外壳。`KtcCurrentToolRegion` 已保真替换原型手写 Header：可序列化 model 只包含 `itemId / title / icon`，`itemId` 与 Open Items 的宿主无关实例身份对齐；关闭按钮只发出带 `itemId` 的语义 intent，MRU、Right View 和任务生命周期仍由 Host 决定。组件 Shadow DOM 只创建一次，同一 item 的标题 / 图标更新不重建 slot 或丢失滚动与焦点。

`KtcDirectoryBar` 只投影 `label / value`，并用 `select / choose` intent 把目录动作交还 Host；`KtcToolbarStrip` 只投影 `mode / groupContentVisible / overflowOpen`，保留同一个 slotted Ribbon 与 `KtcToolNavigator`，唯一 `…` 的菜单内容和定位仍由 Host 管理；`KtcPrimaryShell` 则是零 model、零 action 的四 named-slot Grid，只固定顺序与唯一 Current Tool 弹性轨，不拥有边框、按钮、Store 或业务路由。三者都已先写组件契约与测试，再替换原型；v0.9.0 正式 Primary 已消费同一批独立 Webview bundle，并已获真实 Host 整体视觉确认，剩余的是重启状态恢复和焦点 / 溢出等细粒点检。

`KtcToolNavigator` 目前需要一层明确的兼容呈现契约：未声明 `presentation` 时继续使用正式 View 已有的标题、分组和大纲 / 网格行为；Phoenix Webview Preview 显式声明 `presentation: "compact"`，使用无标题、扁平紧凑网格。该适配避免原型视觉在正式迁移前通过共享组件意外改变正式 View，最终是否删除 legacy 呈现应在正式迁移完成后单独决定。

### 4.8 Tool、实例与双 Surface

“Primary 是否显示”只是预览工作台开关；它与某个工具是否拥有 Right View 不是同一个概念。凡是会进入 Tree、Ribbon 或 Open Items 的 UI Tool 都必须声明 Primary Surface；Right Surface 按需增加：

```text
Tool Registration
├─ descriptor：toolId、标题、图标、instancePolicy
├─ primary：full | companion（必需）
├─ right：Surface Adapter（可选）
├─ shared controller / actions
└─ instance records：toolId + instanceId + sessionId
```

- `primary: full`：Primary 由消费者提供完整内容；Right 可无，也可另外提供大型结果、预览或辅助编辑。例如 Ignore、Settings、Git、Run、成员排序、ASCII / 编码 / UUID 修正；当前 AutoBuild 原型也采用 `primary: full + optional right`。
- `primary: companion + right`：复杂编辑、预览、长日志或大表单位于 Right View，Primary 必须保留最小 companion；例如头文件引用修正、项目改名、自动代码。
- `right-only`、空 Primary 和孤立 companion 是非法组合，必须在 Catalog 边界拒绝；`primary: full + right` 是合法的消费者选择。
- companion 的最小必需内容是 Right 状态与“回到 View”；可按需提供 2–6 个短统计和 1–3 个安全动作。没有统计时只显示状态，不生成空卡片。
- companion 只消费固定、可序列化的 ViewModel（status / facts / actions），只发出 `actionId`；不接收 HTML、函数、命令行或任意 payload，不执行业务统计逻辑。
- 框架不根据表格行数、字段数或“复杂度”自动选择宿主。Primary 内是表单、统计还是复杂表格，以及是否再注册 Right，都由 Tool 消费者显式声明。
- 两侧属于同一个逻辑实例，通过 `toolId + instanceId + sessionId` 寻址并交换经过运行时校验的语义消息；不得通过标题、DOM 位置或任意 HTML 传递动作。
- `instancePolicy` 从契约开始就区分 `single` 与未来 `multiple`。第一阶段可以只实现 single，但打开项、MRU 和消息身份不能永久只用 `toolId`。
- 原型不提供 Current Tool 折叠；关闭逻辑 Tool、关闭 / detach Right 标签、停止任务和销毁实例仍是不同动作。框架统一维护 attach / detach / restore / destroy，业务 Controller 不从某个视图的 `×` 猜生命周期。
- Navigation Tree 只表达 `group | toolId`；Surface 放置属于独立 Tool Catalog / Registry。Group 只展开下级，不伪装为普通可执行 Tool。
- 只有 Action 而没有 UI Surface 的能力由统一 Action Registry 管理，不伪装成可打开的 Tree Tool。
- 可停靠对话框本轮不实现。未来可增加 `dialog` Surface Adapter，但不应修改既有 Tool identity、业务 intent 或 Shell 组件契约。

当前架构是“协议原型接近、统一管理尚未形成”：已有工具注册、Primary companion、Editor session/revision 门禁和三个 Host-neutral Web Components；但 Registry 仍主要是工具数组，Primary / Right 工厂、实例策略、恢复和销毁尚未成为统一契约。本轮先在安全原型 Catalog 中验证分流与联动，再为正式 Registry 设计兼容 adapter，不推倒现有 companion。

原型现阶段仍把 Right 标签的 `×` 当作“关闭逻辑打开项”，并未实现独立的 Right detach 与最终 instance destroy。这是正式 Framework 迁移前的明确点检点，不得把当前简化行为固化为生命周期契约。

#### 4.8.1 Tool 消费者统一创建与通信

Primary 和 Right 不是两套互相查找的页面，也不是由框架根据 UI 复杂度临时拼装出来的两个工具。一个 Tool 消费者（业务功能作者）应在同一注册项中声明必需 Primary、可选 Right，并为一次逻辑打开创建同一个实例上下文：

```text
Tool Consumer Registration
├─ descriptor：toolId、标题、图标、instancePolicy
├─ createController(instanceRef) ────── 业务状态与生命周期真源
├─ createPrimarySurface(...) ───────── 必需；full 或 companion
└─ createRightSurface(...) ─────────── 可选；完整配置、结果或长日志

Framework Instance Coordinator
├─ instanceRef：toolId + instanceId + sessionId
├─ attach / detach / restore / destroy
├─ Primary intent ─┐
│                  ├─ semantic actionId → controller
└─ Right intent ───┘
                    controller state
                           │
               immutable serializable snapshots
                    ┌──────┴──────┐
                 Primary        Right
```

- 框架提供同一实例的 Controller 挂载点、寻址、消息通道、运行时校验和生命周期协调；Tool 消费者负责业务 Controller、Primary 投影，以及需要时的 Right 投影。
- Controller 是共享业务状态真源。Primary 与 Right 各自只消费不可变、可序列化、带 revision / session 身份的快照，并通过稳定的语义 `actionId` 发出 intent。
- 两个 Surface 不直接读取对方的 DOM、Shadow DOM、模块变量或组件实例，也不把另一个 Surface 是否仍在内存中作为业务前提。真实 VS Code 中两侧可能独立 reload、隐藏或 dispose，直接互读无法形成可靠契约。
- Right 可以保留尚未提交的本地输入草稿；一旦 Primary 的按钮或统计依赖该数据，必须先把它转成经过校验、带 revision 的 Controller 状态或领域 intent，再由框架投影给两侧。
- 快照只传递显示和决策所需的数据；复杂表格是否放 Primary、是否注册 Right，仍由 Tool 消费者决定，不由共享通道或框架代替业务判断。

原型 fixture 当前按一份独立 `Preview Tool Catalog` 演示：

| 呈现 | 工具 |
| --- | --- |
| Primary 完整界面 | Ignore、Settings、Git、Run、成员排序、ASCII 修正、编码修正、UUID、CAA UI |
| Primary 完整界面 + 可选 Right View | 编译工具（AutoBuild） |
| Right View + Primary companion | 头文件引用修正、项目改名、自动代码 |

顶层 Ribbon 同样遵循 `group | tool`：当前只有“代码辅助”是有下级的 Group；Git、Run、替换和自动代码是直达 Tool。Group 只展开/收起 Navigator；若组内已有打开叶子，可以回到该组 MRU 叶子，但 Group 本身不生成 Current Tool、Right View 或 Open Item，也不自动打开第一个孩子。Catalog 决定 Tool 的 Surface 投影，Navigation 只持有 Group 和 `toolId`。PackageIncludes 与 ProjectRename 采用 companion，显示状态、短摘要和经 Controller 校验的安全动作，不再把“已在右侧打开”拼进工具标题；AutoBuild 与 Codegen 由 Catalog 声明为 Primary full，并同时提供 Right。

显示文案不属于 Surface 插槽。内置 `KtTool` 从中央 `src/tools/toolRegistrationCatalog.json` 解析 `title / shortTitle / description`；外部可选模块保留其扩展版本管理下、已校验的 module manifest 注册文案。Primary、Right、Open Items、Navigator、Ribbon 和 Block 均按叶子 `toolId` 解析，不允许消费者改名，也不显示 `代码辅助 ·` 或 `KT Auto Code ·` 等前缀。完整归属只放 tooltip / `aria-label`。因此 AutoBuild 在各处统一显示为“编译工具”，搜索替换的 Ribbon 短名称统一显示为“替换”。完整 Registry Builder 仍是后续工作，不因当前内置目录接线而宣称完成。

### 4.9 Right Shell 与 Preview 输出模拟

当前原型中的每个 Right Surface 使用同一层薄 Right Shell；框架按 `toolId` 从注册 JSON 解析标题，消费者只提供 Header actions 和 Main 内容，不重复创建外壳或自定义标题：

```text
Right Workbench
├─ 原型标签栏
├─ Right Shell
│  ├─ Header（约 44px、贴边）
│  │  ├─ 左：title
│  │  └─ 右：actions slot
│  └─ Main default slot（Tool 消费者提供）
│     └─ scrollMode：vertical | both | none
└─ Framework Output Block（所有原型动作的模拟反馈）
   ├─ Header：左 title，右固定 ×
   └─ Log：显示时始终展开；追加后滚到最后一行
```

- Header 高度固定在约 `44px`，与 Right 内容左右边缘贴合，不增加卡片式外边距；左侧只有 title，右侧为 actions slot，不显示副标题。
- Main 使用 default slot，由 Tool 消费者完整提供；框架只应用声明的 `scrollMode: "vertical" | "both" | "none"`，不解析内容复杂度，也不替消费者生成业务布局。
- `vertical` 允许 Main 纵向滚动，`both` 允许双轴滚动，`none` 由消费者自己组织内部滚动；每种模式都要避免与工作台或工具内部形成无意的重复 scrollbar。
- Right 工作台底部只保留一个框架级 Output Block，统一显示当前浏览器原型中所有按钮触发的模拟反馈。Tool 内部不再重复放置模拟输出框，也不自行维护第二份输出历史。
- Output 不可折叠，不显示 chevron，也没有“只保留 Header”的折叠态；只要可见，日志内容就始终展开。Header 左侧显示标题，右侧固定 `×`。
- Output Header 的 `×` 只隐藏 Output，不关闭当前 Tool、不清空日志、不停止任务，也不销毁 Right Surface 或共享 Controller。预览顶部与 `Primary` 同组提供独立的“输出”显隐开关，用于隐藏后的恢复。
- Output 显隐属于 Preview Store 的框架 UI 状态，刷新后按规范化快照恢复；它不进入 Tool snapshot，也不随 Right 标签切换而重置。
- 每次追加模拟日志后，Output 日志视口自动滚动到最后一行，使最新反馈立即可见。
- Tool 按钮仍只发语义 `actionId`；原型框架把模拟执行结果写入公共 Output Block。该输出区只是在浏览器中模仿 VS Code Output 的预览验证设施，不改变 Tool Controller / 双 Surface 快照契约，也不能成为正式插件能力。

正式边界结论（2026-09-07）：VS Code 中的“输出”就是原生 Output。v0.9.0 继续以唯一 `OutputChannel("KT Auto Code")` 作为正式系统日志真源，沿用现有正式代码逻辑；插件不实现自定义 Output Block。`KtcSystemOutputBlock` 只留在 Preview 源码中，不嵌入业务 Right View、不生成正式 bundle，也不进入 VSIX。

Right Shell 是最新原型契约，v0.9.0 已将它作为薄外壳接入现有 AutoBuild、项目改名与 PackageIncludes Right WebviewPanel；消费者原有业务 Main、动作 ID 和原生标签 / 关闭语义保持不动，真实 Host 整体视觉已获确认。尚未收口的是 serializer / reload、dispose / 重开及多实例隔离等生命周期证据；日志按上述正式边界继续使用原生 OutputChannel，不嵌入任一业务 Right View。

### 4.10 AutoBuild 原型边界与迁移护栏

AutoBuild 采用 `primary: full + optional right`。本轮先在浏览器验证“哪些现有信息适合进入 Primary”，用户确认左右初步效果可以后，已把限定范围同步到正式 Primary、正式 Right 和同一个 Controller；这仍不是重新设计整个编译工具，也不等于新的真实 Extension Host 已人工验收。

已确认作为 Primary 候选迁移区块：

| Primary 区块 | 原型职责 |
| --- | --- |
| 当前配置条 | 放在 Current Tool 内容最前；显示当前配置或“未保存”，提供“打开 / 保存 / 另存 / 关闭 / 详细配置”，并在同一区块提供紧凑的最近配置选择 |
| 执行（含运行概览） | 位于当前配置之后；固定为“脚本 → 预检配置 → 启动 → 停止”，其后是“并行编译”、当前状态、打开 Output 的入口及启用项目 / 任务 / 失败统计，不承载长日志。“脚本”复用正式既有脚本管理能力，Right Header 不保留重复入口 |
| 维护与清理预览 | 已收敛：执行区以一个“清理”按钮打开 Wing 统一对话框，按方式承载规则清理、Git 强制恢复和 CMake 清理；维护区只保留脚本同步。Preview 均只模拟反馈、绝不删除文件 |
| 工程环境摘要 | 放在 Primary 最后；只读显示平台、CAA / 工具链等已解析环境摘要，不在此完成详细探测配置 |

本轮 AutoBuild 使用独立 `ui-preview/fixtures/auto-build.sample.json` 作为 Primary 与 Right 的唯一完整样例快照。该 JSON 固定一个已准备好的 `ready` 场景：配置、Root / 3rdParty / 项目、探测信息、任务、环境和维护数据首次渲染时就齐全，不演示从空态逐步加载。以后可直接修改该 JSON 驱动两侧的数据值、初始状态和点检数据；renderer 不再各自硬编码样例。DOM 结构、布局、动作语义和交互规则仍由代码定义，JSON 不承担页面 DSL 或业务实现职责。fixture 在进入原型状态前经过运行时 schema 校验；最终自动测试目标是覆盖 schema 版本、必填 / 未知字段、枚举与数量边界、重复稳定 ID，以及 Primary / Right 对同一输入的关键投影，当前显式负例缺口记录在第 11 节。它是 Preview-only 的安全数据，不得进入正式 Controller、build graph 或 VSIX，也不能作为正式数据正确性的证据。

构建配置的当前原型不再另造一套字段布局：它至少按正式 Right 的控件类型与 `角色 / 目录 / 分支` 字段关系展示 Root、工作目录、3rdParty 和 CMake 项目语义，并继续由上述 fixture 提供已准备好的值。当前目标是“控件和关系与实际一致”；是否把行列进一步压缩或重排属于后续 Preview 研究，未确认前不改变正式 Right。

本轮状态（2026-09-09）：Preview 已读取独立 ready JSON，Primary / Right 使用同一原型状态投影；正式 Primary、正式 Right 与 Controller 限定切片也已落地。用户已确认“左右效果初步可以”，因此本轮停止 AutoBuild 二次视觉细调；**该确认不替代新的真实 Extension Host 人工验收**。Primary 当前顺序为 `当前配置 → 执行（含运行概览与清理入口）→ 维护（脚本同步）→ 工程环境`；Right 不显示第二个并行 checkbox。Primary 不显示“项目摘要”，维护与工程环境初始展开，工程环境固定为最后一个区块。

本轮明确点检的 Right 呈现候选是：

- “构建配置”的 `更新 ROOT_DIR / 更新 3rdParty` 两个 checkbox 移入该 Block Header，点击 label 或 checkbox 不折叠 Block；
- “项目表”与“库探测结果”仅在展示层合并为“项目与仓库”Block，“选择目录… / 探测当前目录 / 移除未启用项”位于 Header，“探测列”checkbox 控制 Commit / Origin / 状态列；Header 内动作点击不折叠 Block，正式 `projects` 与 `repositorySnapshot` 仍是两个领域结构；
- “项目与仓库”的操作列固定在右侧，横向滚动时仍可达；探测 / 运行使用正式同款图标，并保留 `title`、`aria-label`、焦点与禁用态；
- Right 删除可见的“运行前清理仓库”checkbox；规则、Git 强制恢复和 CMake 清理统一由 Primary 执行区“清理”按钮打开 Wing 对话框，不再显示两个常驻清理块。Right Header 的“脚本”也移到 Primary 执行 actions 首位并删除重复入口；Right 的 Root 编排脚本状态 / 同步行已移除，唯一脚本同步入口留在 Primary“维护”；
- 正式 Right 顶部旧配置工具栏中的“打开 JSON / 保存 / 另存为 / 最近配置 / path”重复呈现已强制隐藏；底层配置能力仍保留，既有脚本管理业务没有随工具栏清理而删除；
- 除这些已由用户明确指出的呈现候选外，Preview Right 仍不作为正式 Right 的通用设计规范。

已保留的正式 Right 能力与业务语义：

- 完整构建配置的字段、校验和草稿；
- 项目选择 / 排序 / 探测 / 去重 / 执行，以及独立的 `projects` / `repositorySnapshot` 领域状态；
- 任务树；
- 详细仓库探测数据；
- 既有脚本管理逻辑。

Right 中未被上方逐项确认的区域仍只作为结构占位，用于检验 Primary 与 Right 的职责边界、可用高度和联动；占位布局不是重写规格。上方的 Block 合并、Header 控件和入口移动也只改变展示与入口，不授权重写正式领域结构或业务流程。

正式迁移必须遵守以下护栏：

1. 只同步本节已确认的 Primary 区块和 Right 呈现候选，以兼容 adapter 接入；不得借迁移之机重排、删改或重写未点名的 Right UI 和业务。
2. Primary 与 Right 复用同一个 AutoBuild Controller、实例身份、不可变 snapshot 和语义 `actionId`；不得复制构建状态机、配置读写、项目解析或运行逻辑。
3. Primary 的统计、摘要和动作是现有领域状态的投影，不建立第二份真源。Right 未挂载或被 reload 时，Primary 仍通过 Controller / Framework channel 工作。
4. Framework Output Block 位于 Right 工作台底部，属于 Preview 而不属于 AutoBuild Tool；AutoBuild 内部不得复制该模拟输出区。正式日志和任务输出始终沿用 VS Code 原生 OutputChannel，不从原型占位迁移。
5. 原型确认后先做区块级视觉、快照和 action 契约测试，再进入真实 Extension Host；未经真实数据与生命周期验证，不把原型状态写成正式迁移完成。
6. 正式 Primary 的“预检配置 / 启动”不能直接消费过期的 Host 缓存。执行前必须原子获取 Right 当前未保存草稿，并校验 session、document、draft 与 revision；Primary 与 Right 的重复入口最终调用同一 Controller 执行路径。
7. 正式“并行编译”、最近配置和“手动清理 Root”复用现有配置、加载和危险操作逻辑。“手动清理 Root”由 TypeScript 读取当前 AutoBuild JSON 的 `rootCleanupYaml`，支持直属目录链接 glob、直属精确目录和直属文件 glob；确认前显示安全 Root、分类规则、数量和精确匹配清单，确认后只删除整体复验通过的冻结快照。目录链接只删除链接本身，目录树不跟随符号链接。
8. 新的“清理仓库”是独立手动动作，不是“手动清理 Root”的换名，也不是原 `clean` checkbox 的直接搬家。本轮保留已实现的简单按钮：正式 Controller 将实际 Git top-level / CMake build 精确目标用 modal 展示并确认，只清理而不自动启动构建，结果进入原生 Output，并保留 schema v2 `clean` 兼容与迁移测试。
9. `ui-preview/fixtures/auto-build.sample.json` 只驱动浏览器样例；正式迁移用同形但来自 Controller 的真实 snapshot 替换输入。Preview fixture、模拟 Output 和原型 reducer 均不得成为正式业务依赖。
10. Block Header 内 checkbox / button 点击不得触发 `details` 折叠；固定操作列在窄宽和横向滚动下仍可操作，纯图标动作必须保留 `title`、`aria-label` 和键盘焦点。
11. 首次打开必须创建 fresh draft，不自动载入旧 PATH / STATE；关闭配置原子读取最新草稿并提供保存 / 不保存 / 取消。另存位置依次尝试当前草稿工作目录、当前 JSON 目录、插件工作目录和 VS Code 工作目录，再交给系统默认位置。
12. 已载入配置或已有项目时改变 `workingDirectory` 必须进入显式 mismatch 门禁；路径敏感动作在用户选择“新建配置”或“保留项目”前均不可运行，选择后清除与新目录不再可信的探测、仓库快照和任务状态。
13. 单项目或单任务运行只更新本次相关任务行，不能因整页快照投影清空其他项目已有的失败 / 完成结果；预检保留同一工作已有结果，只有全量“启动”建立完整新一轮计划。
14. 项目选择、目录发现、探测及仓库快照等异步回包必须绑定当前 `documentId + draftRevision`；用户已修改配置、切换项目或重开 Right 时，旧回包直接丢弃，不能覆盖新表。
15. 仓库清理确认必须展示解析后的实际 Git top-level 和精确 CMake build 动作，脚本执行时再次校验实际仓库根；手动 Root 清理绑定预览时的 Root / 文件身份快照。计划、确认和执行阶段均可被“停止”取消，迟到确认不得恢复删除。

原“Root 编排脚本”状态 / 同步入口已改名为“脚本”，眉毛为“ROOT/tools 与 ROOT/sample 同步”，只保留在 Primary“维护”；Right 对应行已清理。点击会直接新建或覆盖四个固定脚本 / 样例文件，原生 Output 每个目标记录一行“新建/替换”。该入口与已经从 Right Header 移除、用于打开脚本管理浮窗的通用“脚本”动作不是同一件事。

正式脚本管理浮窗已改用 VS Code 主题 token 覆盖背景、文字、输入、边界、焦点、按钮、hover 与 disabled。代码级主题回归已补充，仍须在真实深 / 浅 / 高对比 Host 点检可读性；Preview 画面不能替代这项验收。

结构化 YAML 已用于独立的“手动清理 Root”，不替代“清理仓库”的既有 clean-only 计划。当前默认只含 `delete.directories` 的 `objects/build` 与 `delete.files` 的 `*.obj/*.exp/*.pdb/test_*.exe`，不默认写入 `Kt*/KTC*/PNX*`。规则文本缓存进当前 AutoBuild JSON；插件用 TypeScript 执行，PowerShell 与 sample 继续作为可复制工具和语义样例。下个版本再评估把解析、冻结和清理能力提炼到 Wing。

配置上下文三项规则已经实现并有定向测试：MRU 仅供用户显式选择，启动、重开或关闭后不自动载入最近配置；关闭当前配置提供保存 / 不保存 / 取消三态；配置中的 `workingDirectory` 与当前目录不一致时，用户必须显式选择新建配置或保留项目，路径敏感动作不会静默切换、覆盖或 fallback。真实 Host 仍需检查按钮密度、默认焦点和提示可读性。

AutoBuild 的二次细调已按停止线冻结；用户随后明确启动其余 Right View 的独立原型轮次，因此项目改名、头文件引用、搜索替换和自动代码的后续记录不属于 AutoBuild 范围扩张。

### 4.11 项目改名与自动代码确认效果

项目改名的固定完成态由 `ui-preview/fixtures/right-primary.sample.json` 驱动。Primary 采用全宽相接的 VS Code Block 基线，顺序为 `目录 / 选择目录 → 紧凑动作 → 总览 → 项目档案 → 状态 / 短摘要`。目录行省略重复的“分析目录”标签，并按 `末级目录名 @ 父路径` 显示；完整路径保留在 tooltip / aria-label。动作显示“查看 / 取消 / 对比 / 改根目录…”，完整语义、禁用原因及根目录源 / 目标也由 tooltip / aria-label 补足。

“最近输入 / 项目方案”与“项目档案”不再显示成两个重叠下拉。一个 `PnwCombo` 按当前项目方案、用户最近输入、共享档案分组；项目档案名称与显式保存仍在同一 Block。每一行保留 **×** 位置，前两组可单条删除、共享档案禁用删除；菜单底部“全部清空”仍有 modal 二次确认且不影响共享档案。外部独立 **×** 和“清空”按钮已取消。

总览移入 Primary 并位于项目档案之前；Git 对比和条件式根目录改名只在 Primary 提供入口。Right 删除重复目录、完成提示和总览，只保留 Header 执行流、五列改名方案表格及命中 / 风险结果。五列为 `启用 / 类型 / 原来 / 目标 / 操作`，项目名、前缀和派生规则共用同一源 / 目标列；`+ 规则 / 常用 / CAA / 全不选 / 派生`属于规则编辑，统一放在改名方案 Block Header。

Right 中未出现在固定截图的条件式能力仍须保留：相关写法加入规则、逐项打开 / Diff、加载更多、完成门禁、进度与错误反馈。Preview 的简化完成态不是删除这些正式能力的授权。

正式融合点检（2026-09-08）：没有删除项目改名领域能力；只清理 Right 的重复目录、动作、总览、方案选择和安静完成提示。冻结报告已统一为分析实际使用的规范化规则，修复刚分析后 Diff 仍可能报命中数不一致；Git dirty / 状态不可检查改为风险 modal 后由用户显式继续；项目改名气泡及 modal 选择同步进入原生 KT Auto Code Output。完整删改表见[“项目改名”View 整改方案](./项目改名View整改方案.md#13-090-primary--right-融合与删改点检)。

自动代码继续直接复用正式 `kt-codegen-primary-panel` 和固定 model。顶部五个动作显示为“打开 / 导入 / 应用 / 刷新 / 扫描”，运行态显示“取消”；用户已确认短文本比图标清楚。2026-09-09 已把短文字与窄栏换行放入 Wing 共享组件，删除 Preview 私有 Shadow DOM 改文字补丁，正式 Host 与 Preview 使用同一实现。JSON 配置、应用报告、候选、元数据字段和报告目录入口有共享 DOM 事件测试；控制符目录已按 Wing 元数据提供完整 32 项（含旧兼容项），分组勾选和单项/可见输出有模拟反馈；初始全部“待预检”，不伪造源码命中。Right 仍是“选择模板 / 生成预览”的早期占位，与正式 JSON 参数表、预检、Apply、保存/重新加载尚未对齐；这些差异已记入《0.9.0 Wing 控件与自动代码整改目标》，不能把原型占位理解为正式功能。

### 4.12 搜索替换 Primary 原型融合

搜索替换采用“正式功能是能力真相、已确认 Preview 是布局候选”的融合原则。原型补回正式 Primary 已有的查询折叠、两行“搜索 / 替换”动作、最近记录选择与单条删除 / 清空、常用变形、项目改名跳转、文本 / 文件名 / 文件夹名范围、默认编码、Ignore 策略和共享结果面板；不再使用会改变正式语义的“预览 / 应用所选”。默认范围也与正式端一致：仅勾选文本，文件名和文件夹名默认关闭。

布局继续遵循 Primary 内部全宽相接、仅交互内容保留小 inset 的基线。常用变形展开后按 `启用 / 原来 / 目标 / 上移 / 下移 / 删除` 的紧凑多列呈现，搜索结果直接复用正式 `ktc-rename-results-panel`，避免维护第二套结果外观。当前阶段只完成可交互原型和回归保护，尚未改动正式搜索替换业务；后续由用户确认视觉后，再决定是否把这一排列映射回正式 Primary。

## 5. 轻量状态 Store

### 5.1 决策

不为这个无框架开发预览引入 Pinia。采用轻量、Pinia-like 的 `PreviewStateStore`：集中读取、规范化、修改、保存和重置状态，页面组件只消费快照并发出语义事件。

持久化信封使用明确版本：

```ts
interface PreviewStateEnvelope {
  schemaVersion: 1;
  state: PreviewPersistedState;
}
```

当前预览存储键为：

```text
ktAutoCode.uiPreview.state.v1
```

### 5.2 应恢复的 UI 状态

- 主题：深色 / 浅色 / 高对比；
- Primary 区域显示 / 隐藏；Right View 始终作为工作台主区域存在；
- Framework Output 显示 / 隐藏；Output 可见时始终展开，不保存折叠状态；
- Primary 宽度预设以及有效的自定义拖拽宽度；
- Directory 显隐与原型目录选择；
- Ribbon 展开 / 折叠；
- 下级导航显隐与 `Aa` 名称显隐；
- 当前 Tool 身份；原型不保存 Current Tool 折叠状态；
- 当前 Group、Tool、Editor 和打开项；
- Open Items 列表和 MRU 顺序。

### 5.3 存储约束

- 只保存可公开、可序列化的 UI 标识和布尔 / 枚举状态。
- 不保存绝对路径、源码、扫描结果、命令、凭据或真实业务 payload。
- 每次读取都经过运行时规范化：未知 ID、重复项、越界宽度和不合法枚举回退到安全值。
- JSON 损坏、浏览器禁用 / 写满 `localStorage`、schemaVersion 不匹配时，预览应回退默认状态且保持可用。
- 未来升级 schema 时，必须显式迁移或拒绝；不能把未来版本数据当成当前版本直接读取。
- 页面需要一个清晰但次要的“重置预览状态”入口，便于复现默认场景和排除旧状态干扰。

### 5.4 当前进度

- 原型中：`PreviewStateStore` 和 `schemaVersion: 1` 已接入页面，并提供开发控制条上的“重置”入口。
- 原型中：主题、宽度、Primary / Output 显隐、目录、Ribbon、下级导航、当前 Tool、Open Items 与 MRU 已由同一份快照读写；Current Tool 不再包含折叠状态。
- 原型中：开发控制条已删除“联合 / Primary / Right View”三选一；顶部同一控制组保留 `Primary` 与“输出”两个独立显隐开关，Right View 始终存在。
- 原型中：打开项身份已从 `primary:` / `editor:` 前缀归一为宿主无关的 `tool:<toolId>`；同 schema 内兼容读取早期前缀。正式多开前仍需升级为包含 `instanceId` 的引用。
- 自动验证：Store 白名单、损坏数据回退、schema 拒绝和 reset 测试通过；浏览器已完成一次主题刷新恢复快速检查。
- 原型已验证：停止后重启 `pnpm ui`、隐藏 / 恢复 Primary、改变宽度以及混合 Primary / Right 打开项之后，规范化 Store 快照仍能恢复一致场景；真实 Extension Host 重启和 Webview dispose 继续留作正式迁移点检。
- 正式迁移点检：浏览器 `localStorage` 只是原型存储；迁入扩展时应按设置分类改用 VS Code `workspaceState`、Workspace Folder Settings 或 User Settings，不能原样照搬。

## 6. 真实场景恢复

这里的“真实场景”是使用真实工具名称和合理生命周期的安全 fixture，不是执行真实业务。

至少保留以下代表场景：

| 场景 | 初始状态 | 需要验证的恢复结果 |
| --- | --- | --- |
| 头文件引用修正 | 代码辅助已选；Primary 显示摘要；Right View 标签打开 | 刷新后 Group、下级 Tool、Current Tool、Editor 标签和 Open Items 仍一致 |
| 项目改名 | 替换 Group；Right View 中保留原型表单 | 隐藏再恢复 Primary，不丢当前 Right View 与打开项 |
| Ignore | Header 进入 Ignore；Current Tool 显示范围选项 | 不创建 Right View 标签；刷新后仍可解释当前选择 |
| Settings | Header 进入 Settings；Current Tool 显示设置范围 | 使用原设置图标；不创建 Right View 标签 |
| 多打开项 MRU | 同时打开 Primary 与 Editor 工具后关闭当前项 | 按 MRU 回退，Open Items、Current Tool 和 Right View 不发生孤儿状态 |
| 无下级 Group | 选择 Git / Run 等无下级 fixture | 下级导航和 `Aa` 整体消失，Current Tool 仍能正常显示 |
| Primary 直达 Tool | 选择 Git / Run / Settings | Current Tool 显示完整 Primary 内容，不创建新的 Right 标签 |
| AutoBuild 双 Surface | 选择编译工具；载入完整 ready 样例 JSON | Primary / Right 从同一个 fixture 投影，Primary 显示 full 候选区块，Right 显示构建配置、项目与仓库及任务；两侧与同一打开项同步激活，不经过空态造数过程 |
| Companion 双 Surface | 选择头文件修正 / 项目改名 / 自动代码 | Primary 显示 companion；Right 标签、内容与同一打开项同步激活 |

场景恢复完成的判据不是“页面看起来差不多”，而是可见状态、ARIA 状态、打开项、MRU 和 Right View 投影都来自同一份规范化 Store 快照。

## 7. 主题、图标与响应式

### 7.1 主题

- 深色、浅色、高对比三种预览主题必须使用 VS Code token 语义，而不是为单一背景写死颜色。
- 选中、hover、focus、disabled 和分隔线在三种主题下都要可辨认。
- 颜色不能成为唯一状态信号；选中项同时使用 ARIA、边线或形状差异。
- 高对比模式需检查系统 forced-colors，而不只检查模拟的高对比配色。

### 7.2 图标

- Header 和 Ribbon 优先使用与 VS Code 一致的 Codicon 语义与 16px 基线。
- 下级导航纯图标态使用 22px，解决当前图标过小、难以分辨的问题。
- 同一个语义在 Header、Ribbon、下级导航、Open Items 和 Right View 不应出现五种不同画法。
- Ignore 图标最终选择前保留 A/B 点检，不在本文先替用户作视觉结论。

### 7.3 宽度矩阵

最少点检：

```text
Primary 显示：窄 / 标准 / 宽 / 拖拽到最小 / 拖拽到最大
Primary 隐藏：Right View 填满工作台，无残留焦点或不可见状态
```

每个宽度都要检查：无页面横向溢出、Ribbon 不被拉宽、下级导航网格合理换列、`Aa` 可达、Current Tool Header 不挤掉 `×`、Open Items 的 `…` 可达。

## 8. 浏览器注释工作流

1. 运行 `pnpm ui`，使用命令打印出的 loopback 地址打开 Phoenix Webview Preview。
2. 先选择固定主题、宽度、Primary 显隐和代表场景，再添加浏览器注释。
3. 每条注释应尽量选中具体元素，并说明“当前问题 + 期望结果”；截图只作为该轮页面证据。
4. 将结论映射到本文编号；新结论改为“已确认”，仍需比较的保留“待确认”。
5. 原型修改后先复测原注释位置，再做完整手工点检；不要仅凭热刷新后的一张截图关闭问题。
6. 只有迁移门槛全部满足后，才把原型结论同步到正式契约文档。

建议每轮注释覆盖一个主题，避免把 Header 图标、Ribbon 宽度、下级导航和 Open Items 生命周期混成一次无法回归的改动。

## 9. 阶段顺序与待确认

### 9.1 早期已确认的阶段顺序（历史）

本节保留 AutoBuild 切片当时的停止线；用户随后已授权自动代码、头文件和 Git 收尾，当前范围与 0.9.1 边界以文首为准。

1. **当前 Host / Registry 外壳收口**：已完成本轮所需的必需 Primary、可选 Right、稳定 action token 和共享组件边界；其余 Registry Builder、多实例和生命周期仍是独立后续项。
2. **编译工具限定切片**：已按 4.10 用独立 ready 样例 JSON 驱动 Preview Primary / Right，并把已确认布局同步到正式 Primary / Right / Controller。Primary 当前为 `当前配置 → 执行（含运行概览与清理入口）→ 维护（脚本同步）→ 工程环境`，不显示项目摘要；Right 只做两个 Block Header、“项目与仓库”展示合并和固定操作列等点名改动，其他复杂业务保持原样。
3. **停止线**：用户已确认左右初步效果可以，本轮不继续 AutoBuild 二次细调。新的真实 Extension Host、主题和生命周期人工点检留到下一工作日；通过前不开始项目改名、搜索替换、头文件引用修正或其他 Right View。

顺序是阶段门槛，不表示必须一次完成全部正式迁移。AutoBuild 当前是“实现已接线，本轮最终全量 / Wing / 制品和真实 Host 人工验收未完成”；其他工具没有因为本轮工作自动获得实施授权。以后新的大区域调整仍先回到 Preview 验证，再经明确确认同步正式 Host。

### 9.2 真实 VS Code 保真损失审查 TODO（不阻塞当前原型）

浏览器原型适合快速验证结构与交互，但它不能证明进入 VS Code 后视觉和行为完全无损。以下项目现在只登记，不中断原型研究；准备把相应区域迁入正式 Webview 前，再逐项在真实 Extension Host 点检并记录差异、接受项或修正方案。

| 审查面 | 进入真实 VS Code 可能损失或变化 | 迁移前点检 |
| --- | --- | --- |
| 共享组件复用 | `KtcToolNavigator`、`KtcOpenItemsBar` 等 Host-neutral Web Components 可直接复用；开发控制条、模拟工作台、假 Editor 外框等 preview chrome 不应迁入 | 确认正式与预览消费同一 ViewModel / 语义事件，并列出只属于 preview 的 DOM / CSS |
| 原生 Header / Right 标签 | 浏览器模拟 Header 和标签无法复现 VS Code 原生命令贡献、动作排序、菜单显隐、焦点、Editor Group 标签关闭与恢复语义 | 在真实 View Header 和真实 Right / Editor 宿主逐项对照图标、tooltip、键盘、关闭 / 重开与 MRU |
| 主题、Zoom 与 DPI | 模拟深色 / 浅色 / 高对比不等于真实主题 token、forced-colors、窗口 zoom、系统缩放和 Windows 高 DPI | 覆盖真实深 / 浅 / 高对比、`75%–200%` zoom、macOS Retina 与 Windows 常用 DPI；不以截图像素完全相同为目标 |
| 窄宽、换行与字体 | VS Code 侧栏最小宽度、用户字体、系统中文字体和 scrollbar 会改变 Ribbon 换行、标签截断与网格列数 | 拖到最窄 / 常用 / 最宽，验证固定 Ribbon 尺寸、下级网格响应、Header 动作和 Open Items 溢出仍可达 |
| Tooltip clipping | 浏览器原生 `title` 与 VS Code hover 表现不同；Shadow DOM、`overflow`、侧栏边界和窗口边缘可能裁切 tooltip | 检查左边界、顶部 Header、最右 `…`、截断标题和纯图标态；决定使用原生 title、VS Code tooltip 或 Host 提供的 hover |
| 键盘焦点 / 上下文菜单 | 浏览器点击通过不代表真实 Webview 的 Tab 顺序、焦点进入 / 离开、快捷键转交、Shift+F10 和原生上下文菜单正确 | 完整键盘走查焦点环、隐藏区焦点清理、关闭后的焦点恢复、Context Menu 键与 Escape |
| 唯一滚动区 | VS Code Webview 容器高度、原生 Header 和 tab strip 会改变可用高度，可能使页面与 Current Tool 同时滚动 | 验证只有 Current Tool 内容承担日常纵向滚动；Directory、Toolbar、Current Tool Header、Open Items 固定且无双 scrollbar |
| Reload / retain / CSP | 热预览保留的内存状态在 Webview reload、隐藏、dispose 或 Extension Host 重启后不存在；正式 CSP / nonce 禁止开发服务和不受控资源 | 覆盖 resolve、隐藏、`retainContextWhenHidden` 两种策略、reload、dispose、重开与 Host 重启；所有状态从快照恢复，正式包使用 CSP / nonce 且不依赖热预览服务 |
| 性能 | 浏览器 fixture 很小，不能代表大量工具、打开项、日志、频繁进度快照和 ResizeObserver / Shadow DOM 开销 | 用代表性上限测量首次渲染、主题 / resize、快照更新、长日志和多打开项；只投影必要字段，避免全量 DOM 重建与无节制消息广播 |

审查结论允许三种结果：共享组件保真迁入、接受真实宿主的合理差异、或在正式 adapter / token 层修正。不得为了让 preview 截图和 VS Code 像素完全一致而复制原生 Header / 标签 DOM，也不得把尚未点检写成“无损迁移”。

### 9.3 其他待确认清单

- [ ] Ignore 图标在“当前候选 / 原先候选”中的最终选择。
- [ ] `Aa` 在一行与多行紧凑网格中的最终固定位置和命中区，是否满足“区域右侧固定”的预期。
- [x] Ribbon 尺寸 token 已确认：紧凑态 `34 × 32px`；展开态内容宽度、最小 `50px`、高度 `58px`，不随宽模式均分拉伸。
- [ ] Open Items 作为第四视觉区域时的分隔线、空状态和最小高度。
- [x] Directory 隐藏后，Toolbar 直接顶接 Header，且无空白分隔。
- [ ] 页面“重置预览状态”入口放在开发控制条还是二级菜单。
- [x] Current Tool 禁止折叠，Header 改为左侧 Tool 图标 + 标题、右侧独立 `×`；用户已另行确认迁入正式插件。
- [x] 预览控制条取消三种宿主模式；同组保留 Primary 与“输出”的独立显隐开关，Right View 始终存在。
- [x] 原型目标将 Open Items 固定为一级第四段，不再回到 Current Tool 内部 Footer。
- [x] 原型 Header 固定为 `目录 → 忽略 → 设置`。
- [x] 用户已批准把上述目标同步到正式 v0.9.0；治理契约已更新，Host、持久化 adapter 与回归测试正在按同一批次迁移。

## 10. 正式迁移门槛

在把原型迁入正式插件前，必须集中完成以下工作：

- [x] 用户确认新的正式一级区域顺序，以及 Open Items 的最终层级。
- [x] 用户确认正式 Header 动作集合和顺序，并已同步修改 `AGENTS.md` 与权威前端规则；契约测试随正式接入完成。
- [ ] Ribbon、下级导航、Current Tool 和 Open Items 的事件统一走稳定 ID，不从按钮文字或 DOM 位置推断动作。
- [ ] 明确预览 Store 字段到正式 `workspaceState` / Workspace Folder Settings / User Settings 的分类与迁移；机器路径不得进入项目设置。
- [ ] `KtcToolNavigator` 与 `KtcOpenItemsBar` 在预览和正式 Webview 中复用同一组件、ViewModel 与语义事件，不复制专用 DOM。
- [ ] 正式 Tool Registry 增加必需 Primary、可选 Right Surface、`instancePolicy` 与实例引用；现有 Companion 通过 adapter 迁移，不按标题或 panelId 重新定义逻辑 Tool。
- [x] AutoBuild 本轮正式迁移只同步 4.10 点名的 Primary 区块和 Right 呈现候选；复用现有 Controller / snapshot / action，任务树、脚本管理、项目探测与运行等未点名业务有 marker / architecture 回归保护。
- [x] `ui-preview/fixtures/auto-build.sample.json` 只由 Preview 导入；正式 Primary / Right 由同一 Controller snapshot / 草稿协议驱动，不导入 fixture、原型 reducer 或模拟 Output。
- [x] 用户已决定把“Current Tool 禁止折叠”迁入正式插件；治理规则已同步，状态迁移、单元测试及长表单 / 运行任务 / 窄侧栏回归随实现验收。
- [x] 已集中消除正式目标与治理文字中的 Directory-first / Toolbar-first 冲突；真实 DOM 与测试仍须在本轮验收后才标记完成。
- [ ] 验证真实 Webview 生命周期：resolve、隐藏、重载、dispose、重新打开、Extension Host 重启和异常存储恢复。
- [ ] 验证真实命令路由、MRU、Current Tool `×` 关闭、Editor companion 和长任务生命周期；不得因原型移除 disclosure chevron 而改变停止任务或销毁 Right 的语义。
- [ ] 深色、浅色、VS Code 高对比、forced-colors、键盘、焦点、ARIA 和窄宽矩阵通过人工点检。
- [ ] 补齐模型、Store、DOM 顺序、唯一 Ribbon `…`、无下级导航隐藏、共享 Open Items 和恢复行为自动测试。
- [ ] 保持 `ui-preview/**` 与预览服务器不进入 VSIX，正式构建不依赖预览服务。
- [ ] 本轮全部修改合并后重新运行最终 `pnpm ext:dev:prepare`，并记录本地 Wing 输入来源与 consumer `node_modules` 命中；此前阶段结果不替代本轮最终门禁。
- [ ] 新一轮真实 Extension Host 手工点检安排在下一工作日；浏览器初步确认和此前 Host 记录都不能替代本轮验收。

## 11. 原型手工点检

### 启动与恢复

- [ ] `pnpm ui` 与 `pnpm ui:dev` 都能启动同一预览入口并显示实际访问地址。
- [ ] 修改受监视文件后热刷新可用，失败构建不会把上一份成功页面变成空白。
- [x] 切换若干状态后刷新页面，主题、宽度、Primary / Output 显隐、选择、打开项和 MRU 都恢复。
- [x] 关闭服务再重新运行 `pnpm ui`，仍能恢复同一安全 fixture 状态。
- [ ] 注入损坏 JSON、旧 schema 和未来 schema 时安全回退，不出现白屏。
- [x] 重置后恢复统一默认场景，存储中不含路径、源码、命令或业务数据。

### Header 与四段结构

- [ ] Header 顺序为 `目录 → 忽略 → 设置`，图标与 VS Code 基线一致。
- [x] 目录按钮可隐藏 / 恢复 Directory，且不改变目录选择。
- [x] Ignore 与 Settings 只更新 Current Tool，Right View 标签数不增加。
- [x] 顶层 Git / Run 直达 Primary；AutoBuild 打开 Primary full + optional Right；顶层替换 / 自动代码和其他 companion 工具能打开 Right + Primary companion。
- [x] 视觉顺序严格为 `Directory → Toolbar → Current Tool → Open Items`。
- [x] 四段均全宽相邻；页面不出现卡片间隙或可拖拽的段间分隔条。

### Ribbon 与下级导航

- [x] 窄 / 标准 / 宽下 Ribbon 按钮尺寸相同，宽模式只增加空余空间。
- [x] 展开 / 折叠使用同一 Ribbon；折叠态维持一行。
- [x] 当前宽度下隐藏的 Ribbon 项均可从唯一 `…` 激活。
- [x] 下级导航无标题、无大纲模式、无外框，相对 Ribbon 左缩进 20px。
- [x] `Aa` 只切名称；纯图标态为 22px，显示名称态仍紧凑且无裁切。
- [x] 无下级按钮的 Group 不显示导航空行、`Aa` 或遗留分隔线。

### Current Tool 与 Open Items

- [x] Current Tool Header 不显示 disclosure chevron；左侧按“当前 Tool 图标 → 标题”排列，右侧独立 `×`。
- [x] Current Tool 内容始终展开；长表单、运行中任务和窄侧栏下均无折叠入口或不可操作的 chevron 占位。
- [x] `×` 仍只执行既有逻辑 Tool 关闭 / MRU 回退语义，不被移除的折叠动作影响，也不被解释为停止任务按钮。
- [x] 关闭当前工具按 MRU 回退；Primary、Open Items 和 Right View 状态保持一致。
- [x] Current Tool 内容是主要纵向滚动区，Open Items 固定在底部。
- [x] Open Items 实际使用共享组件，激活 / 关闭 / 关闭其他项只发语义事件。
- [x] Open Items 过多时可横向滚动，全部项目可从本区 `…` 到达。
- [ ] 方向键、Home / End、Delete、Shift+F10、Context Menu、Escape 和焦点恢复可用。

### AutoBuild 原型边界

- [x] 独立 `ui-preview/fixtures/auto-build.sample.json` 是 AutoBuild Preview 唯一完整 ready 样例；Primary / Right 的数据值与初始状态由这一个 JSON 驱动，不演示从无到有，结构与交互规则仍在代码中。
- [x] fixture 进入状态前经过 exact-key runtime validator；现有测试覆盖正常冻结、修改输入驱动两侧投影、缺字段、额外字段和重复 repository id 拒绝。
- [ ] validator 已实现 schemaVersion、枚举、数组上限及多类稳定 ID 检查，但错误 schemaVersion、非法枚举、数组边界以及重复 task / operation id 尚缺逐项负例测试，不能把“validator 有代码”写成测试已覆盖。
- [x] Primary 按 `当前配置 → 执行（含运行概览与清理入口）→ 维护（脚本同步）→ 工程环境` 四段排列；当前配置包含打开 / 保存 / 另存 / 关闭 / 详细配置 / 最近配置，Primary 不显示项目摘要，维护与工程环境初始展开。
- [x] Primary 执行 actions 按 `脚本 → 预检配置 → 启动 → 停止` 排列，状态、并行选项、Output 和运行概览位于同一执行区；Right Header 没有重复“脚本”，两侧复用既有脚本管理逻辑。
- [x] “构建配置”的 `更新 ROOT_DIR / 更新 3rdParty` 位于 Block Header，事件守卫阻止 checkbox / label 点击折叠 Block。
- [x] Preview“构建配置”至少与正式 Right 使用相同控件类型及 `角色 / 目录 / 分支` 字段关系；是否进一步优化排列只登记为后续 Preview 研究，不在本轮改正式端。
- [x] Right 只在展示层把项目表与库探测结果合并为“项目与仓库”；三个项目动作和“探测列”checkbox 位于 Block Header，正式 `projects` / `repositorySnapshot` 保持分离。
- [x] “项目与仓库”的操作列在代码中以 `92px` sticky 右列实现；探测 / 运行使用正式同款图标并保留 `title`、`aria-label`。真实 Host 的键盘、禁用态和横向滚动仍待人工点检。
- [x] Right 不显示“运行前清理仓库”checkbox；Preview 的独立“清理仓库”和“手动清理 Root”使用不同 reducer action，只模拟反馈且不启动构建、不删除真实文件。Root 外部按钮固定为“清理”，输入为结构化 YAML。
- [x] 正式 Primary“清理仓库”维持简单按钮；Controller 对实际 Git top-level / CMake build 精确目标使用 modal 确认，不消费手动 Root 的 YAML。
- [x] “手动清理 Root”结构化 YAML 已实现：`unlinkDirectories`、`delete.directories`、`delete.files` 均为直属范围；默认删除 `objects/build` 和 `*.obj/*.exp/*.pdb/test_*.exe`，不含 `Kt*/KTC*/PNX*`。
- [x] 正式插件由 TypeScript 执行预览、整树身份冻结、整体复验和删除；目录链接不跟随。规则缓存到当前 AutoBuild JSON 的 `rootCleanupYaml`，PowerShell/sample 继续保留。
- [ ] 下个版本把已稳定的解析、快照和安全清理能力提炼到 Phoenix Wing；本版不提前改变包边界。
- [x] 配置上下文已禁止 MRU 自动加载，并实现“关闭当前配置”的保存 / 不保存 / 取消三态、Save As 默认目录优先级，以及 `workingDirectory` mismatch 的新建配置 / 保留项目显式选择；没有静默 fallback。真实 Host 仍待点检焦点与文案。
- [x] 正式 Right 顶部旧配置工具栏中的“打开 JSON / 保存 / 另存为 / 最近配置 / path”、自动 clean 行和 Root 编排脚本行已清理，同时底层配置能力、兼容逻辑和既有脚本管理业务保持可达。
- [x] 单项目 / 单任务运行只局部更新对应任务并保留其他项目已有失败 / 完成结果；再次预检保留同一工作的已有结果，只有全量启动新建完整一轮。
- [x] 项目目录发现、探测和仓库快照异步回包绑定当前 document / draft revision；过期回包不会覆盖后来修改的项目表或工作目录。
- [ ] 真实 Host 手工复现“项目 A 失败 → 单独运行项目 B”，确认 A 的失败行和统计仍在；随后点击全量启动，确认此时才进入完整新一轮。
- [ ] 真实 Host 在项目探测等待期间修改目录 / 项目或重开 Right，确认迟到结果不会回写当前 UI。
- [ ] 正式脚本管理浮窗已完成 VS Code 主题 token 整改和代码级回归；深色、浅色、高对比下的焦点与可读对比仍待真实 Extension Host 人工确认。
- [x] Right 未被明确点名的复杂区域未被 Primary 复制；正式 marker / architecture 回归固定任务树、项目行为、脚本管理和原生 Output 边界。
- [x] 正式 Primary 与 Right 由一个 AutoBuild Controller、companion snapshot、Right draft protocol 和语义 `actionId` 协调；预检 / 启动 / 保存等动作会原子读取当前 Right 草稿。
- [ ] 真实 Extension Host 中的隐藏、reload、dispose / 重开与 Host 重启尚未人工点检，不能仅凭代码协议宣称完整双 Surface 生命周期已验收。
- [x] Framework Output Block 只属于 Right 工作台框架；AutoBuild Tool 内没有重复的模拟输出区。

### Right Shell 与 Preview 输出模拟

- [ ] Right Shell Header 保持约 44px、左右贴边；左侧只有 title，右侧 actions slot，不出现副标题或工具自建的重复 Header。
- [ ] Tool 消费者的 Main default slot 在 `vertical` / `both` / `none` 三种 scrollMode 下边界正确，无意外双 scrollbar。
- [x] 所有原型按钮的模拟反馈进入 Right 工作台底部唯一 Framework Output Block；各 Tool 内不出现重复模拟输出框或第二份输出历史。
- [x] Output 无 chevron 和折叠态；显示时 Header 左侧为标题、右侧固定 `×`，日志内容始终展开。
- [x] 点击 Output 的 `×` 只隐藏；顶部同组“输出”开关能恢复，且不关闭 Tool、不清空日志、不停止任务、不销毁 Surface / Controller。
- [x] 刷新后 Preview Store 恢复 Output 显隐；切换 Right 标签不重置该状态。
- [x] 连续追加多条模拟日志时，每次都自动滚到最后一行并显示最新反馈。
- [ ] 切换 Right 标签后，公共输出仍能标识反馈来源；关闭 Tool、隐藏 Primary 或刷新时，不把输出区误当作业务状态真源。

### 主题与无障碍

- [ ] 深色、浅色、高对比与 forced-colors 下，边界、焦点、选中和禁用状态清晰。
- [ ] 所有图标按钮有可理解的 tooltip 和无障碍名称。
- [ ] 键盘 Tab 顺序符合视觉顺序，隐藏区域不留下不可见焦点。
- [ ] 文字放大和窄宽下没有重要动作被永久裁切。

### 2026-09-07 浏览器点检证据

- Primary 隐藏后，其 DOM / 可聚焦控件不再出现在无障碍快照中，Right View 与 Framework Output 保持显示；恢复 Primary 后原工具状态仍在。
- Output 通过右侧 `×` 隐藏、顶部“输出”恢复后，已有日志逐行保持；组件测试同时覆盖追加日志自动滚底与相同快照不重建 DOM。
- 分隔条键盘实测 `420 → 440 → 420px`，`aria-valuenow` 与 `aria-valuetext` 同步更新。
- Ribbon `…` 菜单实测 `End` 聚焦末项、`Escape` 关闭并把焦点还给触发按钮。
- Open Items 的 `Delete` 能关闭活动编译工具并恢复最近的头文件引用修正；Current Tool、Open Items 与 Right View 保持同一选择。关闭后 Host 优先恢复活动 Open Item 焦点；关闭最后一项时回退到当前 Ribbon Tool / Group，再以 Ribbon 展开按钮兜底。组件测试覆盖有 / 无活动项的返回值与焦点行为。
- Current Tool `×` 实测采用同一 MRU 回退；重新打开编译工具后，Primary 与 Right View 再次一致。
- Current Tool 已换成 `KtcCurrentToolRegion` 共享组件；深色 `Run` fixture 对照保持用户确认的“Tool 图标 + 标题 + 独立 ×”，点击 `×` 实测仍回退头文件引用修正，Open Items 与 Right View 保持一致。
- 四段已由零状态 `KtcPrimaryShell` 编排；Directory 显示时保持 42px 单行，切换目录后刷新可恢复完整值；隐藏后对应 Grid 行收为零，Toolbar 直接贴合 Header，没有 ghost gap 或残留分隔。
- Toolbar 已换成 `KtcToolbarStrip`；展开 / 紧凑切换继续复用同一个 Ribbon 与下级 Navigator。浏览器实测 Run 等无下级 Tool 会完全移除下展框，唯一 `…` 能列出全部一级工具，`Escape` 关闭外置菜单并恢复触发入口。
- 窄宽下长目录保持单行整体截断，展开 Ribbon 固定尺寸换行；宽侧栏只增加空余空间，不拉伸按钮；高对比主题下边框、选中态与焦点仍可辨识。
- 原型归档时的全量门禁：`186` 个测试文件通过，`1049` 项通过、`1` 项跳过；`typecheck`、`docs:check`、`verify:architecture` 和 `git diff --check` 通过。使用受控 `PHOENIX_WING_ROOT + PHOENIX_WING_DEV_MODE=1` 的 `pnpm ext:dev:prepare` 也通过本地 Wing 来源门禁。这些 UI 组件按架构要求保持为独立浏览器 bundle，不应打入 Extension Host 的 `dist/extension.js`；当前已由正式 Primary Webview 引用。
- 最终恢复场景为：浅色、标准宽度、Primary / Output 显示、Directory 隐藏、Ribbon 紧凑、下级名称隐藏、AutoBuild 活动。刷新后全部保持，浏览器 `warning/error` 日志为空。
- 修正了 Primary 显隐反馈读取“切换后的按钮标签”造成的日志方向颠倒；现在记录实际动作，并有纯函数与静态接线回归测试。

### 2026-09-07 v0.9.0 正式接入阶段证据

- `develop` 的 `91ee870` 已带历史合入 `v0.9.0`，合并提交为 `666d651`，没有冲突；原型归档提交 `8bde01a` 保留在第一父历史中。
- 正式 Primary 已消费六个生产 Web Component bundle；正式 AutoBuild、项目改名与 PackageIncludes Right View 已消费薄 `KtcRightViewShell`。Preview-only `KtcSystemOutputBlock` 不在正式 build graph 中，构建会清理旧 bundle，制品验证器也会主动拒绝它进入 VSIX。
- 全量门禁通过：`190` 个测试文件、`1117` 项通过、`1` 项跳过；`typecheck`、`docs:check`、`verify:architecture`、正式 `pnpm build` 和 `git diff --check` 通过。
- 受控 `pnpm ext:dev:prepare` 通过，wrapper 解析 `<PhoenixRoot>/phoenix-wing` 并设置配套本地开发环境；六个 Code Wing 输入全部来自并列仓库，consumer `node_modules` 命中为 0，CAD 的独立 Registry 门禁同时通过。
- VS Code `1.136.1` 的隔离 Extension Host smoke 通过打开、预览、冲突、应用、保存 / 重载、回滚、Git、Run、项目改名分析与取消等代表流程；扩展 `kuntai.kt-auto-code@0.9.0` 已激活。
- 已按阶段展示规则启动使用本地 Wing 快照的可见 Extension Development Host。用户在真实深色 Host 中确认整体 Primary 效果可接受，且确认 Group 不再生成独立 View；当前显示的“编译工具”是叶子 Tool，而不是“代码辅助”Group 占位内容。
- 用户确认 Open Items 下方的少量空隙属于 VS Code Workbench / View 宿主边界，可以接受。该差异登记为宿主点检结论，不通过插件 CSS 的负边距、绝对定位或遮盖方式强行抵消，Preview 仍保留其已确认的紧凑几何基线。
- 同一轮只读 Preview 点检确认四区、Right Shell 与 Preview 输出模拟仍可访问，浏览器 warning / error 日志为空。

## 12. 当前原型快照（不等同于验收）

### 2026-09-09 包后 Run 清理原型与正式接线

- Run 不再用静态占位示意清理：Preview 消费实际 `KtcRunPrimaryPanel` 与 Wing `pnw-cleanup-dialog`。首行采用“刷新 / 清理”文字按钮组、右侧保留“仅当前系统”；“清理”默认直达 Git 未跟踪方式，原 Git 树叶子移除但能力保留。三个产物清理快捷叶子恢复原树样式与无 secondary 文案，点击直接模拟清理、不弹确认。均不运行 Git 或删除文件。
- 正式端使用同一组 browser-safe 模式契约和同款对话框；Host 执行独立 Wing TS API，递归与不 reset 语义不被 AutoBuild 的直属/强制模式覆盖。快捷树项内部冻结后立即执行、不询问；主动打开“清理”对话框先预览，再携 token 执行。按用户最新要求删除 Run 的额外风险勾选确认行，不删风险和目标清单，也不修改 AutoBuild 的默认确认。
- 组件桥接覆盖旧 session/revision、取消、目录变化与 Webview 重载；init 重放状态没有再次开窗的授权。Root 路径与冻结快照由 Host 持有，Webview 不能提交任意目录或隐藏 YAML 扩大范围。
- DOM 自动测试验证三个直接快捷项、首行按钮、方式直达、模拟执行、取消与目录切换；可见主题/布局/焦点点检仍需完成。现有 AutoBuild Preview 仍有手写清理弹窗，尚需后续收敛，不能声称两个原型已完全共用。
- 本节是已交付 0.9.0 安全修订包之后的源码增量，不修改该包的验收记录与独立分发副本。阶段安全边界见 [Run 实现基线](运行模块/README.md#09-包后增量run-统一清理)。

### 2026-09-09 内测前按钮与运行时对齐

- 项目改名“结束任务”模拟按钮解除静态禁用并写 Output；正式 Host 仍保留自己的完成条件与日志。
- 全局按钮反馈改为捕获阶段识别 composedPath，在语义日志未发生时补一条；覆盖 Shadow DOM、stopPropagation、点击后移除和禁用按钮，有日志的不重复。输出隐藏与重置也有明确记录。
- AutoBuild 项目行增加“更新”图标，模拟明确只更新 Git；正式 Host 已接 TS。Primary 共享 CMake Debug/Release 控件与正式 JSON 配置对齐，旧配置默认两项。
- 这些是交互回归与运行时接线，不代表每个业务按钮的真实副作用已人工点检；内测按[0.9.0 内测说明](0.9.0-内测说明.md)执行。

- 原型中：`package.json` 已出现 `ui` / `ui:dev` 命令入口。
- 原型中：页面已出现 Directory、Toolbar、Current Tool、Open Items 等候选结构和代表 fixture。
- 原型已验证：`KtcToolNavigator` 保留正式 legacy 默认呈现，并由原型显式选择 compact；紧凑网格、`Aa`、纯图标 22px、无下级隐藏及窄 / 标准 / 宽呈现已有组件测试和浏览器证据，正式 VS Code 仍需另行保真点检。
- 原型中：`KtcOpenItemsBar` 已完全替换预览页旧手写 Open Items DOM，并保持独立于 Current Tool 的第四段。
- 原型已验证：`KtcPrimaryShell`、`KtcDirectoryBar` 与 `KtcToolbarStrip` 已替换对应手写大区；四槽顺序、Directory 隐藏零空隙、固定 Ribbon 尺寸、同一 Ribbon DOM、无下级空框和外置 overflow 菜单都有自动或浏览器证据；同一批组件 Entry 当前也已由 v0.9.0 正式 Primary Webview 引入。
- 原型已验证：`KtcCurrentToolRegion` 已替换手写 Current Tool Header / 滚动外壳，通过 `itemId` close intent 复用 Host 现有 MRU；同 item 更新不重建 slot。v0.9.0 正式 Primary 已完成源码接线，真实 VS Code 焦点、滚动与生命周期仍待点检。
- 原型已验证：`PreviewStateStore` 已接线，会将打开项、活动 Tool / Group / Editor、Navigator 和两份 MRU 归一为同一可解释快照；损坏 / 旧 / 未来 schema、存储 API 异常、服务重启和代表状态恢复均有自动或浏览器证据。正式 Webview 生命周期和隐藏焦点仍属于迁移点检。
- 原型已确认并迁入正式契约：Current Tool 一级 Block 固定展开，Header 使用“Tool 图标 + 标题 + 独立 `×`”；当前只保留真实 Host 回归点检，不再保留方向决策。
- 原型已验证：Code Assistant 目录、Tool Catalog、Current Tool 和 Open Items 共用稳定图标语义；AutoBuild 在 Current Tool Header 中显示 `build` 图标，不再显示折叠箭头。
- 原型已验证：500 / 600 / 748px 桌面高度下由 Current Tool 和 Right Main 承担内部滚动，Open Items 与 Framework Output 保持可达；重复投影相同 Output 快照不再重建 DOM 或扰动焦点 / 滚动。
- 原型中：独立 `Preview Tool Catalog` 已接入；Code Assistant 同一组内可同时演示 Primary Tool、AutoBuild 的 Primary full + optional Right，以及其他 Right + companion Tool；顶层 Ribbon 也已区分 Group / Tool。
- 原型已验证：AutoBuild 读取独立 `ui-preview/fixtures/auto-build.sample.json` 的完整 ready 场景，Primary / Right 和 reducer 点检只消费同一份样例数据；runtime exact-key validator、正常冻结、修改输入投影、缺 / 多字段和重复 repository id 已有测试。错误 schemaVersion、非法枚举、数组边界和其他重复 ID 的逐项负例仍待补齐。
- AutoBuild 正式代码已同步本轮限定目标：Primary 把完整“当前配置”放在执行之前，执行区以“脚本 → 预检配置 → 启动 → 停止”开头并包含状态 / 运行概览，两个清理入口保持独立；Right 的构建选项进入 Block Header，项目 / 库探测只合并展示为“项目与仓库”，固定右侧操作列使用正式同款图标并保留无障碍名称。fresh / 关闭 / Save As / 工作目录 mismatch、任务局部保留和项目异步回包防覆盖也已进入同一 Controller。用户已确认左右初步效果可以，新的真实 Extension Host 仍待下一工作日人工确认。
- 此前一轮迁移门禁已有完整通过记录；本轮新增的 `PnwCombo`、脚本同步、TypeScript Root 清理、JSON 缓存和制品文件门禁必须重新执行全库测试、typecheck、文档检查与 `ext:dev:code:prepare`，不能沿用旧计数宣称完成。可见 Host 中的真实数据、主题和生命周期仍需人工确认。
- 最新已确认 Preview：展开 Ribbon 使用内容宽度、最小 `46px`，搜索替换入口显示正式短名称“替换”；Primary 与 Right 外层模拟 VS Code 宿主圆角 / gap，目录 Header 不模拟原生不支持的 persistent 蓝色 toggle 高亮。后续只保留用户在本轮可见 Host 中的 AutoBuild 确认，以及 Open Items / MRU 重启持久化、完整多实例、主题、焦点 / 溢出等细粒点检。
- 项目改名的确认效果已同步正式端：Primary 专用投影显示紧凑目录、动作、总览和分组项目档案，支持选择目录、载入方案、通过 `PnwCombo` 逐行删除 / 全部清空，以及保存共享档案；Right 使用五列方案表格，只显示分析 / Diff / 写盘 / 完成流。条件式相关写法、逐项打开 / Diff、加载更多、完成门禁、错误和进度反馈继续保留。

后续每次原型迭代都应只更新本节的事实状态和相应编号，不用“看起来已完成”替代可复现的证据。
