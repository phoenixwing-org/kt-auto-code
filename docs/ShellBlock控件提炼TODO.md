# Primary / Right Host-neutral 控件正式接入 TODO（原 ShellBlock）

状态：原型已确认并归档；v0.9.0 正式 Host 已接线、通过自动门禁 / Host smoke，且用户已确认整体视觉；重启恢复、多实例与细粒主题 / 焦点矩阵仍按本 TODO 跟踪

Owner：KT Auto Code maintainers

适用版本：v0.9.0 及后续

最后规则确认：2026-09-07

原型金样本：Phoenix Webview Preview，归档提交 `8bde01a`

## 1. 已锁定正式基线

用户已经明确批准将 Phoenix Webview Preview 的 Primary / Right 框架方向同步到正式宿主。Primary 的一级结构固定为：

```text
原生 View Header                     [目录显隐] [Ignore] [Settings]
├─ Directory                         固定单行；可由 Header 显示或隐藏
├─ Toolbar Strip                     16px chevron + 一份 Ribbon + 唯一 …
│  └─ 当前 Group 的紧凑下级导航      无标题；无下级时整体消失
├─ Current Tool                      固定展开；[Tool 图标][标题]       [×]
│  └─ Body                           Primary 唯一主纵向滚动区
└─ Open Items                        固定在底部；横向溢出 + 本区 …
```

- 四个区域按 `Directory → Toolbar → Current Tool → Open Items` 排列，全宽相邻，不使用卡片外边距或段间空白，也不增加段间拖动分隔条。
- Header 动作按 `Directory visibility → Ignore → Settings` 排列。目录动作只控制 Directory 显隐并保留选择；Ignore 和 Settings 切换 Current Tool，不创建额外一级区域或 Right 标签。
- Current Tool 没有折叠状态、disclosure 或不可操作占位。Header 左侧是当前 Tool 图标和标题，右侧独立 `×`；`×` 只关闭逻辑工具并按 MRU 回退，不关闭 Editor，也不停止或销毁任务。
- Open Items 固定在 Primary 底部，不随 Current Tool Body 滚动；它和 Current Tool、Right View 使用同一打开项、活动项和 MRU 状态源。
- Primary 页面不承担日常纵向滚动。Directory、Toolbar、Current Tool Header 和 Open Items 保持固定，只有 Current Tool Body 填充剩余高度并纵向滚动。

本 TODO 只约束把已确认原型保真接入正式 Host，不授权顺便改变业务功能、Controller、Right 业务布局或上述外壳效果。

## 2. 已确认的组件边界

正式 Host 与 Preview 应复用同一批 Host-neutral Web Components：

```text
Host / Store（状态、MRU、路由、Controller、生命周期）
├─ KtcPrimaryShell
│  ├─ KtcDirectoryBar
│  ├─ KtcToolbarStrip
│  │  └─ KtcToolNavigator
│  ├─ KtcCurrentToolRegion
│  └─ KtcOpenItemsBar
├─ KtcRightViewShell
└─ KtcSystemOutputBlock               仅 Preview 模仿 VS Code Output；不属于正式插件
```

- `KtcPrimaryShell` 是零 model、零 action 的四 named-slot 布局。它只固定 slot 顺序、零 gap 和 `current` 弹性轨，不聚合子组件状态，不代理或复制子组件行为。
- Directory、Toolbar、Navigator、Current Tool 和 Open Items 各自只负责正式 Primary 的稳定区域责任；Right Shell 负责正式 Right 外壳。Preview-only Output 只负责原型反馈的主题样式、显隐、滚底与可访问性。
- 组件只接收可序列化 ViewModel 或明确 slot，只发出带稳定 ID 的语义事件；Host 更新权威状态后再投影新快照。
- 组件不导入 `vscode`，不读写文件、Git、进程、工作区设置、`workspaceState`、`localStorage` 或业务服务，不拥有 MRU、路由、Controller 和跨 Surface 生命周期。
- Primary 与 Right 属于同一逻辑 Tool 时，由 Tool 消费者创建同一业务 Controller，并通过 Framework 的实例身份和消息通道投影不可变快照。两侧不得直接读取对方 DOM、Shadow DOM、模块变量或组件实例。
- Right Shell 只提供固定 Header、title、actions slot、Main slot 和声明式滚动模式。业务消费者提供 Main；框架不得按 UI 复杂度猜测布局。
- System Output 是 Preview 对 VS Code Output 的交互模仿，只接收原型按钮反馈。它不是 Tool 状态真源，也不是可等待后续宿主接入的正式框架能力。正式 AutoBuild 与项目改名继续使用唯一原生 `OutputChannel("KT Auto Code")`；不得把 Output Block 塞入任何正式业务 Right View、Webview 或 VSIX。

## 3. 正式接入顺序

1. 为现有 Host 状态增加到组件 ViewModel 的纯投影，并把组件 intent 适配到既有语义消息；先复用现有 Controller、MRU 和关闭逻辑，不复制状态机。
2. 在正式 Webview 构建中注册组件 Entry；逐区替换现有 DOM，保持每一步都能独立回归。不得把 Preview 的开发控制条、模拟 Editor 外框、fixture 数据或 `localStorage` 带入正式包。
3. 将原生 View Header 命令调整为目录显隐、Ignore、Settings，并为目录显隐迁移既有 UI 状态；隐藏 Directory 后布局轨必须收为零，恢复时保留选择与焦点语义。
4. 用 `KtcPrimaryShell` 固定四槽顺序；将 Toolbar 显式接入一份 Ribbon 和 compact `KtcToolNavigator`，再接入固定展开的 Current Tool 与底部 Open Items。
5. 将 Current Tool `×` 与 Open Items 的关闭操作统一到现有 MRU runtime；关闭、Right detach、停止任务和最终实例 destroy 必须保持不同动作。
6. 将 Preview 中的 Store 字段逐项分类到正式 `workspaceState`、Workspace Folder Settings 或 User Settings。机器路径不得进入项目设置，临时 UI 状态不得伪装成项目策略。
7. 接入 Right Shell 时只包裹消费者现有 UI；第一轮不重排或重写 AutoBuild 等 Right 业务区域。Primary 摘要只投影同一 Controller 的固定数据和稳定 `actionId`。
8. 完成真实 Webview 的 resolve、隐藏、reload、dispose、重新打开和 Extension Host 重启恢复，再处理多实例的 `toolId + instanceId + sessionId + revision` 协议。
9. 不接入正式自定义 Output：`KtcSystemOutputBlock` 只随 `pnpm ui` 的 Preview 源码运行，不生成正式 bundle，不进入 VSIX；插件始终沿用现有原生 OutputChannel。

## 4. 实施约束

- 外壳接入使用独立、可审查的提交，不与新增工具、领域算法、配置格式或 Right 业务改版混合。
- 不新增第五个 Primary 一级区域，不把 Open Items 放回 Current Tool Footer，不恢复 Toolbar-first 或两区 Tool Area 嵌套。
- 不恢复 Current Tool 折叠、无 Header 悬浮关闭或重复点击 Ribbon 隐藏 Surface 的旧语义。
- 不改变 Toolbar 的一份 Ribbon、固定尺寸两态、左侧 16px chevron 和唯一 Ribbon `…`；无下级 Tool 时不得保留 Navigator 空框。
- `KtcToolNavigator` 在迁移期可保留 legacy 兼容呈现，但正式新 Shell 必须显式选择已确认的 compact 呈现；删除 legacy 只能在旧消费者退场后单独决定。
- 不把业务内容移入组件 Shadow DOM；消费者继续通过 slot 或可序列化 ViewModel 提供内容，现有 Controller 和测试仍应能定位业务节点。
- 不引入 Vue、React、第三方折叠或拖拽库来完成本次接入。
- Preview 源码与开发服务器长期保留，但不进入生产 VSIX，也不得成为正式运行依赖。

## 5. 正式接入验收

- [ ] 原生 View Header 动作严格为目录显隐 → Ignore → Settings；tooltip、`aria-label`、键盘和主题图标通过点检。
- [ ] 正式 Webview DOM 恰好按 Directory → Toolbar → Current Tool → Open Items 排列四个一级区域，并实际复用对应共享组件。
- [ ] Directory 为 42px 左右的固定单行，左侧无装饰文件夹，右侧只有实际 folder picker；显隐不重置选择且无 ghost gap。
- [ ] Toolbar 展开态自然换行、紧凑态单行，按钮不会随 Primary 变宽；一份 Ribbon 和唯一 `…` 在所有宽度均可用。
- [ ] 下级导航无可见标题、无大纲模式、相对 Ribbon 缩进；`Aa` 只切名称，无下级时整个区域消失。
- [ ] Current Tool 始终展开；Header 为 Tool 图标、标题和独立 `×`，不存在 disclosure 或折叠状态；`×` 按 MRU 回退且不影响 Editor/任务。
- [ ] Open Items 固定在底部；激活、关闭、关闭其他项、方向键、Home/End、Delete、上下文菜单、Escape、溢出和焦点恢复可用。
- [ ] Primary 页面不整体纵向滚动，只有 Current Tool Body 是主纵向滚动区；窄宽和长内容下无双 scrollbar。
- [ ] Preview 与正式 Host 使用同一组件、ViewModel 和语义事件；组件依赖审计确认没有 Host、Store、Controller 或业务依赖。
- [ ] 正式日志只复用一个 `KT Auto Code` OutputChannel；任一业务 Right View 均不内嵌伪公共 Output，正式 bundle / VSIX 也不包含 Preview-only `KtcSystemOutputBlock`。
- [ ] Primary / Right 复用同一 Controller 和实例身份；关闭、detach、stop、destroy 语义不混淆，任一 Surface reload 后状态可恢复。
- [ ] 深色、浅色、高对比、forced-colors、75%–200% Zoom、macOS 和 Windows 常用 DPI 下边界、焦点、截断和固定操作可达。
- [ ] Preview 继续通过 `pnpm ui` 启动且金样本无回归；生产 VSIX 不包含 Preview 服务、fixture 或开发资源。
- [ ] 相关单元/DOM/契约测试、`pnpm typecheck`、`pnpm docs:check`、`pnpm verify:architecture`、`pnpm ext:dev:prepare` 和 Extension Host 手工点检通过。

## 6. 后续 UI 变更流程

Phoenix Webview Preview 是长期设计沙箱，不在本次正式接入后删除。以后涉及 Primary/Right 外壳、大区域、宿主交互、状态恢复或视觉基线的改动，统一按以下顺序推进：

1. 在 Preview 中建立安全 fixture 和可复现交互；
2. 通过浏览器注释收集并固化用户结论；
3. 用户明确确认后，才同步正式 Host、治理文档、状态迁移和回归测试；
4. 自动门禁通过且形成可展示的阶段成果后，启动可见的 VS Code Extension Host 交给用户查看；同时在真实 Host 中完成生命周期、主题、无障碍和发布门禁验证。

Preview 验收只代表设计和组件边界被确认，不能替代正式 Extension Host 或发布验收。后台 smoke 也不能替代阶段性的可见 Host 展示。

试行补充：上述顺序按风险分流，不要求已确认共享组件中的每个孤立像素改动重复实现。小而明确的调整可直接进入同一个 Host-neutral 组件；小而未定的效果用 Preview-only token 覆盖、保持正式 fallback，确认后仅提升该 token。任何需要复制组件 DOM、业务逻辑或事件协议的“原型捷径”均不允许；出现重复维护或 token 漂移时回顾并终止该试行方式。
