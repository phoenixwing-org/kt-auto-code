# Codegen 第三轮可靠性评分

> 历史阶段快照：本文件保留第三轮当时的实现和测试数量，不代表当前行为。当前权威状态见《Codegen 快速原型》《Codegen 手工验收》和《Codegen 第四轮可验收性评分》；当前 Apply 已按用户后续授权真实写盘。

> 自由目标：在不打开真实 Apply 写盘安全门的前提下，完成自动刷新、外部 JSON 冲突保护、可取消/可观测扫描、MVC 再剥离和宿主边界验证。满分 100，85 分为本轮验收门槛。

| 执行项 | 权重 | 得分 | 证据与扣分 |
| --- | ---: | ---: | --- |
| 自动发现与监听闭环 | 20 | 20 | 根目录与递归 glob 显式并行、URI 去重；JSON/CSV/源码 watcher 独立管理、路径过滤、500/750ms debounce，并有根目录和 watcher 行为测试 |
| 外部 JSON 数据安全 | 25 | 24 | 打开时 sha256 checkpoint、watcher 早期信号、保存前强制复读；reload/overwrite/recreate 三种决策，权限/瞬时错误不冒充删除；未做真实 Extension Host 文件事件时序 E2E |
| 取消、进度与失效 | 15 | 15 | 发现/候选共享可替换 CancellationToken，预检按文档取消；UI 按钮切换为取消，阶段进度可见；源码事件使旧 Plan 失效 |
| MVC 与复用边界 | 15 | 15 | Watch Service 从 Workspace Controller 剥离；Document Model 仍无 VS Code/DOM/FS；Document/Discovery/Preflight/View Controller 职责不回流到 Wing Table/Core |
| 运行态与宿主边界测试 | 15 | 13 | 直接执行 `renderCodegen` 伪 DOM；Document fingerprint/冲突、根/嵌套发现、watcher 分类/debounce 均可执行验证；缺真实 VS Code Extension Host E2E |
| 联合构建与回归 | 10 | 10 | 插件 52 files / 270 tests、typecheck、production build；Wing 19 files / 66 tests、typecheck、build 全通过 |

## 总分

**97 / 100**，超过 85 分验收门槛，停在完整可靠性 checkpoint。

## 未计入本轮完成的 3 分

- 使用真实 VS Code Extension Host 验证 macOS/Windows 上 watcher 事件顺序、原子替换事件组合和 Webview 关闭时序。
- `CustomEditorProvider` 的 Save All、Backup/Hot Exit 与原生关闭确认。
- 真实 Apply 源码写盘仍是独立安全门，不能由本轮高分自动授权。
