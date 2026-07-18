# 关联规则选择器组件化 Baseline 点检表

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 目标与当前状态

Side Bar 搜索替换中“添加关联规则”对话框已经完成 baseline → `ktc-associated-rule-picker` 迁移。生产渲染改为独立 Shadow DOM Web Component，既有消息协议、候选算法、追加去重和写盘行为保持不变。

`sidebar/panelHtml.ts` 中绝对最大的剩余领域页面是完整搜索替换页，但它同时耦合 Webview draft、工作目录、工作集提示、Profile、结果和 Host 消息，不适合作为下一条小提交整体迁移。关联规则选择器约占 220 行分散代码，是当前最大且仍能保持单一输入/输出契约的独立小块。

完成后的生产落点：

| 当前责任 | 文件 |
| --- | --- |
| Dialog DOM、Shadow DOM 样式、局部输入与语义事件 | `extension/src/sidebar/associatedRulePicker.ts` |
| Custom Element 显式注册 | `extension/src/sidebar/associatedRulePickerEntry.ts` |
| 一次性 model 投影与 confirm → Host 消息适配 | `extension/src/sidebar/panelHtml.ts` |
| transient 定向投递与 durable state 隔离 | `extension/src/sidebar/sidebarViewProvider.ts` |
| 候选 ViewModel | `extension/src/tools/codeRename/associatedRulePicker.ts` |
| 候选派生、追加竞争与去重 | `src/associatedReplacementRules.ts`、CodeRename Host |

## 责任边界

| 层 | 当前/目标文件 | 唯一责任 | 禁止拥有 |
| --- | --- | --- | --- |
| 纯规则 Model | `src/associatedReplacementRules.ts` | 候选派生、追加、同 Source 竞争与去重 | DOM、默认勾选、VS Code API |
| Picker ViewModel | `extension/src/tools/codeRename/associatedRulePicker.ts` | 标题、候选顺序和 common/CAA/custom 默认勾选 | Dialog DOM、`postMessage()`、写盘 |
| Picker View | `extension/src/sidebar/associatedRulePicker.ts` | 候选/自定义行、确认启用、focus、close/cancel/Escape、语义事件 | `acquireVsCodeApi()`、候选派生、去重、Webview state、工作区 |
| Sidebar Host adapter | `extension/src/sidebar/panelHtml.ts` | 把一次性 ViewModel 交给组件，并将选中规则补齐为现有 Host 消息 | Picker 行 DOM、候选算法 |
| Extension Host Tool | `extension/src/tools/codeRename/index.ts` | 创建 Picker ViewModel、追加与去重、广播一次性状态 | Dialog DOM、组件局部输入 |

依赖方向固定为：

```text
用户请求候选
  → panelHtml 发送 requestAssociatedRuleCandidates
  → CodeRename Host 创建 KtcAssociatedRulePickerState
  → panelHtml 把一次性 model 交给 Picker View
  → Picker View 只回传所选 rules
  → panelHtml 补 primarySearch / existingRules
  → Host 按既有 appendAssociatedRules 去重
```

`primarySearch` 与 `existingRules` 必须留在外层 adapter。组件若持有两者，会在打开 Dialog 后与仍可变化的搜索替换 draft 形成第二状态真源。

## 已冻结行为

- [x] `common` 候选中的空格写法和前缀替换默认全部勾选，确认按钮立即可用。
- [x] `caa` 依次展示完整名称 I、完整名称 E、末词段 I、末词段 E；只有两个完整名称候选默认勾选。
- [x] `custom` 展示全部可分析候选但不预选；没有任何选择时确认按钮禁用。
- [x] 底部始终存在自定义 Source/Target；输入非空 Source 自动勾选自定义行并启用确认，Target 可以为空。
- [x] Host 返回零候选时自动聚焦自定义 Source。
- [x] Dialog 已打开时重复调用不再次执行 `showModal()`。
- [x] 右上关闭、取消按钮和原生 `cancel`/Escape 都关闭 Dialog、清空行并释放活动 Picker；Escape 先 `preventDefault()`，避免浏览器在清理前自行改变状态。
- [x] Confirm 只提交已勾选候选和已启用的非空自定义 Source。
- [x] Confirm 的外层消息继续携带当前 `state.replace.search` 与 `state.replace.extraRules`，组件不得缓存或生成这两个字段。
- [x] `SidebarViewProvider` 永不把 `associatedRulePicker` 写入 durable `toolStates`；它只定向发送给请求来源 View，另一存活 View 只收到 durable 状态，后续更新和重建都不会无用户动作重新弹窗。

## 当前组件事件契约

组件只派发一个带 `kind`、`bubbles: true`、`composed: true` 的语义事件：

```ts
type KtcAssociatedRulePickerActionDetail =
  | { readonly kind: "confirm"; readonly rules: readonly KtcReplacementRuleDraft[] }
  | { readonly kind: "cancel" };
```

确认后由 `panelHtml.ts` 保持现有映射：

```ts
{
  type: "appendAssociatedRules",
  toolId: "codeRename",
  primarySearch: state.replace.search,
  rules: detail.rules,
  existingRules: state.replace.extraRules,
}
```

候选请求 `requestAssociatedRuleCandidates` 仍属于搜索替换 Page shell；它不应被误并为 Picker 的 confirm 事件。

## Characterization 与制品门禁

`associatedRulePicker.test.ts`、`associatedRulePickerBaseline.test.ts`、架构测试、Panel 测试和 Provider transient 测试共同冻结：

- [x] common、CAA、custom 三类 ViewModel 的默认勾选真实进入 checkbox DOM。
- [x] 自定义 Source 自动勾选、确认按钮启用和完整 confirm payload。
- [x] 空候选聚焦、同次打开不重复 `showModal()`、close/cancel/Escape 清理。
- [x] Provider 的双 View 定向投递、durable 隔离、后续更新不回弹和 init 防御剥离。
- [x] Host 继续拥有候选创建和追加去重；外层 adapter 继续拥有 `primarySearch` / `existingRules`。
- [x] 组件幂等注册、Shadow DOM、单一 union 事件、raw Source、Source/Target Enter 拦截和 confirm/cancel 单次语义。
- [x] 独立 bundle 进入 esbuild build/watch、架构 viewRoots 和 VSIX 必需制品；制品门禁拒绝 VS Code API、`postMessage`、clipboard、工作区、`primarySearch` 与 `existingRules` 泄漏。

已有 `extension/src/tools/codeRename/associatedRulePicker.test.ts` 继续覆盖候选生成，本组件测试不复制规则算法。Fake DOM 与源码/制品门禁证明组件语义和依赖边界；真实 Browser Dialog 仍按下节 TODO 单独回执。

## 暂停后的保留 TODO

- [x] `openPicker(model)` 是显式一次性边沿；普通 Host snapshot 不自动 show，已打开时只刷新且不重复 `showModal()`。
- [x] 自定义规则继续使用 `custom-${Date.now()}`；只把 trim 后非空作为有效性判断，confirm 保留用户输入的原始 Source。
- [x] 第一条生产提交只替换 Dialog DOM/CSS/局部事件并修正 transient 投递，不移动 Profile、工作目录、搜索替换结果或完整 Page shell。
- [x] 组件 characterization、Sidebar adapter、Provider transient、Extension typecheck、架构、Registry 依赖、全仓测试、构建和 VSIX 制品检查通过。
- [ ] 使用 localhost fixture 或真实 VS Code Webview 完成原生 `<dialog>` 的 Tab/焦点恢复、Escape、backdrop、长列表滚动和 430/320/280px 点检。本次 Browser 自动化因 `file://` URL 策略拒绝而停止，不以绕过策略代替证据。
- [ ] 大型 UI 计划已由用户暂停；搜索替换完整 Page shell 和其余跨仓大页只从 `current-roadmap.md` 的暂停 TODO 恢复，不在本点检中继续扩张。
