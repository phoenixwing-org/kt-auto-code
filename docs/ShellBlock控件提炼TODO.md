# ShellBlock 控件提炼 TODO

状态：draft

Owner：KT Auto Code maintainers

适用版本：future

最后规则确认：2026-09-05

## 1. 已锁定基线

2026-08-09 用户确认 Primary 一级 Block 效果良好；2026-09-05 又明确授权把 Ignore 与 Settings 移到原生 View Header，并把首段改为无独立标题行的 Toolbar Strip。这些共同作为后续重构的视觉与行为金样本：

```text
原生 View Header                         [忽略] [设置]
⌄ [图标+文字 Ribbon，可自然多行]                    […]
目录（固定单行；目录文字 + 目录下拉 + 唯一文件夹按钮）
当前工具                           [×]
```

- 三个一级区域数量、顺序和职责固定。
- 三段全宽相接，使用连续分隔线，不使用卡片间距。
- Toolbar Strip 使用 16px SVG 箭头切换展开/紧凑，不显示“工具栏”标题、密度按钮或完全隐藏态；唯一 `…` 固定最右。
- 目录固定单行；当前工具独立折叠，且折叠与关闭是两个独立动作。
- 前两个按内容自然高度，第三个填充剩余空间且只在内部滚动。
- 原生 View Header 依次保留 Ignore 与 Settings；Toolbar Strip 的箭头、中间同一份 Ribbon 和唯一 `…` 在两态保持同一结构。

本 TODO 只允许等价提炼，不授权改变上述效果。

## 2. 为什么后续再提炼

目录与当前工具的 Header 结构、ARIA 和主题样式仍有共享边界；Toolbar Strip 已成为明确的专用外壳，不应为了复用而强行塞进通用折叠 Block。继续增加类似区块时，复制 HTML/CSS 容易造成箭头尺寸、Header 高度、右侧按钮和高对比度行为漂移。

本轮刚完成人工点检，不立即重构。下一轮独立提炼可以用清晰 diff 和专门回归证明“代码复用增加、用户效果不变”。

## 3. 推荐控件边界

候选控件名：`KtcShellBlock`，可注册为 `ktc-shell-block` Web Component，或先提炼为等价的 DOM 构造器与共享样式。选择实现方式前必须以最小改动为准，不为使用 Shadow DOM 而使用 Shadow DOM。

建议输入：

```ts
interface KtcShellBlockModel {
  id: string;
  title: string;
  collapsed: boolean;
  fillRemaining?: boolean;
  closable?: boolean;
}

type KtcShellBlockAction =
  | { kind: "toggle"; id: string; collapsed: boolean }
  | { kind: "close"; id: string };
```

控件负责：

- Header、16px 箭头、标题和右侧 action slot 的统一结构；
- 折叠的 `aria-expanded`、`aria-controls` 与键盘点击语义；
- 全宽分隔线、主题变量、高对比度和 focus 样式；
- body slot 的显示/隐藏，不触碰业务内容状态。

调用方继续负责：

- 三个区域的固定顺序、标题和业务内容；
- Webview state 持久化与第三 Block 的内部滚动位置；
- Toolbar Strip 两态、`…` 菜单和当前工具 MRU 关闭逻辑；
- 工作目录、Ignore、搜索替换及其他领域功能。

## 4. 实施约束

- 单独提交，不与新增工具、样式改版或领域功能混合。
- 不新增第四个一级 Block，不改变现有 ID 和消息契约。
- 不改变 Header 高度、箭头位置、分隔线、左右内边距和 action 顺序。
- 不把业务内容移入 Shadow DOM；现有 Controller 和测试仍应能定位业务节点。
- 不引入 Vue、React、第三方折叠或拖拽库。
- 提炼后如果截图存在肉眼可见变化，应视为回归而不是“组件默认样式”。

## 5. 下一轮验收

- [ ] 提炼前后深色主题截图的三个 Header 数量、顺序、尺寸和对齐一致。
- [ ] 浅色、高对比度主题的边框、hover 与 focus 一致。
- [ ] Toolbar Strip 两态重建后保持，且不被误抽成会完全隐藏内容的通用 ShellBlock；目录行不产生折叠状态。
- [ ] 展开/紧凑两态的唯一 `…` 均可用；原生 Ignore 与 Settings 入口分别打开对应独立逻辑工具。
- [ ] 当前工具的折叠与 `×` 继续独立，MRU 恢复不变。
- [ ] 第三个 Block 继续内部滚动，Primary 页面不整体滚动。
- [ ] 300px、500px 和极窄侧栏下无横向裁切。
- [ ] 现有 Shell、Ribbon、菜单和工具回归测试全部通过。

完成以上验收并由用户确认前，本 TODO 保持 `draft`。
