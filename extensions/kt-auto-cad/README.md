# KT Auto CAD

`KT Auto CAD` 是 `KT Auto Code` 的可选 CAD 模块，必须与 `kuntai.kt-auto-code` 基础插件一起使用。

当前版本已验证双 VSIX、共享 Primary Side Bar、Shell API v2，以及 Wing CAD 契约与 Desk Tools native provider protocol v1。Code/CAD 是原生 View Header 中可独立勾选的模块标签；模块 manifest 把工具定义交给基础插件的共享 Ribbon，CAD 通过 Block provider 只提交标题、状态、Header action 和内容片段。容器、Header、关闭、已打开/当前状态及 MRU 恢复全部由基础插件统一管理，CAD 不再贡献自己的 View。

文件名语义、工作区 FCStd 检索、SQLite 文件索引和基础 BOM 分析直接消费 `@phoenix-wing/cad-core`、VS Code 文件 API 与 TypeScript，不要求安装 Desk Tools。只有“读取 FCStd 内容”的深度对象分析在实际执行时要求 Desk Tools provider。

“读取”Block 提供两级能力：“TS 轻量读取”直接解压单个 FCStd 的 `Document.xml`，展示对象数量、XLink 和工作区目标诊断；“Desk 深度读取”是可选增强，用于完整对象属性和原生 BOM 数据。未安装 Desk Tools 不会隐藏或禁用轻量读取。

“只读分析 FCStd”只调用 `--protocol 1 read`，不导入数据库 adapter、不创建 `.phoenix`，也不会修改所选文件。native 错误 envelope 会转换为可诊断的信息，不把无效 JSON 当作成功结果。

“扫描工作区 FCStd”使用 VS Code `findFiles`，忽略 `.git` 与 `node_modules`，最多展示 5000 个结果；它只枚举文件，不会自动批量启动 native 进程。

“扫描并更新 SQLite 索引”先用 VS Code API 找到工作区 FCStd，再以纯 TypeScript 从 ZIP 容器读取 `Document.xml`，提取文件名语义和 XLink，写入 `.phoenix/phoenix-workspace.sqlite` 的标准 Schema v13 表。单个文件无法轻量解析时仍会进入文件索引，并记录解析错误；递归 XLink 形成的 BOM 是基础分析，不替代 Rust 对复杂 FreeCAD 对象和精确数量的深度读取。

“搜索文件索引”可按路径、文件名、零件号、版本和名称检索。“查询 BOM 与引用”以只读模式打开同一数据库，执行 Wing `cad-contracts` 中与 `phoenix-cad-query` v1 对齐的参数化查询，展示基础 BOM 树和入向/出向引用摘要。插件不会携带第三方 SQLite/WASM；旧版 Extension Host 缺少 `node:sqlite` 时会保留 VS Code 文件扫描能力并提示升级。

本插件不注册 Activity Bar View Container。安装后仍只使用 `KT Auto Code` 的一个图标，并在工具栏原生 Header 中出现 Code/CAD 切换操作。

本插件是 thin companion，不在 VSIX 内置 Rust 二进制。Desk Tools 从 `@phoenix-wing/cad-rust-source` 编译并随桌面安装包发布 `runtime/native-provider.json`；用户执行 FCStd native 读取时才选择 Desk Tools 安装目录或该清单，插件使用 Wing `cad-contracts` v1 guard 校验平台、相对路径、SHA-256、能力及 `fcstd-read`/`fcstd-xlink` 的 `--protocol-version`。未配置 provider 时，文件名分析、工作区检索、基础 View 和已有数据库查询仍可使用。

当前仓库从 npm Registry 精确消费 Wing CAD 小包 `0.4.3`，不再通过 pnpm override 解析到相邻工作副本；发布包中的算法已被 esbuild 收入 thin bundle。Workspace Schema 兼容性 fixture 直接来自 Registry，未知未来版本按 fail-closed 策略拒绝写入。完整端到端发布验收仍需与 Desk Tools 安装态 provider 完成联调。
