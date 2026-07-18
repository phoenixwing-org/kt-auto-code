# Codegen 控制面板滚动与筛选点检表

状态：current
Owner：KT Auto Code maintainers
适用版本：0.5.x
建立日期：2026-07-18

状态约定：`[x]` 表示已有可重复自动证据或 Browser 尺寸证据；`[ ]` 表示仍需真实 VS Code / 主题人工回执。不得把未执行的视觉项提前勾选。

## 目标与组件关系

- Primary 与 JSON View 必须消费同一个高层 `ktc-codegen-control-panel`。
- `compact` 只显示共享控制符目录；`full` 在同一目录旁装配 View 专属预检结果。
- Host `KtcCodegenDocumentModel` 是勾选、单选、预检和生成数据真源；显示筛选是各 Webview 的本地 UI 状态，不写 JSON、不改变 Apply 范围。
- 页面整体、左侧目录、右侧结果是三层独立滚动边界，不能互相替代。

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
| B1 | View 高度低于最小内容总高 | 页面整体出现纵向滚动；工具栏、参数表、控制面板不被压成不可操作高度 | Browser：760×480 与 560×420 均为 page `766 > viewport` | [x] |
| B2 | full 左栏 32 行 | 目录内部纵向滚动；顶部筛选和摘要固定在列表外 | Browser 四尺寸均 `scrollHeight 473 > clientHeight`，最小可用高度 117px | [x] |
| B3 | full 右栏长命中 | 结果内部纵向滚动；命中行与打开按钮可达 | Browser 四尺寸均 `scrollHeight 715 > clientHeight`，最小可用高度 215px | [x] |
| B4 | full 右栏长路径/Artifact | 右栏可横向滚动，Artifact `<pre>` 不撑破面板 | browser layout | [ ] |
| B5 | 宽度 ≤ 760px | full 面板切换上下两区，每区都有独立滚动 | Browser：760/560 宽均为单列、`252px 252px` 两行 | [x] |
| B6 | Primary compact | 目录最大高度内滚动，不让整个 Primary 无限增长 | `:host([mode="compact"]) .list` + component test | [x] |
| B7 | 滚动条可见性 | Chromium 自定义 thumb 可见；hover/high contrast 不丢失 | CSS source + visual screenshot | [ ] |
| B8 | 键盘 | Tab 可到筛选、选择工具、列表、右侧结果；Enter/Space 可预览 | `controlPanel.test.ts` 冻结 `tabIndex=0` 与 Enter 预览 | [x] |

建议真实尺寸矩阵：

| 视口 | 用途 |
|---|---|
| 1600 × 900 | 常规双栏 |
| 1000 × 650 | 中等高度压缩 |
| 760 × 480 | 窄宽 + 低高度 + 页面整体滚动 |
| 560 × 420 | 上下布局、左右内部滚动与键盘可达性 |

### Browser 实测记录（2026-07-18）

夹具：`extension/test-fixtures/codegen-control-panel-layout.html`（已由 `.vscodeignore` 排除，不进入 VSIX）。Browser 插件打开 localhost，并读取真实构建后的 `dist/codegen-control-catalog.js`。

| 视口 | 页面 client/scroll | 面板/布局 | 左目录 client/scroll | 右结果 client/scroll |
|---|---:|---|---:|---:|
| 1600 × 900 | 900 / 900 | 360px，双栏 | 257 / 473 | 325 / 715 |
| 1000 × 650 | 650 / 650 | 250px，双栏 | 117 / 473 | 215 / 715 |
| 760 × 480 | 480 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |
| 560 × 420 | 420 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |

关键回归：修复前相同夹具中左右 `clientHeight` 均为 `0`；原因是 `<details>` 内容盒不参与普通 flex 剩余高度分配。修复后 `ktc-codegen-control-panel` 通过抽屉内 `inset: 34px 0 0` 获得确定高度。Browser 本轮用于布局和默认筛选 DOM 证据；嵌套 Shadow DOM 的筛选动作由组件 characterization tests 冻结，最终真实 VS Code 点击仍保留在 D 组。

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

- [ ] VS Code 浅色主题实际滚轮/触控板。
- [ ] VS Code 深色主题实际滚轮/触控板。
- [ ] VS Code 高对比主题可见滚动条和焦点框。
- [ ] 用户使用真实 `PNXCombinedCurveParam.json` 复核筛选、勾选和 Output/Clipboard。

人工项未回执时必须明确标为“待用户/真实宿主复核”，不得用单元测试冒充视觉完成；自动门禁和浏览器真实尺寸布局由本轮实现者完成。
