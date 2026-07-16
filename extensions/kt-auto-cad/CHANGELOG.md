# Change Log

## 0.1.0

- 建立依赖 KT Auto Code 的独立扩展骨架。
- 向共享 `kt-auto-code` View Container 贡献按需 CAD 详情 View。
- 通过 Desk Tools native provider 只读分析 FCStd，并展示对象、BOM、XLink 与根节点摘要。
- 使用 VS Code 文件 API 扫描工作区 FCStd，不要求 Desk Tools 或 native provider。
- 通过 VS Code 内置 `node:sqlite` 严格只读查询 workspace Schema v13，展示 BOM 与入向/出向引用摘要，无需 Desk Tools provider。
- 使用 VS Code 文件 API 与 TypeScript 轻量读取 `Document.xml`，创建或更新 Schema v13 文件索引、XLink 与递归基础 BOM。
- “读取”Block 增加无需 Desk Tools 的 TS 轻量读取与 XLink 诊断，Desk Tools 调整为可选深度增强。
- 增加 SQLite 文件索引搜索，支持路径、文件名、零件号、版本和名称。
- 单文件读取后复用 Wing XLink 目标解析规则，显示已解析、缺失、歧义和自引用诊断。
- Code/CAD 切换迁入原生 View Header；CAD 工具由 manifest 数据定义渲染到共享 Ribbon，删除独立 CAD 工具 View。
- 文件名分析、工作区检索和已有数据库查询不再要求 Desk Tools；只有 FCStd native 读取在执行时按需检查 provider。
