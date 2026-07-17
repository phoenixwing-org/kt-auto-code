# KT Auto Code 当前路线

状态：current

Owner：KT Auto Code maintainers

适用版本：0.5.x

最后核验：2026-07-18

## 已完成基线

- Code、CAD 两个扩展可以独立 typecheck、打包为 VSIX，并由制品检查验证必要文件。
- 自动测试覆盖纯核心、宿主 adapter、Codegen 文档模型、事务与回归场景；精确数量由 CI 结果维护，不作为源码断言。
- Wing 依赖均锁定 Registry 0.4.2；manifest、override 与 lockfile 的本地路径回退已被 `verify:wing-dependencies` 阻止。Auto Code 直接消费 Registry 内的 Codegen、Workspace Schema 和纯能力契约 fixture，不再保留 Apply 契约副本。
- 0.4 Block 工作流、Codegen 预检/Apply 与共享 workset 已进入稳定基线；旧实施清单保留为历史证据。

## 当前优先级

1. 将字符串型架构检查升级为 AST/import graph，固化 pure core、Extension Host 与 Webview 的依赖方向。
2. 与 Wing、Desk 共享 Analyze/Apply/Schema golden fixtures，避免宿主用自己的样例解释同一协议。
3. 真实 Extension Host 的打开、预览、冲突、Apply、保存复读和失败回滚已进入自动 smoke；继续补齐浅色、深色、高对比、取消和 VSIX 安装的人工视觉矩阵。
4. 从 P1 去重队列提炼两个无 UI 能力；优先 workset/ignore/path 与 encoding/file-core，不迁移 VS Code 命令或 Webview 状态。
5. 保持双 VSIX 可复现，并在 Wing 升级时先运行 Registry 防回退、全测和制品门禁。

## 已讨论功能 TODO：输出 Codegen 控制符模板

来源：旧 VB 程序可以输出全部控制文本，供新建源码尚无控制符时手工复制，也可用于排查“为什么 Apply 写不进去”。该能力作为显式辅助功能恢复，但不能把正常的未命中重新变成 warning。

### 交互决定

- 控制符工具栏增加会话级 checkbox：`显示缺失模板`，默认关闭，不写入 Codegen JSON，也不作为全局设置。checkbox 只表达持续显示状态，不承担一次性日志命令。
- 勾选后只在当前活动 JSON 中，为“已选且预检未命中”的控制符展开精确 Start/End；已命中项继续显示命中数量和源码定位，不重复展开模板。
- 工具栏另设按钮：`全部输出到日志`。这是显式、无副作用的一次性动作，直接输出当前 Param 的 32 个 legacy block × 去重 classId；不要求用户先改变选择预设，也不依赖预检成功。
- 每个控制符行增加 Output 图标按钮，tooltip/aria-label 为“输出〈友好标题〉控制符模板到日志”；它只输出该 block × 当前 Param 的去重 classId，并自动显示既有 `KT Auto Code` Output Channel。
- 行首现有 checkbox 继续只表示“是否参与 Preflight/Apply”，不能复用成日志范围；选择状态、缺失模板显示状态和日志动作三种语义保持分离。
- Output 文本可直接选择复制；若体验需要，可在 Output 后提供统一“复制本次输出”命令，但不在每行再堆第二个复制图标。
- 首版不自动插入源码、不猜测插入位置、不生成工作区 `.txt` 文件。将来若做自动插入，必须另有 target/anchor 契约、diff 预览和单独确认，不能复用本 TODO 暗中写盘。

### 两处消费与 Web Component 决定

- Primary 当前只有工作区级候选源码列表，完整控制符目录在 JSON View。实现时把共享目录/动作抽为 Auto Code 内部 Web Component `ktc-codegen-control-catalog`，再由组合组件 `ktc-codegen-control-panel` 装配预检结果、诊断和 Artifact 预览。
- Primary 使用 `compact` 形态消费 catalog：显示预设、选择、缺失模板 checkbox、全部日志按钮和单项日志图标；JSON View 使用 `full` 形态消费同一 catalog，并保留右侧预检/诊断/预览区域。两处不得复制 32 项 DOM、样式和事件逻辑。
- 两个 Webview 位于不同 Realm，不能共享组件实例。Host 的 `kt.codegen.control-view-model` / 文档 session 仍是状态真源；任一处改变选择或显示状态后由 Host 更新 session 并广播新快照，另一处同步刷新。
- Web Component 只接收结构化 model/property，并派发标准 `CustomEvent`（选择、显示缺失、输出全部、输出单项、定位）；Primary/View 的薄 wrapper 再映射为 VS Code `postMessage`。组件不得直接调用 `acquireVsCodeApi()`、Output Channel、clipboard 或文件系统。
- 先在 Auto Code 内部落地，因为当前只是同一产品的两个消费位置。只有 Desk Tools 成为第二个产品消费者、DTO 和交互稳定后，才评估迁入 Wing browser 子路径；不能因为“用了 Web Component”就提前变成公共 API。

### 文本与数据真源

- Start/End 必须调用 Registry `@phoenix-wing/kt-codegen@0.4.2` 的 `KtCodegenMarker.createStart()` / `createEnd()`，class identity 使用当前 `KtCodegenParam` 的 Prefix/Middle 与各行 `NameSuffix`；前端不得硬编码 Kevin marker 文本。
- 输出按 legacyId/blockKey → classId 稳定排序；每组包含友好标题、block key、classId、建议 target（若 Analyze artifact 可确定）、当前命中状态和两行可直接复制的标记。
- 同一 `(blockKey, classId)` 去重。没有有效参数行或协议不兼容时输出结构化原因；没有 artifact 只表示 target 暂不可建议，仍可输出由 Wing 生成的合法 Start/End，满足首次手工布点场景。
- 普通 Preflight/Apply 日志继续只显示“已找到 X 个已选控制符，共 Y 个区域”；checkbox 关闭时不得输出缺失列表，也不得发布 `marker.not-found` Problem。

### 验收门禁

- 纯 formatter 测试覆盖：缺失/已命中混合、多个 `NameSuffix`、重复 classId、无 artifact、稳定 legacy 顺序和 Windows/Unix 换行显示；全部动作必须覆盖 32 个 legacy block key，单项动作不得泄漏其它 block。
- 同一 Web Component characterization tests 必须分别挂载 `compact` / `full`，证明两处按钮、checkbox、键盘、tooltip/aria-label 与 CustomEvent payload 一致；不再分别对两份手写 DOM 做字符串断言。
- Webview 消息只传结构化模板 DTO；Output/clipboard 属于 Extension Host adapter，Wing 不依赖 VS Code API。
- Extension Host smoke 至少验证：默认无噪声、勾选只展示已选缺失项、单项/全部 Output 范围正确、Primary 改状态后 View 同步、关闭后恢复简洁日志，以及全部动作覆盖 32 个 legacy block key。
- 文档与手工验收说明必须明确：这是首次布点/诊断工具，不代表 Apply 可以在没有 Start/End 配对时自动写入。

## 已合并的旧路线

- `下一阶段实施计划.md`：已完成的 Ignore/搜索替换主体成为稳定基线，未完成 Extension Host 验收进入本路线第 3 项。
- `Codegen下一阶段实施计划.md`：已完成的预检和 Apply 不再作为未来计划；Custom Editor/真实宿主验证并入第 3 项。
- `0.4.0-Block工作流改造计划.md`：完成态 Block 改造转为历史证据。
- Codegen 各轮评分只保留当时证据，不再作为当前全工程评分。

## 边界

- Wing 是跨宿主纯算法与契约真源；本仓只拥有 VS Code Extension Host、Webview/VSIX、工作区权限和产品编排。
- Desk/Tauri 壳层和原生 CAD provider 不复制进入 Auto Code。
- 用户已于 2026-07-18 接受联合成熟度 **92.00** 作为本轮停止线；Windows 发布态回执保留为用户手工后续项，不补计本轮分数，也不再阻塞另立大型 UI 拆分目标。本轮仍禁止继续向大文件加入领域算法或文件真相。
- 测试数量、bundle 大小和版本关系由 CI/manifest 产生，不在当前路线复制易漂移数字。
