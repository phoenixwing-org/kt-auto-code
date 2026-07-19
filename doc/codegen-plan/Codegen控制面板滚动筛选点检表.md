# Codegen Primary 控制符目录与 JSON View 预检结果点检表

状态：current
Owner：KT Auto Code maintainers
适用版本：0.5.x
建立日期：2026-07-18

状态约定：`[x]` 表示已有可重复自动证据或 Browser 尺寸证据；`[ ]` 表示仍需真实 VS Code / 主题人工回执。不得把未执行的视觉项提前勾选。

2026-07-19 去重复决策：控制符选择属于 Primary；JSON View 只保留与当前 JSON 绑定的“预检结果”。预检结果内部采用主从左右栏：左侧条目列表，右侧当前项详情。原 `controlSplitPercent` 工作区布局偏好改为这组主从栏的比例，不再代表已经删除的“控制符目录 + 结果”双栏；2026-07-18 的旧双栏数据只保留为历史证据。

## 目标与组件关系

- Primary 与 JSON View 消费同一个高层 `ktc-codegen-control-panel`，但按职责投影不同内容。
- `compact` 只显示共享控制符目录；`full` 只显示 View 专属预检命中、问题和 Artifact 预览，不复制控制符目录。
- Primary 状态筛选显示“命中 / 未闭合 / 未命中 / 全部”；“全部”只恢复完整目录，不修改 checkbox。未闭合行不展开诊断，不放“打开位置/复制 END”等动作。Tree 展开、显示筛选和列表滚动是 Primary 本地状态；checkbox 与 Host round-trip 只原位更新选择态，不替换当前 Tree DOM。
- Primary 的当前 JSON 身份和 Prefix/Middle/Namespace/Append 组成“当前配置”Block。Header 显示文件名、类名、行数和当前编辑状态；文件名单行省略，点击 Header 收起属性正文，折叠状态在当前 Webview 生命周期内保留。
- Host `KtcCodegenDocumentModel` 是勾选、单选、预检和生成数据真源；显示筛选是各 Webview 的本地 UI 状态，不写 JSON、不改变 Apply 范围。
- JSON View 的 `body` 是唯一纵向滚动边界。文档工具栏、参数表 Block、预检结果 Block 按内容自然叠放，总内容超过 View 高度时只滚动整个 View。
- Apply 成功或部分成功后必须销毁可执行 Preflight Plan，下一次 Apply 仍自动重新预检；同时保留最近一次只读结果，让命中、Artifact、未闭合等问题继续可见。结果头明确显示“已应用 · 需重新预检”；参数、选择、工作区或源码变化后改为“结果已过期 · 需重新预检”，不得把旧快照伪装成可执行计划。
- 文档工具栏使用 `position: sticky; top: 0` 固定在 View 顶部；文件名、预检、预检结果、Apply、还原和保存始终可达。工具栏必须使用不透明主题背景、足够 `z-index` 和底部分隔，不得为下方内容创建第二个纵向滚动容器。
- 参数表是可折叠 Block。展开时按参数行自然增高；点击参数表 Header 的非工具区域可收起，收起后 Header 和全部工具按钮必须保留。
- `full` 预检结果左栏只列命中/问题且不建立独立纵向滚动；右栏显示选中项详情、Artifact 或完整诊断，并在 Block 内 `sticky`，随 body 滚动保持可见、到 Block 底部停止。
- 左栏默认隐藏完整源码路径，只显示 class/message 与行号；Header 的“显示路径”checkbox 仅切换左栏密度，右详情始终保留完整定位。隐藏路径不改变筛选、选择或 Apply 范围。
- 主从栏之间有 20%～75% 限幅的可拖动/键盘 separator；比例经 Host `workspaceState` 恢复和保存，不写入业务 JSON，也不与 Primary 目录宽度共享。
- 右详情使用顶部 sticky 工具栏之后的剩余可见高度；标题、摘要和安全动作不滚动，只有代码/Artifact `<pre>` 在过长时局部 `overflow: auto`。missing-end 只有在 Host 提供结构化 marker 投影时才显示“复制 END”，不得从本地化 message 反解析；其他可定位诊断至少支持“打开位置”。
- Primary 的 `compact` 形态不属于 JSON View：为了避免 Side Bar 无限增长，仍允许控制符目录在限定高度内独立纵向滚动。
- Primary “控制符候选”点击后以 VS Code preview 标签打开；未编辑时下一候选替换当前预览，编辑后由 VS Code 自动保留。Host 定位第一条 START/END，并用通用主题黄色装饰高亮全部完整控制符行；打开另一候选时清除上一编辑器装饰。
- 候选 ViewModel 当前只有 `markerCount`，没有结构化行号。将 START/END 作为 Tree 子行展开属于后续 DTO 小步；不得为了这项展示让 Primary 前端重新扫描源码或复制 Wing marker parser。

## 布局责任与禁止项

| 层级 | 负责 | 不负责 |
|---|---|---|
| JSON View `body` | 页面唯一纵向滚动、窄高窗口可达性 | 业务选择、预检状态 |
| 顶部文档栏 | sticky 固定、遮盖滚过内容、提供底部分隔 | 独立纵向滚动、固定页面内容高度 |
| 参数表 Block | Header 工具、展开/收起、表格横向滚动 | 页面纵向滚动 |
| 预检结果 Block | 总标题展开/收起、命中/问题/全部筛选、路径显示开关、主从比例 | 控制符选择、固定整个 Block 的 `vh` 高度 |
| 预检左列表 | 命中/问题主项选择、紧凑摘要、可选完整路径、撑高 Block | 控制符目录、独立纵向滚动 |
| 预检右详情 | sticky 可见高度、打开位置、结构化复制 END、局部代码预览滚动 | 解析诊断 message、整个详情纵向滚动 |
| Primary 控制符目录 | 显示筛选、范围筛选、勾选与输出 | JSON View 页面滚动、预检结果渲染 |
| Extension Host | 校验并持久化布局偏好 | 把布局偏好写入 Codegen JSON |

禁止重新引入：JSON View 重复控制符目录、把 separator 接回 Primary/控制符目录、`full` 面板固定 `44vh/58vh`、左列表或整个右详情 `overflow-y: scroll/auto`、会阻断 sticky 的抽屉 `overflow: hidden/auto`、用 `localStorage` 代替 Host 工作区状态。

## A. 功能语义点检

| ID | 点检项 | 预期 | 自动证据 | 状态 |
|---|---|---|---|---|
| A1 | Primary / View 共用容器并分责 | 两处均装配 `ktc-codegen-control-panel`；只有 compact 装配目录，full 只装配预检结果 | `codegenArchitecture.test.ts`、`controlPanel.test.ts`、`editorHtml.test.ts` | [x] |
| A2 | 预检前默认显示 | 未预检时显示目录与范围筛选，不显示伪造的结果状态标签；不改变 checkbox | `controlCatalog.test.ts` | [x] |
| A3 | 预检后默认显示 | Primary 目录默认“命中”；JSON View 结果默认“命中” | `controlCatalog.test.ts`、`controlPanel.test.ts` | [x] |
| A4 | Primary 状态筛选 | 显示命中/未闭合/未命中/全部四个互斥标签；“全部”恢复完整目录，不在行内展开诊断 | `controlCatalogState.ts` 与 `controlCatalog.test.ts` | [x] |
| A5 | 范围筛选 | 全部类型/C++ only/Field Code 只改变可见行 | `controlCatalogState.ts` 纯函数测试 | [x] |
| A6 | Primary 工具去重复 | 删除“选择工具”及其全选/全不选/单选菜单，也删除“展开缺失模板”；只保留行/分组 checkbox、筛选和输出 | Web Component CustomEvent characterization | [x] |
| A7 | View 主从结果 | 命中/问题/全部互斥筛选左列表；选择后右侧展示 Artifact 或完整诊断 | `controlPanel.test.ts` | [x] |
| A8 | 输出当前筛选 | Host 只接受并校验当前可见 blockKeys，按 legacy 顺序去重 | `controlSessionController.test.ts` | [x] |
| A9 | 单项输出 | 单行 `⧉` 只输出该 block | `controlCatalog.test.ts`、`controlSessionController.test.ts` | [x] |
| A10 | 真实数据 | 已打开 JSON 使用当前 session Renderer；无 session 才输出带 `#error` 的空框架 | `controlTemplates.test.ts` | [x] |
| A11 | View 职责去重 | JSON View 不监听目录选择、显示筛选或控制块输出；只转发结果导航和结构化复制 END | `editorHtml.test.ts` | [x] |
| A12 | 状态同步 | Primary 改选择后 View 收到同一 Host snapshot；显示筛选不跨 Realm 强制同步 | Session catalog/full 投影测试 + 本地筛选纯函数 | [x] |
| A13 | Apply 后结果留存与执行计划隔离 | Apply 后 `session.preflight` 为空，结果快照仍显示命中/Artifact/问题；下一次 Apply 自动重新预检 | `documentModel.test.ts`、`editorSessionPresenter.test.ts`、`controlSessionController.test.ts`、`controlPanel.test.ts` | [x] |
| A14 | 显示状态与 checkbox 解耦 | 在“命中”筛选取消勾选时，该行仍按最近结果保持“命中”，只改变 Apply 选择；不得消失并引发列表跳动 | `controlSessionController.test.ts` + Catalog 焦点/滚动测试 | [x] |
| A15 | 左栏路径密度 | 默认隐藏完整路径；checkbox 开启后只重绘结果投影并显示完整位置，右详情定位信息始终保留 | `controlPanel.test.ts` | [x] |
| A16 | 候选预览定位 | `preview: true` 打开，定位首个 START/END，全部控制符行用共享主题装饰高亮；候选变化无 marker 时安全降级 | `candidateNavigation.test.ts` + 架构门禁 | [x] |

## B. 滚动与压缩尺寸点检

| ID | 尺寸/场景 | 预期 | 自动或产物证据 | 状态 |
|---|---|---|---|---|
| B1 | View 高度低于内容总高 | 只有页面整体出现纵向滚动；工具栏、参数表与预检结果 Block 均可滚动到达 | 自动门禁 + 2026-07-19 用户回执 | [x] |
| B1a | 顶部文档栏 | body 滚动时保持 `top: 0`；不透明主题背景、`z-index` 与底部分隔阻止内容透出 | `editorHtml.test.ts` + 2026-07-19 用户回执 | [x] |
| B2 | 参数表展开 | 高度随表头、数据行、状态栏自然增长；表格区没有纵向滚动 | Wing `layout="page"` 组件测试 + Auto HTML 接线测试；真实 View 待重验 | [x] |
| B3 | 参数表收起 | 点击 Header 非工具区只保留 Header；“自适应/排序/复制/粘贴/插入/副本/上移/下移/删除”等工具仍可用；折叠不改数据、选择或 dirty | Wing disclosure DOM/ViewModel 测试 + Auto 接线测试 + 2026-07-19 用户回执 | [x] |
| B4 | full 不复制目录 | JSON View 内无 `ktc-codegen-control-catalog`，目录只在 Primary compact 出现 | `controlPanel.test.ts`、架构门禁 | [x] |
| B5 | full 长命中/问题 | 左列表 `overflow-y: visible`；右详情 sticky 且无整体纵向滚动，随 body 保持可见并在 Block 底部停止 | 组件样式门禁 + 2026-07-19 初步用户回执 | [x] |
| B6 | 预检结果左右比例 | separator 支持拖动与左右方向键，20%～75% 限幅；重开 View 后恢复最近工作区比例 | 组件、HTML 与 ViewController 测试；2026-07-19 用户真实 View 回执 | [x] |
| B7 | 右详情可见高度 | sticky 后尽量占满工具栏下方剩余 viewport；标题/动作固定，长预览局部滚动 | 组件/HTML 测试；2026-07-19 用户真实 View 回执 | [x] |
| B8 | 窄宽 View | 预检结果仍保持左主/右从语义；默认隐藏长路径，不能退回重复目录或上下独立纵滚 | 自动门禁 + 2026-07-19 用户回执；新 separator 待复核 | [ ] |
| B9 | full 长路径/Artifact | 默认紧凑摘要；开启路径后完整位置可见；只有 `.detail-preview` 可局部横向/纵向滚动 | `controlPanel.test.ts`；真实 View 待复核 | [ ] |
| B10 | Primary compact | 目录最大高度内滚动，不让整个 Primary 无限增长 | `:host([mode="compact"]) .list` + component test | [x] |
| B11 | 高对比/键盘 | 整页滚动条、结果筛选与折叠 Header 的焦点可见 | 真实 VS Code 待用户复核 | [ ] |

建议真实尺寸矩阵：

| 视口 | 用途 |
|---|---|
| 1600 × 900 | 常规预检结果主从栏 |
| 1000 × 650 | 中等高度压缩 |
| 760 × 480 | 窄宽 + 低高度 + 页面唯一纵向滚动 |
| 560 × 420 | 最窄横向兜底、结果筛选和折叠 Header 可达性 |

### Browser 历史记录（2026-07-18，已由新布局契约替代）

夹具：`extension/test-fixtures/codegen-control-panel-layout.html`（已由 `.vscodeignore` 排除，不进入 VSIX）。Browser 插件打开 localhost，并读取真实构建后的 `dist/codegen-control-catalog.js`。

| 视口 | 页面 client/scroll | 面板/布局 | 左目录 client/scroll | 右结果 client/scroll |
|---|---:|---|---:|---:|
| 1600 × 900 | 900 / 900 | 360px，双栏 | 257 / 473 | 325 / 715 |
| 1000 × 650 | 650 / 650 | 250px，双栏 | 117 / 473 | 215 / 715 |
| 760 × 480 | 480 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |
| 560 × 420 | 420 / 766 | 504px，上下 252/252 | 148 / 473 | 217 / 715 |

这组数据只证明旧版固定高度三滚动区没有零高度，不能继续作为新契约的完成证据。当前契约已移除抽屉固定 `vh`、重复目录及左右独立纵向滚动；新 separator 只调整“预检列表 / 详情”的宽度，不恢复旧控制符目录。

### Browser 双栏布局实测历史（2026-07-18，已由单栏契约替代）

夹具默认提供 32 条命中目录与 32 条预检结果，实际加载构建后的 `dist/codegen-control-catalog.js`。

| 视口 | 页面 client/scroll | full 面板 client/scroll | 左目录 client/scroll | 右结果 client/scroll | 右结果宽 client/scroll |
|---|---:|---:|---:|---:|---:|
| 1600 × 900 | 900 / 2298 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 878 / 878 |
| 1000 × 650 | 650 / 2298 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 562 / 562 |
| 760 × 480 | 480 / 2331 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 422 / 520 |
| 560 × 420 | 420 / 2331 | 1887 / 1887 | 1261 / 1261 | 1852 / 1852 | 306 / 520 |

这组旧 separator 数据只用于解释历史设计。当前 JSON View 重新使用同名布局事件，但语义已经收窄为“预检列表 / 详情”比例，不能解释为控制符目录回归。参数表现已接入 Wing 公共 `layout="page" + collapsible` API；折叠状态保留在启用了 `retainContextWhenHidden` 的每个 JSON View Realm 内，切换隐藏 View 不重建组件，不进入业务 JSON，也不触发 table change/dirty。

## C. 不回归门禁

| ID | 门禁 | 命令/证据 | 状态 |
|---|---|---|---|
| C1 | 本轮定向测试 | 3 files / 37 tests | [x] |
| C2 | 全仓测试 | 105 files / 512 tests | [x] |
| C3 | Extension typecheck | `pnpm --dir extension run typecheck` 通过 | [x] |
| C4 | 架构边界 | 137 sources / 24 pure graphs / 13 view roots | [x] |
| C5 | Wing Registry / 本地联调 | 7 references 保持 Registry 0.4.2、无 override；`pnpm ext:dev:prepare` 验证扩展实际嵌入并列 Wing dist | [x] |
| C6 | 文档 | 68 Markdown，分类与当前链接有效 | [x] |
| C7 | VSIX | 28 files / 422,617 bytes；共享 panel 与 visible scope 门禁通过 | [x] |

## D. 人工回执（不阻塞本轮代码提交）

- [x] 真实缺失控制符场景：错误提示正常，其他完整区域仍可 Apply；手工补齐控制符后再次 Apply 成功且错误归零。

2026-07-18 用户使用真实 `PNXBomAnalysisParam.json` 回执：当时双栏控制符/预检内部无纵向滚动、左右分隔拖动、整页纵向滚动和显示筛选均符合预期，该回执属于已替代的旧双栏历史。2026-07-19 用户已确认新职责下的整页滚动、固定 Header、去除重复控制符、主题、窄窗口、“打开”定位、参数表折叠、Apply 后结果留存和预检右详情 sticky 均正常。

- [x] 真实 JSON View 的整页纵向滚动、固定文档 Header 和去除重复控制符区域。
- [x] 预检结果命中/问题/全部数量与切换、单元格 Save/Revert、窄窗口、深色主题和“打开”定位。
- [x] 两份 JSON View 切换后 Primary 基本稳定；Primary 复制动作不再触发全页刷新跳转。
- [ ] Primary checkbox：外层已不滚动，但 compact 目录内部仍会滚动；继续复核行、焦点、Tree 与内部 `scrollTop`。
- [x] Apply 后预检结果仍显示，并标记“已应用 · 需重新预检”。
- [x] 预检结果左列表/右 sticky 详情和整页滚动初步通过。
- [x] 拖动预检结果 separator 后切换 JSON View/重开 View，比例保持。
- [x] “显示路径”默认关闭且左行紧凑；开启后显示完整路径，但不改变选择/筛选。
- [x] 右详情 sticky 时基本占满工具栏下方可见高度。
- [x] Primary“当前配置”可展开/收起，切换 JSON 后折叠状态不变；长文件名保持单行省略，按当前 Header 效果验收，不额外要求 tooltip。
- [x] 点击候选后自动定位首个 START/END，全部控制符行显示黄色高亮，切换候选后旧高亮消失；Preview 替换仍待修正。
- [ ] VS Code 浅色主题实际滚轮/触控板。
- [x] VS Code 深色主题实际滚轮/触控板。
- [ ] VS Code 高对比主题可见滚动条和焦点框。
- [x] 用户使用真实 `PNXBomAnalysisParam.json` 复核 JSON View 已无控制符目录，且预检结果筛选、预览、打开与整页滚动正常。
- [x] 用户使用真实 JSON View 复核参数表可收起，Header 工具保留。
- [ ] 用户使用真实 `PNXCombinedCurveParam.json` 复核筛选、勾选和 Output/Clipboard。

人工项未回执时必须明确标为“待用户/真实宿主复核”，不得用单元测试冒充视觉完成；自动门禁和浏览器真实尺寸布局由本轮实现者完成。
