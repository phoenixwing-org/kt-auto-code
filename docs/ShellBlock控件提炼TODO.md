# Tool Surface 控件提炼 TODO（原 ShellBlock）

状态：draft

Owner：KT Auto Code maintainers

适用版本：future

最后规则确认：2026-09-06

## 1. 已锁定基线

2026-09-06 用户确认用“两区 Shell”替换旧三段，并随后确认删除整行 Sub Tool Header。目录 Row 位于顶部且可由 Header 显隐，Toolbar Strip 与无 Header Tool Surface 同属 Tool Area。当前 Header、目录 Row、Ribbon 两态和 Surface 显隐/关闭语义是后续重构的视觉与行为金样本：

```text
原生 View Header              [目录显隐] [忽略] [设置]
目录 Row（固定单行；目录文字 + 目录下拉 + 唯一文件夹按钮）
Tool Area
  ⌄ [图标+文字 Ribbon，可自然多行]               […]
  Tool Surface（无标题行；内容独立滚动）      [悬浮 ×]
```

- 两个一级区域数量、顺序和职责固定为“可显隐目录 Row → Tool Area”。
- 目录 Row 与 Tool Area 全宽相接，使用连续分隔线，不使用卡片间距。
- Toolbar Strip 使用 16px SVG 箭头切换展开/紧凑，不显示“工具栏”标题、密度按钮或完全隐藏态；唯一 `…` 固定最右。
- Tool Surface 没有独立 Header、标题或折叠箭头。重复点击当前 Ribbon Tool/Group 只切换 Surface 显隐；选择其他工具或从菜单、命令、原生 Header、Editor 激活会展开 Surface。
- Surface 右上角悬浮 `×` 是唯一 Webview 内逻辑关闭动作；它不占独立行，按 MRU 回退，不关闭 Editor 或取消后台任务。
- 目录与 Toolbar 按内容自然高度，Tool Surface 填充剩余空间且只在内部滚动。
- 原生 View Header 当前依次保留目录显隐、Ignore 与 Settings；Toolbar Strip 的箭头、中间同一份 Ribbon 和唯一 `…` 在两态保持同一结构。

本 TODO 只允许等价提炼，不授权改变上述效果。

## 2. 为什么后续再提炼

删除 Sub Tool Header 后，不再需要通用“Header + Body”折叠组件。真正可复用的边界变成 Tool Surface：动态可访问名称、唯一滚动区、悬浮关闭、Surface 显隐状态，以及工具切换时的滚动恢复。目录 Row 和 Toolbar Strip 都是专用 Shell 元素，不应为追求复用被塞进 Tool Surface 组件。

本轮先用清晰的原型 diff 验证交互。下一轮独立提炼应证明“状态和样式归一、用户效果不变”，不得顺手迁移业务工具或导航 Tree。

## 3. 推荐控件边界

候选控件名：`KtcToolSurface`，可注册为 `ktc-tool-surface` Web Component，或先提炼为等价 DOM 构造器与共享样式。选择实现方式前必须以最小改动为准，不为使用 Shadow DOM 而使用 Shadow DOM。

建议输入：

```ts
interface KtcToolSurfaceModel {
  toolId: string;
  accessibleTitle: string;
  collapsed: boolean;
  closable: boolean;
}

type KtcToolSurfaceAction =
  | { kind: "toggle-presentation"; toolId: string; collapsed: boolean }
  | { kind: "close"; toolId: string };
```

控件负责：

- 动态 `aria-label`、显隐状态和唯一内容滚动边界；
- 右上悬浮 `×` 的键盘、Tooltip、focus、高对比度及不遮挡约束；
- Surface 弱分隔、满宽主题样式和 body slot 显示/隐藏；
- 只发出语义化意图，不触碰 MRU、Editor、任务或业务内容状态。

调用方继续负责：

- “目录 Row + Tool Area”两个一级区域及 Tool Area 内“Toolbar Strip → Tool Surface”的固定顺序；
- 当前 Ribbon Tool/Group 重复点击与其他来源 reveal 的状态决策；
- Webview state 持久化、各工具内部滚动位置和 MRU 关闭逻辑；
- Toolbar Strip 两态、`…` 菜单、工作目录、Ignore、搜索替换及其他领域功能。

## 4. 实施约束

- 单独提交，不与新增工具、样式改版或领域功能混合。
- 不新增额外一级区域，不恢复 Sub Tool Header，不改变现有 Host 消息语义。
- 不改变 Ribbon 箭头、唯一 `…`、目录 Row 或原生 Header 动作顺序。
- 不把业务内容移入 Shadow DOM；现有 Controller 和测试仍应能定位业务节点。
- 不引入 Vue、React、第三方折叠或拖拽库。
- 提炼后如果截图存在肉眼可见变化，应视为回归而不是“组件默认样式”。

## 5. 下一轮验收

- [ ] 提炼前后深色主题截图的目录 Row、Toolbar Strip、无 Header Tool Surface 数量、顺序、尺寸和对齐一致。
- [ ] 浅色、高对比度主题的边框、hover 与 focus 一致。
- [ ] Toolbar Strip 两态重建后保持；目录行不产生折叠状态。
- [ ] 当前 Ribbon Tool/Group 重复点击只切换 Surface，菜单、命令、Header 和 Editor 激活能重新展开且不重复执行任务。
- [ ] 展开/紧凑两态的唯一 `…` 均可用；原生 Ignore 与 Settings 入口分别打开对应独立逻辑工具。
- [ ] 悬浮 `×` 在窄宽下不遮挡主操作，按 MRU 恢复且不影响 Editor/任务。
- [ ] Tool Surface 继续内部滚动，Primary 页面不整体滚动；切换工具恢复各自位置。
- [ ] 280px、360px、560px 和 760px 侧栏下无横向页面滚动。
- [ ] 现有 Shell、Ribbon、菜单和工具回归测试全部通过。

完成以上验收并由用户确认前，本 TODO 保持 `draft`。
