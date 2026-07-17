# Codegen 首轮执行评分

> 历史阶段快照：本文件保留首轮当时的实现、测试数量和 dry-run 决策，不代表当前行为。当前权威状态见《Codegen 快速原型》《Codegen 手工验收》和《Codegen 第四轮可验收性评分》；当前 Apply 已按用户后续授权真实写盘。

> 满分 100；沿用规划阶段的 80 分可交付门槛。评分只计算已经存在并通过相应验证的实现，不用计划文字代替代码。

| 执行项 | 权重 | 得分 | 证据与扣分 |
| --- | ---: | ---: | --- |
| 基线保护与执行拆分 | 5 | 5 | Wing 原工作区干净；kt-auto-code 原型改动未重置；按独立 checkpoint 实施 |
| Wing `KtCodegenTableData/Core` | 20 | 20 | 文件/类同名、17列、Qt Sort、Copy/Paste、checkpoint、revision 和身份测试完成 |
| Wing `KtCodegenTable` | 20 | 20 | browser-only export、显式注册、Shadow DOM、主题和8个行操作完成 |
| 插件集成与文档同步 | 20 | 16 | 已去除本地 Table/Core，属性迁到 Block，活动 View、整表交换、Save/Revert/revision 完成；尚未迁 `CustomEditorProvider`/Hot Exit |
| JSON/CSV 生命周期 | 10 | 9 | 每工作区首次自动发现、UTF-8/GBK、临时写入、复读、原子替换、成功后删除和冲突保留完成；Watcher 和事务级 VS Code FS 测试未完成 |
| Marker/Preflight/Controls/Apply | 20 | 14 | 两层缓存、Wing Plan、32控制符、旧预设、源码定位、Artifact 预览和 Apply dry-run 完成；缺真实工程 E2E、进度取消、缓存清理和 VB 友好标题 |
| 联合验证 | 5 | 5 | Wing 63 tests、kt-auto-code 253 tests、两边 typecheck/build 全部通过 |

## 总分

**89 / 100**，超过 80 分可交付门槛，本轮停在完整 checkpoint。

## 下一轮从这里继续

1. 把右侧 `WebviewPanel` 迁为 `CustomEditorProvider`，补 Save All、Backup/Hot Exit 和外部文件冲突。
2. 给 CSV 事务和 Preflight Cache 增加 VS Code FS/E2E fixture。
3. 增加预检进度、取消、缓存保留期/容量清理。
4. 从 VB `FormCAAWspGuide` 提取32项友好标题和说明。
5. 在 DeskTools 增加 Vue thin wrapper；真实 Apply 写盘仍需单独安全门。
