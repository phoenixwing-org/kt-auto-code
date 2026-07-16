# KT Auto CAD 同仓实施计划

> 本文只描述 `kt-auto-code` Git 仓库内的 VS Code 产品接入工作。跨语言共享包、Rust 源码、数据库契约和跨端版本策略，以 `phoenix-wing/doc/跨语言多包架构与三库迁移计划.md` 为唯一权威来源；Desk Tools 的迁出与消费步骤由其自身仓库维护。

## 1. 已确认决策

1. 不新增 `phoenix-cad` 或其他 Git 仓库。
2. 本仓库同时产出 `kt-auto-code` 与 `kt-auto-cad` 两个 VSIX；CAD 在 manifest 中通过 `extensionDependencies` 依赖 `kuntai.kt-auto-code`，不能脱离基础插件安装运行。
3. CAD 契约、纯 TypeScript CAD core、数据库 Schema 契约和 Rust CAD 源码归 `phoenix-wing`。
4. `kt-auto-cad` 只拥有 VS Code Host adapter、Webview、命令、设置、任务和发布脚本。
5. Wing npm 包发布 Rust 源码；Desk Tools 在产品构建阶段显式执行 Cargo 并随桌面安装包发布 native provider。本仓库默认产出不含 Rust 二进制的 thin VSIX。
6. CAD 能力按需分级：Wing TS 文件名语义、工作区 FCStd 检索、基础 View 和已有 Schema v13 数据库只读查询不依赖 Desk Tools；只有 FCStd native 内容读取及后续原生写回在执行时选择/发现 `runtime/native-provider.json`。数据库查询使用 VS Code Extension Host 内置 `node:sqlite`，npm `postinstall`、VSIX 打包和插件激活阶段均不编译 Rust。
7. 现有 `kt-auto-code` 的原生 HTML/CSS/JS Webview 保持不动；只抽取确有第二个消费者的 VS Code 壳层代码，不以重写 Vue/Element Plus 为前置条件。
8. Activity Bar 只保留现有 `kt-auto-code` View Container 和一个图标；`kt-auto-cad` 不贡献 `viewsContainers`，只向基础插件的 `kt-auto-code` container 贡献 CAD Views。

## 2. 产品与目录边界

迁移期间保留现有 `extension/` 路径，避免一次性破坏 F5、VSIX 和文档入口；新增 CAD 插件使用独立目录：

```text
kt-auto-code/
├── extension/                    # 现有 kt-auto-code VSIX
├── extensions/
│   └── kt-auto-cad/              # 新增 KT Auto CAD VSIX
├── packages/
│   └── vscode-host-core/         # 可选；仅沉淀已有双端重复的宿主无关壳
└── pnpm-workspace.yaml
```

暂不把 `extension/` 移到 `extensions/kt-auto-code/`。等双插件构建、F5 和发布流水线稳定后，再单独评估目录对称化。

### 2.1 单 Activity Bar 组合方式

```text
kt-auto-code VSIX（基础插件）
  ├── 注册唯一 viewsContainer: kt-auto-code
  ├── 在原生 View Header 注册 Code/CAD 模块复选操作
  ├── 按模块数据定义在同一个 Ribbon 渲染工具按钮
  ├── 贡献 Code 详情 View
  └── 持有模块可见性、当前 Block 与模块分组上下文

kt-auto-cad VSIX（依赖插件）
  ├── extensionDependencies: [kuntai.kt-auto-code]
  ├── 不注册 Activity Bar container
  ├── 以 manifest 的 ktAutoCodeModule 数据定义贡献 CAD Ribbon 工具
  └── 向 views.kt-auto-code 只贡献按需 CAD 详情 View
```

基础插件提供版本化的 VS Code Shell API/命令契约；CAD 激活时检查版本，不兼容时只显示升级提示并禁止业务命令。

Shell API v1 由 `kuntai.kt-auto-code` 的 `activate()` 返回：

```ts
interface KtcAutoCodeShellApiV1 {
  readonly version: 1;
  getModuleState(): KtcModuleState;
  activateModule(moduleId: "code" | "cad"): Promise<boolean>;
}
```

同时保留内部命令 `ktAutoCode.module.activate`，便于 View/命令桥接；CAD 插件应优先显式激活依赖扩展、校验 `version === 1` 后调用 API，不能只假定命令已经注册。

## 3. Wing 子包消费

| VSIX | 必需 Wing 包 | 禁止带入 |
| --- | --- | --- |
| `kt-auto-code` | `@phoenix-wing/core`、`@phoenix-wing/code-core` | CAD core、CAD Rust、Vue 全量 UI |
| `kt-auto-cad` | `@phoenix-wing/core`、`@phoenix-wing/cad-contracts`、`@phoenix-wing/cad-core`、`@phoenix-wing/workspace-schema` | CAD Rust 源码/二进制、第三方 SQLite 驱动、Desk Tools Hono 路由、Tauri API、产品数据库服务 |

初期 Wing 子包统一版本，根、Code VSIX 与 CAD VSIX 均锁定准确版本。正式 VSIX 不从相邻仓库路径读取运行时文件；本地联调可以通过根 override 使用小包源码，但发布验收必须从 npm tarball 完成一次干净构建。

## 4. Desk Tools Native Provider

### 4.1 构建规则

- Desk Tools 使用 `cargo build --release --locked --manifest-path <wing-rust-source>/Cargo.toml`，并发布 `runtime/native-provider.json`。
- Provider 清单声明平台、工具相对路径、SHA-256、能力和 native protocol；插件不猜 Desk Tools 内部 Cargo 目录。
- Provider 可以继续为 Desk Tools 自身发布 `fcstd-read`、`fcstd-xlink` 与 `fcstd-query`，但插件只消费前两个 native protocol v1 工具；数据库只读查询不再经过 provider。
- 插件只在用户执行 FCStd native 读取或显式配置命令时要求 Desk Tools 安装目录；打开 CAD、文件名分析、工作区检索和数据库查询不弹 provider 选择。配置按机器保存，路径失效时执行相关能力再提示。
- 每个 CLI 支持机器可读的 `--protocol-version`；插件只校验和调用，不编译。

### 4.2 发布策略

默认只发布一个不含平台二进制的 `kt-auto-cad.vsix`。Desk Tools 安装包负责匹配当前平台；provider 平台与扩展宿主不一致时拒绝调用。远程 SSH/WSL 工作区首期不支持使用本机 provider。

## 5. KT Auto CAD 功能路线

### C0：仓库与发布骨架

- [x] 新增 pnpm workspace，但保持现有根命令兼容。
- [x] 新增 `extensions/kt-auto-cad/package.json`、扩展 ID `kuntai.kt-auto-cad`、显示名 `KT Auto CAD`，声明依赖 `kuntai.kt-auto-code`。
- [x] CAD 不贡献 View Container；CAD 工具由 manifest 数据定义进入基础插件的同一个 Ribbon，只保留按需详情 View、Output Channel 和诊断命令。
- [x] 基础插件在原生 View Header 建立 Code/CAD 互斥切换、activeModule 上下文和 Shell API v1；切换只替换 Ribbon 按钮，不自动打开 Block。
- [x] 接入 Wing 契约版本与 Desk Tools native provider 检查；双方使用同一 `cad-contracts` v1 guard，并校验 provider manifest、平台、SHA-256、能力、workspace Schema v13 哈希与两个 native CLI 的 `--protocol-version`。
- [x] 为两个扩展分别设置 `vscode:prepublish`，禁止把旧 `dist` 打进 VSIX。
- [x] 根 Vitest、VS Code launch/task 和打包脚本显式覆盖 Code/CAD 两个扩展。
- [x] 双 VSIX 发布物门禁检查依赖、共享 Activity Bar、不含源码/source map/node_modules/SQLite/Rust/平台二进制；Code VSIX 直接消费 `@phoenix-wing/code-core`，不再安装 Vue 聚合包。
- [x] 产出不含业务功能的首个可安装 VSIX。

退出条件：`kt-auto-code` 原构建无回归；只安装基础插件仍正常；安装 CAD 后 Activity Bar 不增加图标，卸载 CAD 后共享区域恢复为纯 Code。

### C1：FCStd 只读能力

- [x] 接入 `@phoenix-wing/cad-core` 的 BOM 文件名解析，在原生 HTML/CSS 详情 View 中预览当前 FCStd 的文档类型、零件号/版本和名称。
- [x] 使用 VS Code 文件枚举扫描当前工作区 `.FCStd`，最多返回 5000 项，在 CAD 详情摘要展示；不建立索引数据库，也不要求 Desk Tools。
- [x] 通过已校验的 Desk Tools provider 调用 Wing `fcstd-read --protocol 1 read`，展示对象、BOM、XLink、根节点摘要和稳定错误诊断。
- [x] 同一真实 `Document.xml` fixture 已覆盖 Desk Tools/Wing/Auto CAD：XLink 比较完整协议 JSON；FCStd read 先通过 v1 guard，再比较对象/BOM/XLink/根节点和选定对象的稳定摘要。
- [x] 当前单文件读取路径不导入数据库 adapter、不创建或修改工作区数据库，也不开放任何写回命令。

退出条件：未安装 Desk Tools 时可离线完成文件名分析与工作区检索；安装 provider 后可继续完成无 Python 的内容只读分析。

### C2：索引、BOM 与引用图

- [x] 在 Wing `cad-contracts` 提供无驱动的 `phoenix-cad-query` v1 参数化 BOM/引用只读查询核心，并以 Rust 共用的 Schema v13 SQL fixture 验证等价结果。
- [x] 在 `.phoenix/phoenix-workspace.sqlite` 上实现 thin VS Code adapter：使用 Extension Host 内置 `node:sqlite` 严格只读打开，支持活动 WAL，不把第三方 SQLite、WASM 或 Rust 二进制带入 VSIX。
- [x] 已在原生详情 View 展示 BOM 树、入向/出向引用摘要；单文件读取后按同一工作区候选集调用 Wing `pnwResolveXlinkTarget`，展示 resolved/missing/ambiguous/self 规则诊断与明细。
- [x] 数据库缺失或版本不兼容时阻止查询；插件不创建、迁移、重建或写入数据库。旧 Extension Host 缺少 `node:sqlite` 时仅数据库命令提示升级，不影响其他 CAD 能力。

退出条件：同一 fixture 数据库在插件和 Desk Tools 上得到等价查询结果。

当前验收：Wing 无驱动查询核心通过非 Rust SQLite adapter 读取 Rust 共用 v13 SQL fixture；Auto adapter 又在 VS Code 1.128 / Electron 42 / Node 24.17 的真实 Extension Host 中读取活动 WAL，能看到尚未 checkpoint 的引用记录。独立查询 bundle 为 7.7 KB，不包含 WASM、Rust 或 Desk provider。

### C3：预览与受控写回

- [ ] XLink 修正、Label 同步、BOM 属性写回先生成不可变计划。
- [ ] 编辑区 View 展示逐文件 diff、影响范围和风险诊断。
- [ ] 用户勾选并确认后才调用 Rust apply。
- [ ] 写盘前校验文件指纹；冲突文件跳过且不覆盖。
- [ ] 写盘后重新读取文件并生成审计报告。

退出条件：取消、协议不兼容、文件冲突和部分失败均不会静默覆盖文件。

### C4：复杂流程与 Companion

- [ ] STEP/FreeCADCmd、SolidWorks COM 和复杂 CAA 画布仍由 Desk Tools 承载。
- [ ] `kt-auto-cad` 通过版本化 handoff 打开 Desk Tools，不复制其页面。
- [ ] 根据真实用户流程决定哪些复杂页面值得在 VS Code 重建。

## 6. UI 共享边界

两个扩展的标识必须完全隔离：

| 项目 | KT Auto Code | KT Auto CAD |
| --- | --- | --- |
| Extension ID | `kuntai.kt-auto-code` | `kuntai.kt-auto-cad` |
| 命令/配置前缀 | `ktAutoCode.*` | `ktAutoCad.*` |
| View container | 注册并拥有 `kt-auto-code` | 不注册；贡献到 `kt-auto-code` |
| View/context key | `ktAutoCode.*` | `ktAutoCad.*` |

CAD 首版新建小型 Webview，不能复用当前包含全部 Code 工具协议的 `panelHtml.ts` 或继续扩充同一个消息 union。

### 6.1 Header 模块复选与 Ribbon 显示规则

`Code`、`CAD` 使用 `view/title` 原生复选操作，排在搜索等通用操作之前。两个模块可以单独显示，也可以同时显示。复选只控制 Ribbon 分组可见性，不自动打开或关闭业务 Block：

| Header 复选状态 | 同一个 Ribbon 内容 | 复选副作用 |
| --- | --- | --- |
| 仅 `Code` | 头文件、编码、忽略、替换、排序、UUID、CAA | 隐藏 CAD 分组，保留已打开 Block 的状态 |
| 仅 `CAD` | 文件名、检索、读取、BOM 引用、连接、诊断 | 隐藏 Code 分组，保留已打开 Block 的状态 |
| `Code` + `CAD` | 两组工具同时显示，以可随宽度换行的竖向模块标识分隔 | 不自动打开 Block |

CAD Ribbon 完全由 `kt-auto-cad/package.json` 的 `ktAutoCodeModule.tools` 数据定义生成。每项声明命令、短标题、图标和能力要求；基础插件只验证并渲染数据，不复制 CAD 业务逻辑。点击具体工具后，只有需要结果界面的命令才按需打开 CAD 详情 View。

建议上下文键：

```text
ktAutoCode.module.active == code | cad
ktAutoCode.module.cad.installed
```

基础插件持久化模块可见性和当前 Block；CAD 详情 View 的 manifest 使用 `when` 读取上述上下文。CAD 未安装时 Header 不显示 CAD 复选，安装后恢复最近的模块可见性。

优先共享以下内容：

- Wing CSS token、图标和可序列化 ViewModel。
- 任务状态、进度、日志、Preview/Apply 基础契约。
- 本仓库内 Webview CSP、资源 URI、消息信封和 Output Channel 辅助代码。

不直接共享：

- Desk Tools 页面路由、Pinia 产品状态、`fetch('/api/...')` 调用。
- Tauri 窗口生命周期和 Node/Hono 路由。
- 绑定具体产品布局的 Vue 页面。

只有当一个 UI 单元已经被两个产品实际使用并保持相同交互时，才迁入 Wing 的 `ui-vue` 或无框架 UI 包。

## 7. 测试矩阵

| 层级 | 本仓库验证 |
| --- | --- |
| contracts | 非法/未知字段、协议版本、向前兼容读取 |
| native adapter | 路径、超时、退出码、stderr、取消、平台选择 |
| core parity | 与 Wing/Desk Tools 共用 FCStd、XLink、数据库 fixture |
| Extension Host | 工作区信任、无工作区、远程工作区、多根工作区、文件冲突 |
| Webview | CSP、主题、消息校验、只读/写回状态门禁 |
| packaging | npm tarball → Cargo 编译 → VSIX 内容 → 安装冒烟 |

C0 已覆盖 Desk Tools provider manifest 解析、安装目录候选、平台路径、路径越界、哈希篡改和协议 major/capability 校验。取消、业务 CLI 退出码和工作区文件行为在 C1 接入真实 read/scan 调用时补齐。

## 8. 提交拆分

本仓库按可独立验证的中文提交推进：

1. `docs(auto-cad): 制定同仓双插件实施计划`
2. `build(workspace): 建立双插件工作区与兼容命令`
3. `feat(auto-cad): 建立独立 VS Code 插件骨架`
4. `feat(auto-cad): 接入 Desk Tools native provider 与协议校验`
5. `feat(auto-cad): 实现 FCStd 只读扫描`

任何一步失败都应能回退单个提交；不得将 Rust 迁移、数据库迁移、写盘 UI 和产品发布合并成一个提交。
