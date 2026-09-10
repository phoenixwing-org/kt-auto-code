# PnwCombo 组件提炼 TODO

状态：current

Owner：KT Auto Code maintainers

适用版本：0.9.2 / Wing 0.7.4 本地候选

最后核验：2026-09-10

## 当前结论

`PnwCombo` 的运行时与样式已经迁入 Phoenix Wing 的 `@phoenix-wing/code-core/ui`，
不是待重新实现的本地组件。0.9.2 获准完成迁移收尾：本仓只保留薄 adapter 和 Webview
入口，删除重复类型、强制类型转换及重复的全局 tag 声明；直接消费 Wing 的公开常量、
模型、事件类型与类。组件只渲染 Host 投影并发送语义事件，不读取 VS Code API、存储、
项目改名或搜索替换业务状态。

本轮未改变依赖 manifest/lockfile。当前锁定的 Registry `code-core@0.6.4` 不提供所需
公开 Combo 契约，不能冒充迁移验证通过；使用明确的 Wing 本地候选与受控本地类型/来源
门禁。后续 scoped 版本及 Registry 消费者升级由发布准备统一核验，不在本 TODO 中自行发布。

本轮已确认的交互是：

- Trigger 保持普通下拉的当前值、占位、禁用态和键盘入口。
- 菜单可按组展示；每一行都保留 `×` 位置。可删除项发送 `remove`，共享或受保护项显示禁用 `×` 及原因。
- 菜单底部提供“全部清空”；只清空 Host 标记为 removable 的本机记录。外部独立 `×` 和“清空”按钮已取消。
- 选择、单项删除、全部清空分别发送冻结的 `select / remove / clear` 事件；确认、持久化、权限和错误提示仍由各业务 Controller 负责。
- `aria-label`、`role=combobox/listbox/option`、方向键、Home、End、Escape、Tab 和点外关闭由组件统一处理。
- 弹层使用视口定位并计算当前可见边界；下方空间不足时自动向上展开，两侧空间都不足时限制高度并在弹层内部滚动。滚动或缩放后会重新定位，不要求用户手动移动 Primary 内容。
- `select / clear` 关闭菜单后先返回触发器，再发送语义事件；Host 可以随后打开确认框或移动焦点。
  `remove` 不擅自删除模型；Host 回传新模型后保留原操作焦点，已删除项则落到邻近候选，
  最后一项消失时返回触发器。组件外已有焦点不会被模型刷新抢走。
- Tab / Shift+Tab 关闭菜单并沿原生焦点顺序离开；Escape 返回触发器。点外、断开或同步
  关闭后，旧微任务不能重新聚焦隐藏菜单。禁用删除原因同时进入可访问名称。

## 已接入位置

| 消费者 | 数据分组 | 删除语义 | 清空语义 |
| --- | --- | --- | --- |
| 项目改名 Primary“选择方案” | 当前项目方案、用户最近输入、共享档案 | 当前项目方案和用户最近输入可删；共享档案的 `×` 禁用 | 清空本机方案；共享档案保留 |
| 搜索替换 Primary“最近改名” | 最近源/目标对 | 每行可删 | 清空全部最近改名记录 |

普通静态枚举、编码选择、目录选择和 AutoBuild 最近配置暂不强制替换；只有出现“每行管理动作”需求时才接入，避免把简单 `<select>` 复杂化。

## 公共契约与消费者证据

- Wing 唯一真源：`packages/code-core/src/ui/elements/PnwCombo.ts`，公共门面为
  `@phoenix-wing/code-core/ui`，不导入内部源码子路径，也不合并 Vue 的 `PnwComboTextInput`。
- tag 保持 `pnw-combo`；事件名保持 `pnw-combo-action`，detail 为
  `{ kind: "select" | "remove", itemId }` 或 `{ kind: "clear" }`，冻结并跨 Shadow DOM 冒泡。
- Host 模型仍包含候选、分组、当前项、禁用原因和清空权限；最多保留 200 个有效且唯一的候选。
  本轮不扩展搜索、虚拟化或 QuickPick，不让组件决定持久化或业务删除权限。
- 正式消费者：`src/sidebar/panelHtml.ts` 中的项目改名方案及搜索替换历史；Preview 消费者：
  `ui-preview/src/main.ts`。两者共用 `src/ui/PnwComboWingAdapter.ts` 与 Wing 运行时。
- `src/ui/PnwComboEntry.ts` 和 `dist/pnw-combo.js` 是受 CSP 约束的 Webview 装载入口，
  不再持有独立组件算法；仍需保留并由制品门禁核验，不能把“删除重复实现”误解为删除入口。

## 0.9.2 收尾与验收边界

- [x] 明确 Wing 包名、tag、模型和事件兼容；保留既有交互，不和业务功能重排合并。
- [x] 本仓先实现 Primary 滚动边界内的视口定位、上下自动避让、受限高度和滚动/缩放重定位，并完成组件测试与 Preview 点检。
- [x] 保留 200 个有效唯一项上限，并覆盖去重、超限选中项失效、冻结模型和保护项不清空。
- [x] Wing 修复焦点返回/模型刷新焦点、关联 combobox 与 listbox、禁用原因可访问名称，
  并沿 Shadow Host/slot 继续寻找裁剪边界；保留上下避让与滚动/resize 重定位。
- [x] 删除 Auto 重复契约与 `unknown` cast，保留薄 Webview 入口和既有制品检查。
- [x] 2026-09-10：Wing Combo Happy DOM 13 例、`code-core` 全包 20 文件 / 111 例及类型检查通过；Auto adapter 委托测试 1 例通过。
- [x] 同日 Chrome 独立源码组件页：实测 End+Enter 选择、Tab/Shift+Tab 前后退出、Escape、
  删除后 Host 模型刷新、全部清空、点外关闭；焦点状态和禁删原因由 AX 树核对。截图确认
  两项菜单向上避让、删为一项后向下；浅/深/高对比 token 样例无菜单裁剪。
- [ ] 真实 Extension Host 多窗口、浏览器缩放、系统强制颜色及屏幕阅读器朗读仍须点检；
  Chrome token 样例不等于该平台/主题矩阵通过。Windows 未运行。
- [x] Auto 受控 `ext:dev:prepare` 全量及 sibling 来源门禁通过；本地类型检查直接读取 Wing dist 公开声明，消费者 node_modules 命中 0，不修改 Registry 锁文件。
- [ ] 新 scoped Registry 包发布/Auto 精确升级仍为外部发布前置条件；真实 Host 多窗口与辅助技术矩阵不由普通 Extension Host smoke 替代。

超过 200 项的搜索/虚拟化/QuickPick 仅保留为未来评估，本轮不实施。清理对话框快捷栏与
编译工具后续均不在本轮范围，不能因 Wing 同时包含这些公共能力而顺带扩展。

项目改名、搜索替换中与下拉组件本身有关的焦点、弹层、批量清空和 Wing 提炼 TODO 统一维护在本文，不再分散复制。
