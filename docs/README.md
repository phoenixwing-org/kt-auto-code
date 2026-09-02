# KT Auto Code 文档索引

状态：current

Owner：KT Auto Code maintainers

适用版本：0.8.x

最后核验：2026-09-02

本页是当前文档的唯一导航。全部 Markdown 的状态、owner、适用版本和替代关系由 [`document-manifest.json`](document-manifest.json) 记录；运行 `pnpm docs:check` 检查清单漂移和 current 文档断链。

## 当前路线与架构

- [当前路线](current-roadmap.md)
- [0.8.1 发布准备](0.8.1发布准备.md)（当前项目改名 Windows 测试候选、Wing 0.7.2 适配与正式门禁）
- [0.8.0 发布准备](0.8.0发布准备.md)（已由 0.8.1 取代的项目改名初始候选）
- [0.7.4 发布准备](0.7.4发布准备.md)（未单独发布、内容已进入 0.8.1）
- [0.7.3 发布准备](0.7.3发布准备.md)（已发布的历史制品门禁）
- [0.7.2 发布准备](0.7.2发布准备.md)（已发布的历史制品门禁）
- [运行性能、Git 按需加载与 Codegen 刷新研究](运行性能与按需加载研究.md)（含非模态运行诊断与内存点检方案）
- [产品功能归属矩阵](产品功能归属矩阵.md)（与 Desk 使用相同 `featureId`，并引用 Wing 实际 `capabilityId`）
- [Phoenix 三形态产品架构](Phoenix三形态产品架构计划.md)
- [Code/CAD 简明功能关系与可选模块接入契约](可选模块接入契约.md)
- [项目调查](项目调查.md)
- [仓库结构与扁平化迁移记录](仓库结构与扁平化迁移计划.md)（根包结构、迁移决策与验收）
- [代码规范](代码规范.md)、[UI 开发规则](前端开发规则.md)与[工程配置/隐藏状态存储规则](工程配置与隐藏状态存储规则.md)
- [必要日志输出规则](必要日志输出规则.md)（Output、Terminal、Problems 分工与统一等级）
- [Ribbon 与基础上下文 Block 改进计划](Ribbon与基础上下文Block改进计划.md)（单 View 自动高度、置顶、拖动排序、两档密度与共享工作目录）
- [工作目录与统一设置 View 改造计划](工作目录与统一设置View改造计划.md)（固定单行目录、唯一设置齿轮与 Ignore 迁入设置）
- [固定与排序菜单控件](固定与排序菜单控件.md)（唯一 `…`、钉子、分组、拖动排序与用户点检）
- [ShellBlock 控件提炼 TODO](ShellBlock控件提炼TODO.md)（保持一级 Block 当前效果的后续等价抽取）
- [工作集退场与多目录范围调查](工作集退场与多目录范围调查.md)（消费者审计、无损边界与分阶段替换方案）
- [代码辅助入口整合 TODO](代码辅助入口整合TODO.md)（低频工具 Tree 分组、用户级折叠恢复、排序会话释放与逐项点检）

## Code 与 Codegen

- [Codegen 快速原型与 MVC 边界](Codegen快速原型.md)
- [Codegen 总 Controller 会话提炼点检](codegen-plan/Codegen总Controller会话提炼点检表.md)
- [Codegen 编辑器语义命令 Controller 点检](codegen-plan/Codegen编辑器语义命令Controller点检表.md)
- [Codegen 控制符目录 Tree 与范围 Combo 点检](codegen-plan/Codegen控制符目录Tree与范围Combo点检表.md)
- [Codegen 手工验收](codegen-plan/Codegen手工验收.md)
- [Codegen 全部应用 V1 点检](codegen-plan/Codegen全部应用点检表.md)与[2.0 批量报告计划](codegen-plan/Codegen全部应用与批量报告计划.md)
- [Extension Host 自动验收](ExtensionHost自动验收.md)
- [2026-07-20 功能修复人工点检表](2026-07-20-功能修复人工点检表.md)
- [搜索替换行为规范](搜索替换.md)、[编码规则](搜索替换编码规则.md)与[算法审计](搜索替换算法审计.md)
- [“项目改名”View 整改方案](项目改名View整改方案.md)（职责迁移、上下对齐、单行结果、固定操作列、写盘前原生 Diff 与写盘后 Git 对比评审稿）
- [项目改名第二阶段：结构化规则与正则可行性](项目改名第二阶段-结构化规则与正则可行性.md)（受控词段、RE2 类只读发现、逐命中冻结与 Go/No-Go 门禁）
- [关联规则选择器组件化 Baseline 点检](关联规则选择器组件化Baseline点检表.md)
- [C++ 成员排序 Page shell 拆分点检](成员排序PageShell拆分点检表.md)
- [源文件编码扫描](源文件编码扫描.md)与[编码修正](编码修正.md)
- [CAA 命名调查](PNXCaaStudy-CAA命名规则调查.md)与[Ignore 规则总结](PNXCaaStudy-Ignore规则总结.md)

## Git Primary Block（0.6.0）

- [讨论入口与当前推荐结论](git/README.md)
- [Git Primary Block 可行性与实施计划](git/Git-Primary-Block可行性与实施计划.md)
- [最新简报优先、历史与合并按需加载研究](运行性能与按需加载研究.md#5-git-加载缓慢的根因)

## Run Primary Block（0.6.0）

- [讨论入口与当前推荐结论](运行模块/README.md)
- [Run Primary Block 可行性与实施计划](运行模块/Run-Primary-Block可行性与实施计划.md)

## 可选 CAD 集成、开发与发布

- [KT Auto CAD 文档](https://gitee.com/PhoenixWing321/kt-auto-cad/tree/master/docs)（CAD 功能、研究、历史与发布均由 CAD 仓维护）
- [CAA UI 交接契约](CAA对话框-DeskTools交接契约.md)与[人工验收清单](CAA-UI-DeskTools人工验收清单.md)
- [本地 Wing 并列开发](本地Wing并列开发.md)
- [开发与测试](开发与测试.md)
- [VS Code 插件发布](VS%20Code%20插件发布.md)
- [0.4 Extension Host 人工验收](0.4.0-ExtensionHost人工验收清单.md)

## 历史与草案

0.1/0.3 发布记录、六轮 Codegen 评分、已完成的 0.4 Block 改造以及共享提取执行记录标为 `archived` 或 `superseded`；早期 VS Code/侧栏规划和三份已被 roadmap 取代的实施计划已移入 `docs/历史/`。尚未批准的文件改名与共享 UI 方案标为 `draft`。CAD 专属研究和迁移历史已移入 CAD 仓，不在本仓复制。

仓库入口见根目录 [README](../README.md)。
