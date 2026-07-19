# Codegen 控制符未闭合呈现

## 术语与状态

Primary 的控制符目录采用互斥状态：`命中`、`未闭合`、`未命中`。用户可见术语统一使用“未闭合”；内部仍用 `marker.missing-end` 区分缺 END、用 `marker.orphan-end` 区分缺 START，不改协议和自动化判断。

当同一控制符存在 `marker.missing-end` 或 `marker.orphan-end` 时，目录状态优先显示“未闭合”，避免错误被“命中”或“未命中”掩盖。预检首次产生未闭合错误时，目录默认切到“未闭合”筛选。

状态投影只消费 Wing 诊断的可选结构化 `marker` 上下文（kind、classId、blockKey、boundary），不得从英文 `message` 反向解析身份或停止位置。Registry 0.4.2 没有该字段时保持原有“未命中”显示；本地联合开发及 Wing 下一补丁版本提供结构字段后启用“未闭合”，避免文案变化破坏 UI。

## 详情与安全操作

Primary 的“未闭合”行不展开诊断，完整错误统一在 JSON View“预检结果”的问题详情显示。`marker.missing-end` 的详情包含：

- Start 所在文件和行；
- 期望的完整 END 控制符；
- 扫描停止位置：下一个 START、下一个 END，或文件末尾；
- 原始 `marker.missing-end` 诊断，便于调试和复制问题上下文。

`marker.missing-end` 提供`打开位置`和`复制 END`；Host 会用当前 session 的预检投影重新校验路径、行和 blockKey 后才打开或复制。`marker.orphan-end` 只提供定位，不伪造 START，也不复用“复制 END”。此处不自动改源码，不插入 `#error`；高风险修正入口留待后续单独设计。

## 点检

### 2026-07-19 真实工作区回执

- [x] 控制符缺失时，Preflight / Apply 正常报告错误，其他完整区域仍可写入。
- [x] 用户手工补齐缺失控制符后重新 Apply，写入成功且错误归零。
- [x] 缺 END 的 `marker.missing-end` 在 Primary 显示“未闭合”，不显示“未命中”。
- [ ] 缺 START 的 `marker.orphan-end` 在 Primary 也显示“未闭合”，等待真实 Host 复核。

以下界面呈现与辅助操作仍需分别点检：

- [ ] PNXBomAnalysis 的 constructor Start 在下一条 Start 前没有 END：显示“未闭合”，不显示“未命中”。
- [ ] 展开行显示起始行、下一条 START 第 125 行、期望 END 和诊断码。
- [ ] “打开位置”定位到 Start 行。
- [ ] “复制 END”只复制一行完整 END，不刷新 Primary，不改变折叠/筛选/选择。
- [ ] 未闭合与正常命中同时存在时，未闭合优先。
- [ ] 普通零命中控制符仍显示“未命中”。
- [ ] 不出现自动修改源码或插入 `#error` 的入口。
