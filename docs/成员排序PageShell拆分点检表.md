# C++ 成员排序 Page shell 拆分点检表

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 目标与边界

本切口只把 Side Bar 中的 C++ 成员排序页面壳从 `sidebar/panelHtml.ts` 提炼为产品内聚 Web Component；不修改扫描算法、确认对话框、fingerprint、写盘、还原或 Git diff 语义，也不修改 Wing、Codegen Marker/Apply 与控制符目录。

`panelHtml.ts` 从 2604 行下降到 2388 行。下降的 216 行是成员排序 DOM、CSS 和组件内即时选择反馈；新的纯状态与组件按职责拆开，不能把同一段代码换文件后继续形成第二个总壳。

## 责任图

| 层 | 文件 | 唯一责任 | 禁止拥有 |
| --- | --- | --- | --- |
| Domain/Host Controller | `src/tools/reorderMembers/index.ts` | revision、session、选择真源、扫描、确认、fingerprint、写盘、还原与状态广播 | Web Component DOM |
| 纯 Panel State | `src/sidebar/reorderMembersPanelState.ts` | Host 快照选择收敛、pending/blocked/applied 分组和 Apply 投影 | DOM、VS Code API、文件系统、clipboard |
| Page shell | `src/sidebar/reorderMembersPanel.ts` | Sidebar/Detail 两种展示、列表、三态组选择、Realm 本地筛选、语义事件 | `acquireVsCodeApi()`、`postMessage()`、写盘与确认 |
| Webview Host adapter | `src/sidebar/panelHtml.ts` | `ToolUiState` 的窄 model 投影，以及 CustomEvent 到既有 Webview 消息的映射 | 成员排序行 DOM、状态算法 |
| Bundle/制品门禁 | `src/sidebar/reorderMembersPanelEntry.ts`、`esbuild.mjs`、`scripts/verify-extension-artifacts.mjs` | 独立浏览器 bundle、VSIX 必需文件和 Host-neutral 检查 | 业务状态 |

依赖方向固定为：

```text
Extension Host ToolUiState
        ↓ 窄 model
panelHtml Host adapter
        ↓ property
ktc-reorder-members-panel → pure panel state
        ↓ semantic CustomEvent
panelHtml → 原 run / reorderAction / reorderSelection 消息
        ↓
Extension Host Controller
```

## 已冻结的行为

- [x] 新 `reorderRevision` 且 Host 未显式给选择时，默认勾选全部 `pending`。
- [x] 同 revision 的显式 `reorderSelectedUris: []` 是 Host 权威空选择，不能被组件恢复成默认全选。
- [x] 同 revision 缺少选择字段时保留本地 optimistic 选择，但只保留仍为 `pending` 的 URI；下一份 Host 快照仍可覆盖。
- [x] `cancelled` 不展示；`blocked`、`applied`、`reverted` 继续展示但不能进入批量 Apply。
- [x] 两条 `pending` 实例冻结组选择的全选/半选/未选三态；半选时原生 `:indeterminate` 成立，全选/全不选事件只携带当前 pending URI。Running 时组选择、行选择、扫描、批量 Apply 和工作集动作禁用。
- [x] 单行 pending 保留预览/应用/移除；applied 保留 Git diff/还原；blocked 不提供写入动作。
- [x] `显示无变更文件` 只存在于当前 Webview Realm，不写 Host、设置或工作区状态；Host model 重绘不丢失该筛选。
- [x] Sidebar 保留标题、说明和边框；`detailBlock` 隐藏标题/说明、移除外框并让两个主动作等宽。
- [x] 文件完整路径、编码和 warning 继续保留在 title；长目录视觉省略不能改变发送给 Host 的 URI。

## 消息协议不变

组件只派发 `ktc-reorder-members-action`，由 `detail.kind` 明确区分三种既有协议：

| Component detail | Webview → Host |
| --- | --- |
| `{ kind: "run", action: "preview" }` | `{ type: "run", toolId: "reorderMembers", action: "preview" }` |
| `{ kind: "run", action: "addToWorkset" }` | `{ type: "run", toolId: "reorderMembers", action: "addToWorkset" }` |
| `{ kind: "reorderSelection", uris }` | `{ type: "reorderSelection", toolId: "reorderMembers", uris }` |
| `{ kind: "reorderAction", action, uris }` | `{ type: "reorderAction", toolId: "reorderMembers", action, uris }` |

不能把顶部“扫描预览”和行内“预览差异”压成只有 `action: "preview"` 的无类型事件；`kind` 是 Page shell 到 Host adapter 的消歧边界。

## 自动与 Browser 点检

- [x] 纯状态 characterization 覆盖新 revision、显式空选择、同 revision 保留、无缓存、pending 过滤、blocked/applied/cancelled 与 Running。
- [x] Web Component 测试覆盖幂等注册、Sidebar/Detail、Realm 本地筛选、两条 pending 的 partial/all/none 组选择、单行与批量事件、Host 覆盖、Running 禁用和 applied 动作。
- [x] Sidebar contract 证明旧 `run`、`reorderAction`、`reorderSelection` 消息形状未变，旧行 DOM/render helper 已退出总壳。
- [x] import graph 将 Panel State 纳入 pure graph，将 Component/entry 纳入 View roots；组件不得直接文件写入。
- [x] `tests/webview/reorder-members-panel.html` 在真实 Browser 验证两条 pending 三态、360×640、280×640、长路径、Sidebar/Detail、Running、blocked、applied、显示无变更、Host 空选择、单行与批量 Apply。
- [x] 360px：document `360/360`、panel `344/344`、shell `342/342`；280px：document `280/280`、panel `264/264`、shell `262/262`，均无页面横向溢出。
- [x] Detail 形态标题/说明 `display:none`、shell border `0px`，两个动作宽度均为 129px（280px viewport）。
- [x] Browser 控制台为 0 error/warning；临时 viewport 已恢复，点检页已关闭。
- [x] 独立 `dist/reorder-members-panel.js` 由正式 build 生成，VSIX 检查要求 tag、语义事件、选择协议存在且不含 `acquireVsCodeApi()`。
- [x] 最终门禁：成员排序定向 **4 files / 23 tests**，全仓 **91 files / 453 tests**；Extension typecheck、127 source / 23 pure graph / 11 view root、65 份 Markdown、7 个 Wing Registry 0.4.2 引用均通过；Code VSIX **29 files / 431,776 bytes** 通过制品检查。

## 后续 TODO

- [ ] 在真实 VS Code 深色、浅色和高对比主题检查 hover/focus、状态色与 280px Side Bar；这属于手工视觉回执，不阻断本次结构提炼。
- [ ] 若成员排序将来被第二个产品消费，再评估把稳定 DTO/visual primitive 迁入 Wing browser 子路径；当前只有 Auto Code 消费，禁止提前发布公共 UI API。
- [x] 已从大型 UI 路线确定下一条最大安全小切口为搜索替换的统一关联规则选择器，并先建立不改生产的[组件化 Baseline 点检](关联规则选择器组件化Baseline点检表.md)。
- [ ] Baseline 通过后独立提炼 Picker；不能在成员排序组件中加入搜索替换、Ignore、Codegen 或环境设置逻辑，也不能在同一提交迁移完整搜索替换 Page shell。
