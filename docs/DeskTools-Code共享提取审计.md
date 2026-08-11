# Desk Tools Code → phoenix-wing 共享提取审计

> 审计基线：`phoenix-desk-tools/server/src/lib/pdtCodeService.ts`、`reorder*Engine.ts`、`reorderMembersService.ts` 及其 Vitest。结论按“已经共用”“语义部分匹配”“尚不应抽取”区分，避免把 UI 或 Node 文件服务误迁入 VS Code。

## 1. 结论矩阵

| Desk Tools Code 能力 | Wing / KT 当前状态 | 匹配结论 | 下一步 |
| --- | --- | --- | --- |
| C++ `.cpp/.h` 成员排序 | Desk 的 `reorderCppEngine.ts`、`reorderHeaderEngine.ts` 已适配 `phoenix-wing/code-core`；KT 也调用同一入口 | **已匹配**：算法、锁定段与 fixture 以 Wing 为准 | Desk 和 KT 只保留扫描、编码、写盘、UI adapter |
| 结果文件分组/排序 | `pnwGroupFileResults()` 供 KT 原生 TreeView 使用 | **核心可用，Desk 未接入** | Desk 的 Vue 表格迁移时使用同一函数；目录树/列宽仍属各自 UI |
| UUID 虚线 / 花括号 / GUID32 | Wing 扫描、规范化替换与格式保持；KT 扫描、稳定同值映射、GBK/BOM 写盘前指纹检查 | **部分匹配** | 补 `fresh_per_hit`、单命中选择和共享报告 DTO |
| CAA `0x…` GUID | Wing 已覆盖 Desk 的 nested / flat brace / flat run 三种表示，KT 复用同一扫描、normalize 和原格式写回入口 | **语义已匹配** | Desk 改为直接使用 Wing parser 前，先完成 UUID plan / 报告契约 |
| UUID 替换计划 / 审计报告 | Desk 写 `.phoenix/reports/code-uuid-report-*` | **计划已匹配，报告落盘未匹配**：Wing 有 JSON-safe hit/group DTO，KT 原生 View 用它选择/写盘 | Desk 与 KT 后续以相同 DTO 序列化报告；是否写 `.phoenix/reports` 仍由宿主决定 |
| Code 批量改名 | Desk 有字面文本+文件+目录计划、冲突与 Windows case-only 处理；KT 有关联规则、CAA I/E 与 Webview 工作流 | **共享基础已具备**：Wing `pnwPlanCodeRename` 覆盖字面文本、basename、冲突和 case-sensitive 预检 | 不合并两套 UI；后续以该 plan 适配两端，并单列 CAA I/E 关联规则 |
| Code 索引 / 工作集 | Desk 有 SQLite 索引、ignore、scope；KT 只有工作区扫描和 `.phoenix/.ignore` | **尚未匹配** | 可先抽 extension 分类、路径规范化、glob/ignore 判定；SQLite、VS Code workspace、UI 状态不进 Wing |
| CAA/NLS “翻译” | Desk `catdlg-core` 提供 CATNls locale/key/patch，Vue 提供编辑器 | **不应作为泛翻译模块迁移** | `catdlg-core` 迁入 Wing 后统一复用 NLS 纯逻辑；Desk Vue 编辑器不迁入 VSIX |

## 2. 已验证的边界

### 可进 phoenix-wing

- 字符串、token、路径相对化、变更计划、冲突诊断、排序、IR、校验、fixture。
- `Pnw` / `pnw` 前缀的公开类型与函数。
- 与文件系统无关的 CAA handoff 协议校验。

### 只能留在宿主

- Desk 的 Node `fs`、SQLite、报告落盘、Tauri 进程和 Vue 页面。
- KT 的 `vscode.workspace.fs`、QuickPick、TreeView、Git 命令和 Extension Host 生命周期。
- CAA 的实际 parse/emit/patch 在 `catdlg-core` 未迁入前仍以 Desk 包为唯一实现。

## 3. 未来约 3 小时的整改目标

### H1（已完成）：UUID 语义核对与纯 token core

1. 已从 Desk 对齐 CAA GUID 的三种 token 形态、normalize 与原格式 emit 到 `phoenix-wing/code-core`。
2. Wing 覆盖虚线、花括号、GUID32、CAA nested/flat brace/flat run；KT 已适配 normalize 后的稳定同值映射。
3. Desk 端 adapter 与报告 DTO 留在 H2，保留各宿主扫描范围、选择 UI 和写盘方式。

### H2（已完成计划与 KT 原生 View）：UUID 选择/报告契约

1. 已定义 JSON-safe `PnwUuidReplacementPlan`：策略、稳定命中 ID、映射组、格式保持后的预览 token、诊断和按命中纯应用。当前 KT 使用 `map_per_value`；`fresh_per_hit` 已有 core 与测试，尚未暴露为 UI 选择。
2. KT 原生结果 View 按 UUID 映射组与逐命中显示，支持勾选组/单项；写盘后只更新对应缓存命中状态，不重扫。
3. Desk 报告迁移到同一 DTO 的序列化尚未执行；报告落盘仍是宿主行为，不进 Wing。

### H3（已完成基础 core）：Code 重命名计划 core

1. 已抽 `输入快照 → 文本/文件/目录变更计划 → 冲突`，不含 Node/VS Code 写盘。
2. 基础 core 已覆盖 Desk 的路径冲突、大小写敏感开关与空 level 回退；CAA I/E 关联规则仍是 KT 专项 adapter，不能静默并入字面改名。
3. 已有纯 core fixture；写盘 adapter、真实文件系统 case-only 改名和 Desk 接入后置。

### H4（已完成准备清单）：CAA core 迁移准备

1. 已列出 browser/Node 入口、fixture、依赖和调用方。
2. 已定义 Wing `catdlg-core` 目标路径、`Pnw/pnw` canonical API 和 Desk compatibility facade；不移动 Vue 页面。
3. 已确认现有 `phoenix-desk-tools.caa-dialog.v1` 可作为未来只读 adapter 的输入。

详见：[catdlg-core 迁入 phoenix-wing 准备清单](catdlg-core-迁入准备清单.md)。

## 4. kt-cad 的历史名称线索

当前工作区没有独立 `kt-cad` 仓库或 VS Code 扩展清单。找到的历史/候选名称是：

| 名称 | 证据 | 解释 |
| --- | --- | --- |
| `fcdesk` | Desk Tools `TODO.md` 的“包重命名（fcdesk → phoenix）” | 旧桌面包/产品名，不适合直接作为新 VS Code 扩展 ID |
| `phoenix-freecad-desktop` | `phoenix-freecad-study/.phoenix/phoenix-freecad-desktop.json` 及偏好迁移文档 | 旧工作区偏好文件名，不是插件名 |
| `Phoenix CAD 插件` | 平台规划文档的产品占位名称 | 目前最接近新插件的中文展示名 |
| `FreeCAD 插件` / `freecad` | 平台插件 ID 规划 | 最稳定的技术 ID 候选；若创建 VS Code 扩展建议内部 ID 用 `ktAutoCad` 或 `phoenixFreecad`，展示名另定 |

在真正新建插件前应先定“它是 VS Code 的 CAD 工作区浏览/任务入口，还是 FreeCAD 内插件”。两者不能共享同一安装与运行模型。
