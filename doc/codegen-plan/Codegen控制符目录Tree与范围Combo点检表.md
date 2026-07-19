# Codegen 控制符目录 Tree 与范围 Combo 点检表

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-19

## 本轮确认范围

后续真实使用反馈已删除重复的“选择工具”，选择只保留行与分组 checkbox。共享控制符目录是一层 Tree：固定按 `C++ → Qt → CAA` 分组，每组可折叠，组复选框只勾选或取消**当前显示筛选与范围筛选共同可见**的组内项。当前组合筛选为零项的组不渲染，避免 `C++ only` / `Field Code` 下出现空组噪声；纯分组投影仍固定保留三组定义。状态筛选为“命中 / 未闭合 / 未命中 / 全部”；范围使用“全部类型 / C++ only / Field Code”原生 `select`。

目录只改变显示投影。32 个 legacy block（C++ 4、Qt 2、CAA 26）全部保留，包含 legacyId 20、21、30 三个 `legacy-deprecated` 项。任何由 Tree 发出的 `blockKeys`，以及 Host session 接受的选择和输出，都必须按全局 legacyId 顺序校验、去重，不能变成 C++ / Qt / CAA 的显示顺序。

Primary 面向用户显示稳定编号 `#0–#31`，与内部 `legacyId` 完全同号；协议、排序、日志和界面不得建立第二套编号或迁移数据。旧兼容项使用标题后的独立标签，例如 `#30 Cmd Element Selected · [旧兼容]`；该标签不替代“命中/未闭合/未命中”预检状态，也不在右侧平台标签旁重复。JSON View 的预检结果在左侧命中/可关联问题和右侧详情显示同一 `#编号` 小标签；Preflight/Apply Output 的结构化控制符诊断也以前缀 `#legacyId blockKey ·` 显示同号编号，方便从日志反查页面。无法可靠关联控制符的通用诊断不猜编号。

## 责任图

| 层 | 文件 | 本轮责任 | 不得承担 |
| --- | --- | --- | --- |
| Domain Model | `extension/src/tools/codegen/documentModel.ts` | 保存 Host session 的选择、单选模式、预检与模板显示状态 | Tree 分组、DOM 展开状态 |
| ViewModel / Controller | `controlViewModel.ts`、`controlSessionController.ts` | 从同一 session 投影目录；校验并恢复 legacyId 顺序 | 保存 Webview 本地筛选或折叠 |
| Host adapter | `sidebar/panelHtml.ts`、`editorHtml.ts` | 传递既有语义事件和 Host snapshot | 复制第二套选择状态、改消息 schema |
| Page shell | `primaryPanel.ts`、`controlPanel.ts` | Primary compact / JSON View full 复用同一高层组件；Primary 重绘复用实例 | 重建目录实例导致筛选和折叠丢失 |
| Visual primitive | `controlCatalogState.ts`、`controlCatalog.ts` | 状态/范围显示筛选、固定分组、三态组选择、目录行 | 写文件、调用 VS Code API、成为状态真源 |

## Characterization 门禁

| ID | 冻结行为 | 自动证据 |
| --- | --- | --- |
| T1 | Tree 固定 C++、Qt、CAA 顺序；组内按 legacyId；deprecated 不删除 | `controlCatalog.test.ts` 纯状态与组件测试 |
| T2 | 组 checkbox 的 checked / indeterminate / disabled 只由当前可见项计算 | `controlCatalog.test.ts` 纯状态测试 |
| T3 | 组勾选只合并当前可见项，组取消只移除当前可见项，其余选择保持 | `controlCatalog.test.ts` 纯状态与事件测试 |
| T4 | 范围使用 native combo，状态仍是四个按钮 | `controlCatalog.test.ts` 组件测试 |
| T5 | Primary Host snapshot 重绘保持同一个 compact 控制面板实例、三个外层 Block 折叠状态及列表滚动位置 | `primaryPanel.test.ts` 实例身份与状态测试 |
| T6 | Host 对乱序、重复、非法 key 再校验，选择与可见输出都恢复全局 legacyId 顺序 | `controlSessionController.test.ts` |
| T7 | Host 消息、session schema、ViewModel `schemaVersion: 1` 不变 | `hostContract.test.ts`、`editorHtml.test.ts`、`panelHtml.test.ts` |
| T8 | full 无内部纵向滚动；compact 目录保留限定高度纵向滚动 | `controlCatalog.test.ts`、`controlPanel.test.ts`、原布局夹具 |
| T9 | 单项/筛选输出不改变 session 时不得发布整份 Sidebar snapshot；目录保留 Tree、筛选和滚动状态，选择工具已删除 | `codegenArchitecture.test.ts`、`controlCatalog.test.ts` |

## 2026-07-18 自动回执

以下回执来自真实构建后的浏览器布局夹具与交互夹具，不等同于 VS Code Extension Host 人工验收。

### Root Browser 布局量测

- `1280 × 720`：document 高度 `720 / 2298`（client / scroll），drawer `1921 / 1921`，full panel `1887 / 1887`，catalog `1462 / 1462`，list `1359 / 1359`。目录、结果和 full panel 均没有内部纵向滚动，整页是唯一纵向滚动边界。
- `360 × 760`：document 宽度 `360 / 360`、高度 `760 / 2331`；full panel 宽度 `342 / 540`，computed `overflow-x: auto`、`overflow-y: hidden`。页面没有横向溢出，右栏由 panel 自身横向滚动到达。

### Chrome 交互与窄屏量测

- 范围控件只有一个 native `select`，精确提供“全部类型 / C++ only / Field Code”三个 option；状态筛选仍是“命中 / 未命中 / 已选 / 全部”四个按钮。
- `C++ only` 精确显示 legacyId `10–13` 四项。取消 C++ 组当前可见项后，已选计数由 `32` 变为 `28`，Qt `2` 项与 CAA `26` 项保持选择，证明组操作没有触碰筛选外项目。
- CAA 组可折叠；legacyId `20`、`21`、`30` 三项仍保留并显示“旧兼容”。
- 宽屏：document 高度 `1042 / 2298`，full panel `1887 / 1887`、computed `overflow-y: hidden`，内部纵向滚动候选数为 `0`。
- `360 × 800`：document 宽度 `360 / 360`、高度 `800 / 2331`；panel 宽度 `342 / 540`、computed `overflow-x: auto`，实际 `scrollLeft` 可从 `0` 调整到 `150`，document `scrollX` 保持 `0`；console error 为 `0`。

Tree 选择、显示与输出 `CustomEvent` 的 payload 由 DOM characterization tests 覆盖；浏览器回执不替代 Host 端协议校验测试。

## 人工点检

下列项目必须在真实 VS Code Extension Host 中执行，本轮浏览器自动回执不勾选这些项目：

- [ ] 在 Primary 打开 Codegen，切换状态筛选和范围 combo，折叠任意组；触发 Host 刷新后筛选、组折叠和目录滚动位置不回到默认值。
- [ ] 把 Primary 外层页面、JSON 列表和控制符目录分别滚到中部，点击任一控制符的 `⧉`；确认源码已复制，但页面、列表、折叠状态和当前选中 JSON 都不跳动。
- [ ] 在两份已打开 JSON View 间切换；Primary 只更新当前行选中样式，“JSON 配置 / 控制符目录 / 控制符候选”的展开状态不改变。
- [ ] “全部类型”下依次显示 C++、Qt、CAA；三组标题使用“显示 X/Y · 可见已选 A/X”计数；范围切换后零项组不显示。
- [ ] 在“未命中 + Field Code”组合下勾选某组，只改变该组当前可见项；切回“全部”确认隐藏项原选择保持。
- [ ] 组内部分可见项已选时 checkbox 为三态；组当前无可见项时 checkbox 禁用。
- [x] legacyId 20、21、30 仍出现在 CAA 组，界面编号分别为 `#20`、`#21`、`#30`，并在标题后以中文标签标识“旧兼容”。
- [ ] JSON View full 的目录与 Primary compact 行为一致；full 由外层页面纵向滚动，compact 在限定高度内滚动。
- [ ] 选择后执行 Preflight / Apply，再输出当前筛选；日志中 block 顺序仍按 legacyId，而不是 Tree 分组顺序。

Windows NSIS 真实回执属于并行人工后续，不阻塞本点检。

2026-07-19 真实 Host 回执：用户确认 Primary `#0–#31`、旧兼容标题标签和预检结果编号效果正常；`marker.missing-end` 日志中的 `#23 CMD AGENT CONSTRUCTOR`、`#5 IMPLEMENTS HEAD SET`，以及 `marker.orphan-end` 的 `#4 IMPLEMENTS HEAD GET` 均与页面和内部 legacyId 同号。控制符目录滚到中部后勾选/取消 checkbox 仍保持内部滚动位置。
