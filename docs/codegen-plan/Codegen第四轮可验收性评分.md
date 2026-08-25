# Codegen 第四轮可验收性评分

> 当前权威评分，更新于 2026-07-17。目标是在用户暂时不能手测时，把原型整理成可重复、可观察、可分阶段验收的 checkpoint；继续点检 MVC、缓存协议、多根工作区和异常边界。满分 100，90 分为代码自动验证门槛。用户随后已明确授权真实 Apply，当前实现采用工作区边界、源码指纹、未保存编辑器、原编码写回和失败回滚门禁。

| 执行项 | 权重 | 得分 | 证据与扣分 |
| --- | ---: | ---: | --- |
| 可重复 fixture 与手测入口 | 20 | 20 | tracked JSON/CSV/源码正负样例；每次复制到全新临时目录；1200 文件取消样例；源码与可编辑 JSON sha256/布局基线、可续填 QA 报告、`ext:prepare:codegen`、A/C/E verifier 和 `ext:report:codegen` 进度/门禁命令均可直接执行；Checkpoint E 以 Apply Receipt 复核基线指纹、当前字节和区域身份，普通手工改动不能冒充 Apply |
| 运行态可观察性 | 15 | 15 | 左侧复制诊断覆盖发现、CSV、会话、revision、冲突、候选、缓存和排队任务；不包含表格单元格和源码正文；A–F 清单严格区分机器 verifier 与人工 passed |
| 操作与文件事件可靠性 | 20 | 20 | watcher 语义回调、同 URI 外部事件串行、工作区 operation coordinator、post-cache 取消/任务所有权检查、按根强制复读标脏源码；无效或无法解码外部 JSON 保留最后有效模型；JSON/CSV 与源码上限均 fail closed |
| MVC、数据与缓存边界 | 15 | 15 | Wing 共享 Param 语义比较、Apply 计划审计/EOL 投影/写前复读/回滚；插件只保留文件 Port、编码、Output/Problems 和 UI；Document Model、View Controller、Discovery/Watch/Cache/Codec/Policy 均拆分；多根 JSON 按最深包含根路由缓存；JSON 保存和覆盖式 CSV 转换可恢复原文件；Qt/VB 矩阵与 A–F Feature 映射可执行校验 |
| UI、主题与可访问性 | 15 | 13 | 当前编辑区一 JSON 一标签、内嵌控制符/预检收缩区、VS Code theme token、高对比变量、窄窗口换行/滚动、表格/控制符 aria、Problems 定位和单选模式均完成；尚未在真实 Extension Host 人工确认主题与交互手感 |
| 自动回归与构建 | 15 | 15 | 插件 73 files / 364 tests；Code/CAD typecheck/build；Wing 20 files / 75 tests、typecheck/build；Ktd 镜像 17 files / 61 tests、typecheck；`git diff --check` 与全部计划 JSON 解析通过。本次 shell 为 Node 20，pnpm 报项目 `>=22` engine warning，但所有门禁实际通过 |

## 总分

**98 / 100**。代码自动验证超过 90 分门槛，已经形成适合用户稍后逐段测试的完整 checkpoint。2026-07-17 用户已确认 JSON 修改/保存与真实 Apply 核心路径 OK；其余 A–F 项继续保留为 TODO。

## 保留的 2 分与目标状态

- 需要用户按《Codegen 手工验收》在真实 Extension Development Host 中确认文件事件时序、深浅/高对比主题、窄窗口、关闭/重开 View 和交互手感。
- 在这次人工确认前，本自由目标保留为“等待手测”，不把自动测试等同于最终产品验收，也不标记为阻塞。

## 不属于本轮扣分

- `CustomEditorProvider` 的原生 Save All、Backup/Hot Exit 与关闭确认属于下一编辑器架构阶段。
- Apply All 仍是下一阶段；当前真实 Apply 只处理活动 JSON 的有效计划，并在写入前复验源码与工作区边界。
- DeskTools Vue thin wrapper 尚未接入，但 Wing browser-only Web Component、Core 和完整输入/输出接口已经可直接复用。
- Desk Tools Codegen 服务已在 `1551985` 归档并复用 Wing Analyze/Marker/Renderer，但仍自行实现 `replacementPairs`、EOL 与区域投影；其临时文件、权限、fsync、原子 rename 和回滚属于宿主边界。后续可只把重复投影换成 `ktCodegenProjectApply`。
