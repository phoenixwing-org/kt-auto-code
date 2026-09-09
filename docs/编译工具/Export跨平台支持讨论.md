# Export 跨平台支持讨论

状态：议题登记，待讨论；不属于 0.9.0 内测的已实现能力

最后核验：2026-09-09

## 用户提出的方向

把已有 C++、Qt、CAA 导出行为整理为 `export.yaml`，PowerShell 的 `export.ps1` 只做薄调用；
插件通过 TypeScript 读取相同规则并执行输出，使 Windows/macOS/Linux 共享一份声明。
用户已明确要求“稍后进行讨论研究”，本轮仅记录，不确定 schema、不迁移现有脚本。

## 后续研究清单

- 逐项盘点 C++、Qt、CAA 的源目录、头文件/库/运行时/资源、平台后缀、Debug/Release 和目标目录约定。
- 对比 Root commonExport、commonCAAExport、exportCAAFramework、exportAll 与项目 export.ps1；不能只抽取一个 C++ 项目就声称覆盖全部。
- 明确 YAML 是受限文件操作声明还是允许自定义命令；优先讨论受限声明，禁止把任意 YAML 字符串当 shell 执行。
- 讨论路径基准、环境变量白名单、glob、覆盖/新建、冲突、链接边界、预览/冻结/复验、失败与取消的规则。
- 确定 Wing 的纯规则模型、Node 执行器与 Auto UI/Output 的职责，以及 PS1 薄入口如何消费同一逻辑。
- 决定未知/自定义 export.ps1 的兼容入口与显式平台提示，不静默删除能力。

## 当前临时策略

Windows 保留原 export.ps1。非 Windows 不尝试运行 PS1，明确输出“未运行 export.ps1”，
标记任务已跳过，然后按用户要求顺序尝试 CMake；若依赖缺失，则显示真实构建错误。
这是迁移期间的明确限制，不是跨平台导出已经完成。

进度回写到[TypeScript 运行时迁移计划](TypeScript运行时迁移计划.md)。
