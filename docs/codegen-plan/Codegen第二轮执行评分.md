# Codegen 第二轮执行评分

> 历史阶段快照：本文件保留第二轮当时的实现和测试数量，不代表当前行为。当前权威状态见《Codegen 快速原型》《Codegen 手工验收》和《Codegen 第四轮可验收性评分》；当前 Apply 已按用户后续授权真实写盘。

> 目标：点检并完善 MVC 分离、解耦和 Qt/VB 遗漏迁移。满分 100，80 分为可验收 checkpoint。

| 执行项 | 权重 | 得分 | 证据与扣分 |
| --- | ---: | ---: | --- |
| Qt/Ktd/VB 功能矩阵 | 15 | 15 | 已形成机器可读矩阵，区分 migrated、deferred、复用和明确不迁移 |
| 纯 Document Model | 15 | 15 | revision、dirty、整表接收、属性、控制符选择、预检失效和 reload 集中到无 VS Code/DOM/FS 的 Model，并有单测 |
| 文件与发现 Service | 15 | 14 | JSON/CSV 事务使用注入 FS；Workspace Discovery 独立并支持多根；尚缺真实 VS Code FS E2E |
| View / Controller 分离 | 25 | 23 | Editor/Control WebviewPanel 已抽成无领域状态 View Controller；Workspace Controller 只做会话与命令编排；CustomEditorProvider 未迁 |
| 高价值遗漏迁移 | 15 | 15 | 左侧候选扫描/列表、VB 标题与预设/单选、Table 自适应列宽、600ms 防抖整表草稿同步完成 |
| 联合验证与文档 | 15 | 15 | Wing 66 tests；插件 258 tests；两边 typecheck/build 通过；依赖审计与矩阵落盘 |

## 总分

**97 / 100**。

本轮超过 80 分门槛，并停在完整 checkpoint。未给满分的部分均是下一安全阶段：CustomEditorProvider/Hot Exit、外部文件 fingerprint 冲突和真实 VS Code Extension Host E2E。真实 Apply 写盘仍是独立安全门，不因本评分自动授权。
