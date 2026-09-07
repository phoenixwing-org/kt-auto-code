# Phoenix Webview Preview 原型跟踪

> 状态日期：2026-09-07
> 适用范围：KT Auto Code 内部 Webview UI 实验沙箱
> 原型名称：**Phoenix Webview Preview**
> 阶段状态：**Primary / Right 框架原型已由用户确认并归档；等待正式迁移契约确认**

本文是本轮 Primary + Right View 原型的单一讨论与验收记录。它先固定用户已经确认的方向，再记录仍在原型中或待决策的事项；“已确认”表示设计方向已确认，不表示代码、自动测试或真实 Extension Host 验收已经完成。

## 0. 归档结论

2026-09-07，用户确认“Primary Right 框架的封装”可以归档，并同意进入正式应用阶段。本轮归档固定以下原型结果：

- Primary 由 `KtcPrimaryShell` 编排 `Directory → Toolbar → Current Tool → Open Items` 四段，四段全宽相邻且只有 Current Tool Body 承担主要纵向滚动；
- Directory、Toolbar、Current Tool 与 Open Items 分别使用 Host-neutral Web Components，消费者拥有 Store、MRU、路由和业务 Controller；
- Right 使用 `KtcRightViewShell` 提供固定 Header、actions slot、Main slot 和明确的滚动模式，Tool 消费者只提供自己的内容；
- Right 工作台底部使用唯一 `KtcSystemOutputBlock` 接收原型按钮反馈；Output 不属于任何 Tool，也不作为业务状态真源；
- Preview Catalog 以同一 `toolId` 注册必需 Primary 和可选 Right Surface；两侧只交换可序列化快照与稳定 `actionId`；
- Preview State Store 可恢复主题、宽度、区域显隐、导航、活动 Tool、打开项和 MRU，并对损坏、旧版、未来版及存储异常安全回退。

“归档”表示结构与组件边界已经得到用户确认，预览代码和 `pnpm ui` 入口继续保留，作为正式迁移的视觉与行为金样本；不表示真实 Extension Host 已接入，也不把浏览器 fixture 当成正式业务实现。Ignore 图标候选、VS Code 字体 / 缩放 / forced-colors、真实生命周期与状态迁移继续列为正式迁移点检，不再阻塞本原型阶段收口。

Phoenix Webview Preview 是长期保留的 UI 设计沙箱，不是迁移完成后删除的一次性页面。后续大区域、宿主交互或视觉基线调整继续遵循“先在 Preview 修改并通过浏览器注释确认，再进入正式 Host”的顺序；正式实现只同步已确认的原型结论，避免在真实 Extension Host 中反复试错。

## 1. 状态说明

| 状态 | 含义 |
| --- | --- |
| 已确认 | 原型应按此方向设计；实现后仍需点检 |
| 原型中 | 已有局部代码或页面表现，但尚未形成完整验收证据 |
| 原型已验证 | 原型已具备自动化或可复现的浏览器证据；不代表已迁入真实 VS Code 宿主 |
| 待确认 | 需要继续通过浏览器注释或真实 VS Code 对比决定 |
| 正式迁移点检 | 原型可以先试，迁入正式插件前必须集中确认契约、兼容和回归 |
| 已完成 | 同时具备实现、所需自动验证和人工点检证据后才可使用 |

原型框架整体使用“已确认并归档”；单项只有具备相应证据时才标为“原型已验证”。真实 VS Code 宿主中的视觉和行为仍不得写成“已完成”。

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

- `pnpm ui` 是日常最短入口，`pnpm ui:dev` 是便于脚本、文档和排障引用的显式入口。
- 原型只验证布局、视觉、交互状态、恢复和 Primary / Right View 联动；不调用真实 VS Code API，不执行文件修改、Git、进程或业务 Action。
- 浏览器预览通过不等于正式 Webview、Extension Host、Windows CAA 或发布门禁通过。

### 2.2 实验沙箱原则

Phoenix Webview Preview 允许先超越现行正式外壳契约，目的是低成本比较候选结构。原型与现行契约不一致时：

1. 不阻断原型研究；
2. 在本文登记为“正式迁移点检 / 待决策”；
3. 不据此直接修改正式插件契约、`AGENTS.md` 或权威前端规则；
4. 准备迁入正式插件时，再集中确认契约、状态迁移、兼容策略和回归范围。

当前存在三份不同的外壳事实：

1. 真实正式 Host 仍是 `Directory → Tool Area`，Toolbar 与当前 Surface 在 Tool Area 中；Native Header 仍有目录显隐、Ignore、Settings，当前 Surface 可折叠，Open Items 是其内部实验 Footer。
2. 当前 `AGENTS.md` 和权威前端规则写的是 `Toolbar → Directory → Current Tool` 三段，Native Header 只有 `Ignore → Settings`。
3. 本轮原型冻结为 `Directory → Toolbar → Current Tool → Open Items` 四个视觉区域、Header 的 `目录 → 忽略 → 设置`，并暂时禁止 Current Tool 一级 Block 折叠。

2026-09-07 仓库审查确认：原型基线提交 `d25780b` 曾提前修改 `AGENTS.md` 与 `docs/前端开发规则.md`，但没有同步迁改真实 Host，因而第 3 条“原型不直接改正式治理契约”是本阶段的目标原则，却并非当前仓库的已达事实。本轮不再扩大这个偏差：未获得明确授权前，不继续修改正式 Host 或上述两份治理文件；是否先恢复治理文件至真实 Host 基线，记为单独点检点。

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

“冻结”是本轮原型的产品结论，不是对真实 Host 或正式治理契约的默认授权。正式 Host 尚未迁改；上述历史治理文件偏差需先单独确认，真正迁移时再集中更新契约、状态与回归。

2026-09-07，用户对 `Run` fixture 的 Current Tool Header 截图确认“效果 OK”：左侧使用当前 Tool 图标与标题，右侧保留独立 `×`，不再显示折叠箭头。该视觉关系纳入本轮冻结目标。

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
| H-02 | 已确认 | 恢复目录显隐按钮；状态图标和 tooltip 要能表达当前是“显示目录”还是“隐藏目录” |
| H-03 | 已确认 | 图标尽量使用或对齐 VS Code Codicon 的笔画、尺寸和对齐，不使用风格不一致的自绘替代 |
| H-04 | 待确认 | Ignore 图标保留两个候选做同屏或连续 A/B 对比：当前候选与原先候选，依据深色、浅色和高对比下的辨识度决定 |
| H-05 | 已确认 | Settings 恢复原来的设置图标与表现，不继续扩展为新的视觉样式 |
| H-06 | 已确认 | Ignore 与 Settings 只切换 Current Tool，不增加 Right View 标签 |
| H-07 | 原型中 | 三个动作的键盘焦点、`aria-pressed`、tooltip 和 16px 图标基线需要一起点检 |

### 4.2 Directory

- 固定为一行，只表达当前目录上下文、选择结果和目录选择动作。
- 左侧文字为 `目录`，中间选择器占用剩余宽度并整体截断，完整值保留在 tooltip / 无障碍名称中。
- 右侧只有可执行的文件夹选择按钮；不在目录行左侧放装饰性文件夹图标。
- Header 的目录按钮只控制整行显隐；显隐不得重置当前目录选择。
- 重载页面后恢复显隐状态和已选的原型目录场景。

### 4.3 Toolbar / Ribbon

| 编号 | 状态 | 要求 |
| --- | --- | --- |
| R-01 | 已确认 | Ribbon 按钮维持原来的固定尺寸；宽模式不得让按钮变宽或均分撑满 |
| R-02 | 已确认 | 展开态使用“图标 + 短名称”，空间不足时可换行 |
| R-03 | 已确认 | 折叠态保持单行、图标优先；不可见项必须仍可从唯一 `…` 到达 |
| R-04 | 已确认 | 展开 / 折叠复用同一份 Ribbon 模型和激活通道，不复制第二套按钮或状态 |
| R-05 | 已确认 | Toolbar 只有一个 Ribbon `…`；它同时承担隐藏项入口和后续工具栏定制入口 |
| R-06 | 已确认 | 左侧 16px chevron 控制 Ribbon 展开 / 折叠；不增加密度按钮，不删除一级导航 |
| R-07 | 原型已验证 | 窄 / 标准 / 宽与自定义拖拽宽度下，按钮尺寸保持不变、选中态不丢失 |
| R-08 | 已确认 | 有下级工具的 Group 只增加小型折叠箭头，不另造一套按钮样式；箭头表达可展开性，蓝色下划线表达当前选中 |

`…` 不能只是视觉占位。菜单选择和可见 Ribbon 按钮选择必须进入同一激活逻辑，并在当前项上表达选中状态。

原型浏览器在窄 / 标准 / 宽三档实测：紧凑态始终为 `34 × 32px`，展开态始终为 `68 × 58px`。CSS 回归同时锁定展开态换行、紧凑态单行和下级导航 `20px` 左缩进。这些数值是原型证据，正式宿主仍需用 VS Code 实际字体、缩放和主题复核。

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

- 原型中的 Current Tool 是唯一一级内容 Block，暂时禁止折叠；Header 左侧不显示 disclosure chevron，也不保留不可操作的折叠占位。
- Header 左侧依次显示当前 Tool 图标和标题，右侧仍保留独立 `×` 关闭动作。图标来自同一 Tool descriptor，不按标题或 DOM 位置推断。
- `×` 只关闭当前逻辑工具，并按现有 MRU 选择可恢复项；不得被解释为折叠、隐藏内容或停止任务按钮。
- Header 与 `×` 要支持键盘和清晰焦点；关闭后把焦点恢复到仍存在且合理的控件。
- Current Tool 内容始终显示，并作为 Primary 的主要纵向滚动区；Directory、Toolbar、Current Tool Header 和 Open Items 保持固定。

> 正式迁移 / 回归点检：这一原型决定明确超越现行正式锁定契约中的“Current Tool 可独立折叠”。当前只改原型方向，不修改正式插件契约、`AGENTS.md`、正式行为或既有回归测试。准备迁移时必须单独确认是否正式取消折叠，并用长表单、运行中任务和窄侧栏验证空间与生命周期；在确认前，正式 View 继续保留独立折叠。

### 4.6 Open Items

- 原型按第四个视觉区域显示 Open Items，固定在 Primary 底部。
- 使用共享 `KtcOpenItemsBar` 组件及一份可序列化模型；预览页不得继续维护一套外观相似但事件不同的手写栏。
- 每项显示图标、短名称和关闭动作；完整名称必须保留在 tooltip 与无障碍名称中。
- 项目过多时允许横向滚动，所有项目仍可从本区域自己的 `…` 到达。这个 `…` 与 Ribbon 的 `…` 分属不同区域，不违反 Ribbon“唯一 `…`”约束。
- 支持激活、关闭、关闭其他项、左右方向键、Home / End、Delete、Context Menu / Shift+F10 和 Escape。
- 激活项、打开项列表和 MRU 使用同一状态源；Primary 与 Right View 不得各自维护互相漂移的副本。

Open Items 作为第四段的层级已在原型中确认。它仍属于“正式迁移点检”：迁移时需显式把正式 DOM 从三段更新为四段，并同步更新状态归属、关闭 / MRU 语义和回归测试，不再把退回 Current Tool Footer 作为同轮候选。

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

`KtcDirectoryBar` 只投影 `label / value`，并用 `select / choose` intent 把目录动作交还 Host；`KtcToolbarStrip` 只投影 `mode / groupContentVisible / overflowOpen`，保留同一个 slotted Ribbon 与 `KtcToolNavigator`，唯一 `…` 的菜单内容和定位仍由 Host 管理；`KtcPrimaryShell` 则是零 model、零 action 的四 named-slot Grid，只固定顺序与唯一 Current Tool 弹性轨，不拥有边框、按钮、Store 或业务路由。三者都已先写组件契约与测试，再替换原型。正式 Host 接入仍排在整套原型确认之后。

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
- companion 的最小必需内容是 Right 状态与“定位 Right View”；可按需提供 2–4 个短统计和 1–3 个安全动作。没有统计时只显示状态，不生成空卡片。
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

顶层 Ribbon 同样遵循 `group | tool`：当前只有“代码辅助”是有下级的 Group；Git、Run、替换和自动代码是直达 Tool。Catalog 决定 Tool 的 Surface 投影，Navigation 只持有 Group 和 `toolId`。采用 companion 的 Right 工具使用独立状态标记、少量状态字段和“定位 Right View”，不再把“已在右侧打开”拼进工具标题；AutoBuild 则由 Catalog 明确声明为 Primary full，并按需同时提供 Right。

### 4.9 Right Shell 与框架级输出

当前原型中的每个 Right Surface 使用同一层薄 Right Shell；消费者只提供标题、Header actions 和 Main 内容，不重复创建外壳：

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
- Tool 按钮仍只发语义 `actionId`；原型框架把模拟执行结果写入公共 Output Block。该输出区是预览验证设施，不代表正式插件的日志归属已经确定，也不改变 Tool Controller / 双 Surface 快照契约。

Right Shell 是最新原型契约，不是对现行正式插件外壳的直接修改。迁移前仍需确认真实 Right / Editor 宿主可用高度、原生标签与关闭语义、滚动边界以及框架输出区最终落点。

### 4.10 AutoBuild 原型边界与迁移护栏

AutoBuild 当前采用 `primary: full + optional right`。本轮是在浏览器中验证“哪些现有信息适合进入 Primary”的候选布局，不是重新设计整个编译工具，也不表示已修改正式插件。

已确认作为 Primary 候选迁移区块：

| Primary 区块 | 原型职责 |
| --- | --- |
| 运行概览 | 显示短统计、当前运行状态与少量快捷动作，不承载长日志 |
| 当前配置条 | 显示当前配置，并提供“打开 / 保存”等紧凑动作 |
| 项目摘要 | 以紧凑摘要表达当前项目和关键构建目标，不复制完整项目表 |
| 工程环境摘要 | 只读显示平台、CAA / 工具链等已解析环境摘要，不在此完成详细探测配置 |
| 维护与清理预览 | 默认折叠，只预览维护 / 清理范围及结果摘要；展开不等于立即执行 |

明确保留在 Right，且正式实施的第一轮不改动：

- 完整构建配置；
- 完整项目表，以及它现有的工具栏和操作；
- 任务树；
- 详细库探测；
- 脚本管理窗口。

Right 中这些区域在当前原型只作为结构占位，用于检验 Primary 与 Right 的职责边界、可用高度和联动；占位布局不是重写规格，也不能作为改动现有 Right UI 或业务流程的依据。

正式迁移必须遵守以下护栏：

1. 只抽取上表已确认的 Primary 区块，以兼容 adapter 接入；不得借迁移之机重排、删改或重写明确保留在 Right 的 UI 和业务。
2. Primary 与 Right 复用同一个 AutoBuild Controller、实例身份、不可变 snapshot 和语义 `actionId`；不得复制构建状态机、配置读写、项目解析或运行逻辑。
3. Primary 的统计、摘要和动作是现有领域状态的投影，不建立第二份真源。Right 未挂载或被 reload 时，Primary 仍通过 Controller / Framework channel 工作。
4. Framework Output Block 位于 Right 工作台底部，属于预览框架而不属于 AutoBuild Tool；AutoBuild 内部不得复制该模拟输出区。正式日志和任务输出的最终归属继续作为迁移点检，不由原型占位提前决定。
5. 原型确认后先做区块级视觉、快照和 action 契约测试，再进入真实 Extension Host；未经真实数据与生命周期验证，不把原型状态写成正式迁移完成。

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
| AutoBuild 双 Surface | 选择编译工具 | Primary 显示 full 候选区块，Right 保留现有复杂区域的结构占位；两侧与同一打开项同步激活 |
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

### 9.1 已确认的后续阶段顺序

1. **当前 Host / Registry 原型收口**：固定必需 Primary、可选 Right 的 Catalog 校验，统一实例身份、路由、快照 / `actionId` 通道和共享组件边界；以文档、单元测试和浏览器点检收口，不在本阶段迁改正式外壳。
2. **编译工具真实化原型**：按 4.10 的边界把运行概览、当前配置条、紧凑项目摘要、只读工程环境摘要，以及默认折叠的维护与清理预览放入 Primary；完整构建配置、完整项目表及其工具栏 / 操作、任务树、详细库探测和脚本管理窗口保留在 Right 且第一轮不改。macOS 原型只做安全配置与检查，Windows CAA 执行能力继续明确提示平台限制。
3. **项目改名原型**：在上述双 Surface 与共享实例协议稳定后，再设计项目改名的 Primary 快速操作 / 状态摘要，以及 Right 中的复杂输入、影响范围、预览和确认流程；不为项目改名单独发明第二套宿主通信方式。

顺序是阶段门槛，不表示必须一次完成全部正式迁移。当前优先继续浏览器原型；每一阶段先让交互和数据契约可验证，再决定是否进入真实 Extension Host。

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
- [ ] Ribbon 固定按钮的精确尺寸 token；原则是恢复原设定，不随宽模式拉伸。
- [ ] Open Items 作为第四视觉区域时的分隔线、空状态和最小高度。
- [x] Directory 隐藏后，Toolbar 直接顶接 Header，且无空白分隔。
- [ ] 页面“重置预览状态”入口放在开发控制条还是二级菜单。
- [x] 原型中的 Current Tool 暂时禁止折叠，Header 改为左侧 Tool 图标 + 标题、右侧独立 `×`；是否迁入正式插件仍需另行确认。
- [x] 预览控制条取消三种宿主模式；同组保留 Primary 与“输出”的独立显隐开关，Right View 始终存在。
- [x] 原型目标将 Open Items 固定为一级第四段，不再回到 Current Tool 内部 Footer。
- [x] 原型 Header 固定为 `目录 → 忽略 → 设置`。
- [ ] 正式迁移时把上述已确认目标同步到权威契约、持久化迁移和回归测试。

## 10. 正式迁移门槛

在把原型迁入正式插件前，必须集中完成以下工作：

- [ ] 用户确认新的正式一级区域顺序，以及 Open Items 的最终层级。
- [ ] 用户确认正式 Header 动作集合和顺序；若改变现行锁定契约，同步修改 `AGENTS.md`、权威前端规则和契约测试。
- [ ] Ribbon、下级导航、Current Tool 和 Open Items 的事件统一走稳定 ID，不从按钮文字或 DOM 位置推断动作。
- [ ] 明确预览 Store 字段到正式 `workspaceState` / Workspace Folder Settings / User Settings 的分类与迁移；机器路径不得进入项目设置。
- [ ] `KtcToolNavigator` 与 `KtcOpenItemsBar` 在预览和正式 Webview 中复用同一组件、ViewModel 与语义事件，不复制专用 DOM。
- [ ] 正式 Tool Registry 增加必需 Primary、可选 Right Surface、`instancePolicy` 与实例引用；现有 Companion 通过 adapter 迁移，不按标题或 panelId 重新定义逻辑 Tool。
- [ ] AutoBuild 第一轮正式迁移只抽取 4.10 已确认的 Primary 区块；复用现有 Controller / snapshot / action，并为未移动的 Right UI 与业务补回归保护，禁止顺带重写。
- [ ] 单独决定是否把“Current Tool 禁止折叠”迁入正式插件；决定前保持正式锁定契约和现有折叠行为不变，决定后同步更新治理规则、状态迁移、单元测试及长表单 / 运行任务 / 窄侧栏回归。
- [ ] 明确处理正式 DOM / 测试中已经出现的 Directory-first 与现行 `AGENTS.md` Toolbar-first 文字冲突；集中更新治理规则和回归，不让原型共享组件静默改变正式 View。
- [ ] 验证真实 Webview 生命周期：resolve、隐藏、重载、dispose、重新打开、Extension Host 重启和异常存储恢复。
- [ ] 验证真实命令路由、MRU、Current Tool `×` 关闭、Editor companion 和长任务生命周期；不得因原型移除 disclosure chevron 而改变停止任务或销毁 Right 的语义。
- [ ] 深色、浅色、VS Code 高对比、forced-colors、键盘、焦点、ARIA 和窄宽矩阵通过人工点检。
- [ ] 补齐模型、Store、DOM 顺序、唯一 Ribbon `…`、无下级导航隐藏、共享 Open Items 和恢复行为自动测试。
- [ ] 保持 `ui-preview/**` 与预览服务器不进入 VSIX，正式构建不依赖预览服务。
- [ ] 完成真实 `pnpm ext:dev:prepare` 门禁和 Extension Host 手工点检；浏览器原型结果不能替代它们。

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

- [ ] Primary 只显示运行概览 / 统计与快捷动作、含打开 / 保存的当前配置条、紧凑项目摘要、只读工程环境摘要，以及默认折叠的维护与清理预览。
- [ ] Right 的完整构建配置、完整项目表及其工具栏 / 操作、任务树、详细库探测和脚本管理窗口只作结构占位，未被 Primary 复制，也未因原型布局而改变交互规格。
- [ ] Primary 与 Right 的状态和动作来自同一个 AutoBuild Controller、snapshot 与语义 `actionId`；关闭 / reload 任一 Surface 不生成第二份业务状态。
- [x] Framework Output Block 只属于 Right 工作台框架；AutoBuild Tool 内没有重复的模拟输出区。

### Right Shell 与公共输出

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
- 本轮全量门禁：`186` 个测试文件通过，`1049` 项通过、`1` 项跳过；`typecheck`、`docs:check`、`verify:architecture` 和 `git diff --check` 通过。使用受控 `PHOENIX_WING_ROOT + PHOENIX_WING_DEV_MODE=1` 的 `pnpm ext:dev:prepare` 也通过本地 Wing 来源门禁；新 Primary Shell / Directory / Toolbar / Current Tool 组件未进入正式 `dist/extension.js`。
- 最终恢复场景为：浅色、标准宽度、Primary / Output 显示、Directory 隐藏、Ribbon 紧凑、下级名称隐藏、AutoBuild 活动。刷新后全部保持，浏览器 `warning/error` 日志为空。
- 修正了 Primary 显隐反馈读取“切换后的按钮标签”造成的日志方向颠倒；现在记录实际动作，并有纯函数与静态接线回归测试。

## 12. 当前原型快照（不等同于验收）

- 原型中：`package.json` 已出现 `ui` / `ui:dev` 命令入口。
- 原型中：页面已出现 Directory、Toolbar、Current Tool、Open Items 等候选结构和代表 fixture。
- 原型已验证：`KtcToolNavigator` 保留正式 legacy 默认呈现，并由原型显式选择 compact；紧凑网格、`Aa`、纯图标 22px、无下级隐藏及窄 / 标准 / 宽呈现已有组件测试和浏览器证据，正式 VS Code 仍需另行保真点检。
- 原型中：`KtcOpenItemsBar` 已完全替换预览页旧手写 Open Items DOM，并保持独立于 Current Tool 的第四段。
- 原型已验证：`KtcPrimaryShell`、`KtcDirectoryBar` 与 `KtcToolbarStrip` 已替换对应手写大区；四槽顺序、Directory 隐藏零空隙、固定 Ribbon 尺寸、同一 Ribbon DOM、无下级空框和外置 overflow 菜单都有自动或浏览器证据，且组件 Entry 仍只由 Preview 引入。
- 原型已验证：`KtcCurrentToolRegion` 已替换手写 Current Tool Header / 滚动外壳，通过 `itemId` close intent 复用 Host 现有 MRU；同 item 更新不重建 slot，且仍未进入正式 Host bundle。
- 原型已验证：`PreviewStateStore` 已接线，会将打开项、活动 Tool / Group / Editor、Navigator 和两份 MRU 归一为同一可解释快照；损坏 / 旧 / 未来 schema、存储 API 异常、服务重启和代表状态恢复均有自动或浏览器证据。正式 Webview 生命周期和隐藏焦点仍属于迁移点检。
- 原型已确认：Current Tool 一级 Block 暂时禁止折叠，Header 使用“Tool 图标 + 标题 + 独立 `×`”；该变化仍是正式契约迁移 / 回归点检项。
- 原型已验证：Code Assistant 目录、Tool Catalog、Current Tool 和 Open Items 共用稳定图标语义；AutoBuild 在 Current Tool Header 中显示 `build` 图标，不再显示折叠箭头。
- 原型已验证：500 / 600 / 748px 桌面高度下由 Current Tool 和 Right Main 承担内部滚动，Open Items 与 Framework Output 保持可达；重复投影相同 Output 快照不再重建 DOM 或扰动焦点 / 滚动。
- 原型中：独立 `Preview Tool Catalog` 已接入；Code Assistant 同一组内可同时演示 Primary Tool、AutoBuild 的 Primary full + optional Right，以及其他 Right + companion Tool；顶层 Ribbon 也已区分 Group / Tool。
- 待确认：Header Ignore 最终图标、Open Items 正式层级、正式 Header 目录动作和 Ribbon 精确尺寸。

后续每次原型迭代都应只更新本节的事实状态和相应编号，不用“看起来已完成”替代可复现的证据。
