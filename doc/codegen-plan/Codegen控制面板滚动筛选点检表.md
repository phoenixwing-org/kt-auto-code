# Codegen JSON View 布局、滚动与筛选点检表

状态：current
Owner：KT Auto Code maintainers
适用版本：0.5.x
建立日期：2026-07-18

状态约定：`[x]` 表示已有可重复自动证据或 Browser 尺寸证据；`[ ]` 表示仍需真实 VS Code / 主题人工回执。不得把未执行的视觉项提前勾选。

## 目标与组件关系

- Primary 与 JSON View 必须消费同一个高层 `ktc-codegen-control-panel`。
- `compact` 只显示共享控制符目录；`full` 在同一目录旁装配 View 专属预检结果。
- Host `KtcCodegenDocumentModel` 是勾选、单选、预检和生成数据真源；显示筛选是各 Webview 的本地 UI 状态，不写 JSON、不改变 Apply 范围。
- JSON View 的 `body` 是唯一纵向滚动边界。文档工具栏、参数表 Block、控制符与预检 Block 按内容自然叠放，总内容超过 View 高度时只滚动整个 View。
- 参数表是可折叠 Block。展开时按参数行自然增高；点击参数表 Header 的非工具区域可收起，收起后 Header 和全部工具按钮必须保留。
- `full` 控制面板内部由“控制符目录”和“预检结果”两个独立 Block 左右组成，中间提供可拖动、可键盘调整的分隔柄。
- 左右比例属于工作区 UI 偏好，由 Extension Host 的 `workspaceState` 持久化；关闭 JSON View 后再次打开仍恢复，不写入业务 JSON。
- `full` 左右 Block 不建立独立纵向滚动条；长内容共同撑高外层控制符 Block。代码预览、宽表格等仍可保留局部横向滚动。
- Primary 的 `compact` 形态不属于 JSON View：为了避免 Side Bar 无限增长，仍允许控制符目录在限定高度内独立纵向滚动。

## 布局责任与禁止项

| 层级 | 负责 | 不负责 |
|---|---|---|
| JSON View `body` | 整页纵向滚动、窄高窗口可达性 | 业务选择、预检状态 |
| 参数表 Block | Header 工具、展开/收起、表格横向滚动 | 页面纵向滚动 |
| 控制符与预检 Block | 总标题展开/收起、左右组合 | 固定 `vh` 高度 |
| 控制符目录 / 预检结果 | 各自内容与横向溢出 | 独立纵向滚动 |
| 分隔柄 | 调整左右比例、键盘可达、发出比例事件 | 直接访问 VS Code API 或业务模型 |
| Extension Host | 校验并持久化布局偏好 | 把布局偏好写入 Codegen JSON |

禁止重新引入：`full` 面板固定 `44vh/58vh`、左右 `overflow-y: scroll/auto`、用 `localStorage` 代替 Host 工作区状态、拖动分隔柄时修改选择或预检模型。

## A. 功能语义点检

| ID | 点检项 | 预期 | 自动证据 | 状态 |
|---|---|---|---|---|
| A1 | Primary / View 共用组件 | 两处均装配 `ktc-codegen-control-panel`；不得复制 32 行目录 DOM | `codegenArchitecture.test.ts`、`primaryPanel.test.ts`、`editorHtml.test.ts` | [x] |
| A2 | 预检前默认显示 | 默认“已选”，显示筛选不改变 checkbox | `controlCatalog.test.ts` | [x] |
| A3 | 预检后默认显示 | 左目录默认“命中”；右结果默认“命中” | 组件测试 + Browser DOM：两侧均为 `命中 12 [pressed]` | [x] |
| A4 | 状态筛选 | 命中/未命中/已选/全部只改变可见行 | `controlCatalogState.ts` 纯函数及组件测试 | [x] |
| A5 | 范围筛选 | 全部类型/C++ only/Field Code 只改变可见行 | `controlCatalogState.ts` 纯函数测试 | [x] |
| A6 | 低频选择工具 | 只有选中筛选、取消筛选、全选、全不选、单选会修改 Preflight/Apply 勾选 | Web Component CustomEvent characterization | [x] |
| A7 | 右侧结果筛选 | 命中/问题/全部互斥显示；问题仅含 warning/error | `controlPanel.test.ts` | [x] |
| A8 | 输出当前筛选 | Host 只接受并校验当前可见 blockKeys，按 legacy 顺序去重 | `controlSessionController.test.ts` | [x] |
| A9 | 单项输出 | 单行 `⧉` 只输出该 block | `controlCatalog.test.ts`、`controlSessionController.test.ts` | [x] |
| A10 | 真实数据 | 已打开 JSON 使用当前 session Renderer；无 session 才输出带 `#error` 的空框架 | `controlTemplates.test.ts` | [x] |
| A11 | 草稿时序 | View 输出前先同步 600ms 防抖中的整表草稿 | `editorHtml.test.ts` | [x] |
| A12 | 状态同步 | Primary 改选择后 View 收到同一 Host snapshot；显示筛选不跨 Realm 强制同步 | Session catalog/full 投影测试 + 本地筛选纯函数 | [x] |

## B. 滚动与压缩尺寸点检

| ID | 尺寸/场景 | 预期 | 自动或产物证据 | 状态 |
|---|---|---|---|---|
| B1 | View 高度低于内容总高 | 只有页面整体出现纵向滚动；工具栏和两个 Block 均可滚动到达 | Browser：1000×650 为 `650 / 2298`，560×420 为 `420 / 2331` | [x] |
| B2 | 参数表展开 | 高度随表头、数据行、状态栏自然增长；表格区没有纵向滚动 | Browser 待重验 | [ ] |
| B3 | 参数表收起 | 只保留 Header；“自适应/排序/复制/粘贴/插入/副本/上移/下移/删除”等工具仍可用 | component + Browser 待补 | [ ] |
| B4 | full 左栏 32 行 | 目录没有独立纵向滚动，32 行共同撑高控制符 Block | Browser 四尺寸均 `1261 / 1261`，`overflow-y: visible` | [x] |
| B5 | full 右栏长命中/问题 | 结果没有独立纵向滚动，命中、诊断和预览均由页面滚动到达 | Browser 四尺寸均 `1852 / 1852`，`overflow-y: hidden` 且自然高度 | [x] |
| B6 | full 左右分隔 | 拖动后两栏宽度变化；20%～75% 限幅；关闭并重开 View 后恢复 | Pointer component test；Host workspaceState 恢复/限幅测试 | [x] |
| B7 | 分隔柄键盘 | Tab 可聚焦；Left/Right 每次调整小步长；`aria-valuenow` 同步 | component test + Browser：42% → 44%，左栏 228px → 234px | [x] |
| B8 | 窄宽 View | 仍保持左右语义；不足最小宽度时只允许控制面板横向滚动，不产生左右纵向滚动 | Browser 560×420 仍为左右 228/306px | [x] |
| B9 | full 右栏长路径/Artifact | 右栏可横向滚动，Artifact `<pre>` 不撑破整个 View | Browser 560×420：结果 `clientWidth 306 < scrollWidth 520` | [x] |
| B10 | Primary compact | 目录最大高度内滚动，不让整个 Primary 无限增长 | `:host([mode="compact"]) .list` + component test | [x] |
| B11 | 高对比/键盘 | 整页滚动条、分隔柄与折叠 Header 的焦点可见 | 真实 VS Code 待用户复核 | [ ] |

建议真实尺寸矩阵：

| 视口 | 用途 |
|---|---|
| 1600 × 900 | 常规双栏 |
| 1000 × 650 | 中等高度压缩 |
| 760 × 480 | 窄宽 + 低高度 + 页面唯一纵向滚动 |
| 560 × 420 | 最窄横向兜底、分隔柄和折叠 Header 可达性 |

### Browser 历史记录（2026-07-18，已由新布局契约替代）

夹具：`extension/test-fixtures/codegen-control-panel-layout.html`（已由 `.vscodeignore` 排除，不进入 VSIX）。Browser 插件打开 localhost，并读取真实构建后的 `dist/codegen-control-catalog.js`。

| 视口 | 页面 client/scroll | 面板/布局 | 左目录 client/scroll | 右结果 client/scroll |
|---|---:|---|---:|---:|
| 1600 × 900 | 900 / 900 | 360px，双栏 | 257 / 473 | 325 / 715 |
| 1000 × 650 | 650 / 650 | 250px，双栏 | 117 / 473 | 215 / 715 |
| 760 × 480 | 480 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |
| 560 × 420 | 420 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |

这组数据只证明旧版固定高度三滚动区没有零高度，不能继续作为新契约的完成证据。新契约明确移除抽屉固定 `vh`、左右独立纵向滚动和 ≤760px 上下分栏；整改后必须重新记录页面、参数表、左右 Block 与分隔柄尺寸。

### Browser 新布局实测记录（2026-07-18）

夹具默认提供 32 条命中目录与 32 条预检结果，实际加载构建后的 `dist/codegen-control-catalog.js`。

| 视口 | 页面 client/scroll | full 面板 client/scroll | 左目录 client/scroll | 右结果 client/scroll | 右结果宽 client/scroll |
|---|---:|---:|---:|---:|---:|
| 1600 × 900 | 900 / 2298 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 878 / 878 |
| 1000 × 650 | 650 / 2298 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 562 / 562 |
| 760 × 480 | 480 / 2331 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 422 / 520 |
| 560 × 420 | 420 / 2331 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 306 / 520 |

Browser 键盘实点 separator 后，`aria-valuenow` 从 42 变为 44，左栏从 228px 变为 234px，夹具收到 `ktc-codegen-control-split-change` 并显示“分隔 44%”。Pointer 拖动、20%～75% 限幅和只在结束时持久化由组件测试冻结。参数表折叠仍等待 Wing 公共 `layout="page" + collapsible` API，B2/B3 不提前勾选。

## C. 不回归门禁

| ID | 门禁 | 命令/证据 | 状态 |
|---|---|---|---|
| C1 | 定向测试 | 7 files / 48 tests | [x] |
| C2 | 全仓测试 | 83 files / 405 tests | [x] |
| C3 | Extension typecheck | `pnpm -C extension typecheck` | [x] |
| C4 | 架构边界 | 119 sources / 22 pure graphs / 9 view roots | [x] |
| C5 | Wing Registry | 7 references，Registry 0.4.2，无本地 override | [x] |
| C6 | 文档 | 58 Markdown，分类与当前链接有效 | [x] |
| C7 | VSIX | 28 files / 422,617 bytes；共享 panel 与 visible scope 门禁通过 | [x] |

## D. 人工回执（不阻塞本轮代码提交）

2026-07-18 用户使用真实 `PNXBomAnalysisParam.json` 回执：控制符/预检内部无纵向滚动、左右分隔拖动、整页纵向滚动和显示筛选均符合预期；“选择工具”初步展开与功能正常，本阶段不继续优化。参数表收起尚未实现，不能与上述通过项合并勾选。

- [ ] VS Code 浅色主题实际滚轮/触控板。
- [ ] VS Code 深色主题实际滚轮/触控板。
- [ ] VS Code 高对比主题可见滚动条和焦点框。
- [x] 用户使用真实 `PNXBomAnalysisParam.json` 复核控制符/预检无内部纵向滚动、整体纵向滚动、左右拖动和显示筛选。
- [ ] 用户使用真实 `PNXBomAnalysisParam.json` 复核参数表收起、分隔比例重开恢复及折叠 Header 键盘行为。
- [ ] 用户使用真实 `PNXCombinedCurveParam.json` 复核筛选、勾选和 Output/Clipboard。

人工项未回执时必须明确标为“待用户/真实宿主复核”，不得用单元测试冒充视觉完成；自动门禁和浏览器真实尺寸布局由本轮实现者完成。
