# Phoenix 三形态产品架构计划

> 目标：用 Wing 的同一套 Code/CAD 核心，为用户提供 VS Code、Tauri、Web 三种形态。跨语言多包、Rust 源码与数据库契约的权威总计划位于 `phoenix-wing/doc/跨语言多包架构与三库迁移计划.md`；本文只描述产品组合。`kt-auto-cad` 的具体实施见 [KT Auto CAD 同仓实施计划](KT%20Auto%20CAD同仓实施计划.md)。

## 1. 已确认结论

1. 只维护三个 Git 仓库：`phoenix-wing`、`kt-auto-code`、`phoenix-desk-tools`。
2. 不新建 `phoenix-cad` 仓库；CAD 插件正式命名为 `kt-auto-cad`。
3. `kt-auto-code` Git 仓库产出两个 VSIX：`kt-auto-code` 是基础插件，`kt-auto-cad` 声明对它的扩展依赖。
4. Wing 是跨语言、多 npm 子包的共享核心与 UI 底座，同时发布 CAD Rust 源码。
5. Desk Tools 是 Tauri/Web 聚合产品，只保留产品宿主、复杂 UI 和外部软件桥接。
6. Rust 在产品构建阶段编译并随 VSIX/Tauri 产物发布；最终用户不安装 Cargo，也不在插件激活时编译。

## 2. 三库与产品关系

```text
phoenix-wing（跨语言共享真源）
  ├── @phoenix-wing/core
  ├── @phoenix-wing/code-core
  ├── @phoenix-wing/cad-contracts
  ├── @phoenix-wing/cad-core
  ├── @phoenix-wing/workspace-schema + db-node
  ├── @phoenix-wing/ui-vue
  └── @phoenix-wing/cad-rust-source
             │
        ┌────┴─────────────────────┐
        ▼                          ▼
kt-auto-code Git              phoenix-desk-tools Git
  ├── kt-auto-code VSIX         ├── Tauri desktop
  └── kt-auto-cad VSIX          └── Web + Node/Hono
```

`kt-auto-code` 与 `kt-auto-cad` 是两个安装产品，不是两个 Git 仓库。Code 可以单独安装；CAD 必须在 Code 基础插件之上安装，并共享它注册的唯一 Activity Bar/Primary Side Bar container。

## 3. 产品矩阵

| 产品 | 主要能力 | 本地文件 | 共享核心 |
| --- | --- | --- | --- |
| `kt-auto-code` | CAA/C++、编码、Ignore、Code Rename、成员排序 | VS Code 工作区/授权目录 | Wing Code core |
| `kt-auto-cad` | FCStd、BOM、引用图、XLink、受控写回；依赖 Code 壳层 | VS Code 工作区 | Wing CAD core + Rust |
| Desk Tools Tauri | Code/CAD/CAA 综合工作台、复杂编辑、外部软件 | Tauri/Node adapter | Wing Code/CAD/UI/Rust |
| Desk Tools Web | 远程/服务端工作区和浏览器 UI | Server API | Wing contracts/core/UI |

由于 CAD 已通过 `extensionDependencies` 声明基础插件依赖，首期不再增加 Extension Pack。

## 4. 领域边界

### 4.1 Code

Code core 负责：

- 编码检测与文本边界；
- Ignore/扫描范围的纯规则；
- C++ 成员排序、UUID 和 Code Rename 计划；
- 可序列化诊断、TextEdit 和 Preview/Apply 结果。

它不依赖 VS Code、Tauri、Vue、Node `fs` 或 CAD 语义。

### 4.2 CAD

CAD core/Rust 负责：

- `.FCStd` ZIP/XML 和 `Document.xml` 解析；
- BOM 属性、装配关系和引用图；
- XLink/Label 扫描、诊断和受控 patch；
- CAD 改名影响分析和不可变写回计划；
- 版本化的 CAD 数据与数据库查询契约。

它不选择工作区、不弹确认框、不管理 HTTP/Tauri/VS Code 生命周期。

### 4.3 Code Rename 与 CAD Rename 不合并

| 能力 | 输入语义 | 写盘对象 |
| --- | --- | --- |
| Code Rename | 普通文本、路径 basename、关联替换规则 | 源码目录、文件和文本 |
| CAD Rename | FCStd 文件关系、XLink、引用图和 Label | FCStd 内部 XML、引用字段和审计记录 |

两者可以共享任务、预览、确认、指纹和日志契约，但不能共用领域扫描结果或 apply 实现。

## 5. Host adapter

Wing core 只面向抽象端口：

```typescript
interface PnwFileSystemPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

interface PnwTaskReporter {
  progress(event: PnwTaskProgress): void;
  throwIfCancelled(): void;
}
```

| 端口 | VS Code | Tauri/Web |
| --- | --- | --- |
| 工作区/文件 | `workspace.fs`、Node adapter | Node/Tauri command、Server workspace |
| 设置 | VS Code configuration/state | SQLite/配置文件/Server prefs |
| 确认 | VS Code modal/Webview | Wing Vue dialog/产品页面 |
| native tool | VSIX 内置 binary | Tauri resources/Node sidecar |
| 日志 | Output Channel/结果 View | 产品日志面板和文件 |

Web 模式不假设任意本地路径可访问；浏览器目录授权只能作为 capability，不作为核心前提。

## 6. VS Code 双插件

### 6.1 KT Auto Code

继续承载源码和 CAA 开发工作流。Side Bar 放入口、范围、状态和摘要；大结果、diff 和选择进入编辑区 View。

### 6.2 KT Auto CAD

按风险从低到高开放：

1. FCStd 只读扫描和诊断；
2. BOM、入向/出向引用和 XLink 报告；
3. 工作区数据库索引；
4. 用户确认后的 XLink/Label/BOM 写回；
5. 需要 FreeCADCmd/SolidWorks/复杂画布的流程交接 Desk Tools。

扩展 ID 建议固定为 `kuntai.kt-auto-cad`，显示名 `KT Auto CAD`。

CAD manifest 不注册新的 `viewsContainers.activitybar`；它只向基础插件已有的 `kt-auto-code` custom View Container 贡献 Views。因此同时安装两个扩展后，Activity Bar 仍只有当前一个图标。

基础插件在原生 View Header 中提供 `Code`/`CAD` 两个排他切换按钮，位于搜索、工作集、布局和设置按钮之后。共享 Ribbon 只渲染当前模块在 manifest 中声明的工具；切换模块仅替换 Ribbon 内容，不新开工具块，复杂详情仍按需使用 `activeModule` 保持一次只显示一个模块。

CAD 的依赖按能力拆分，而不是把整个模块绑定到 Desk Tools：文件名语义、工作区 FCStd 检索和基础 View 直接可用；已有工作区数据库的查询入口标记为数据库能力；只有解析 FCStd 内容或调用外部原生工具时才要求 native provider。CAD manifest 不声明 Desk Tools 扩展安装依赖。

### 6.3 同仓共享

仅将已经出现真实双端重复的代码放入本仓库内部 `vscode-host-core`，例如：

- Webview CSP、资源 URI 和消息信封；
- Output Channel、任务广播和协议错误展示；
- native tool 路径选择和版本检查的通用部分。

Code/CAD 领域实现仍分别来自 Wing 子包，内部壳层包不得反向依赖领域 core。

## 7. UI 策略

不把 Wing 全面改写成原生 HTML，也不把 Vue 作为所有宿主的强制依赖：

- VS Code 现有原生 HTML/CSS/JS Webview 可以继续使用；
- Desk Tools 复杂画布、表格和工作台继续使用 Vue/Pinia/Element Plus；
- 跨端优先共享 CSS token、图标、ViewModel、任务和 Preview/Apply 契约；
- 只有已经被两个产品实际消费且交互一致的小组件，才进入 Wing `ui-vue` 或后续无框架 UI 包。

## 8. Rust 与发布

Wing npm 的专用包携带 Rust 源码、Cargo manifest/lock、契约和许可证。产品构建显式编译：

```text
Wing npm tarball
       │ cargo build --release --locked
       ├── kt-auto-cad/<platform>.vsix 内置 binary
       └── Desk Tools Tauri resources 内置 binary
```

规则：

- 不使用 npm `postinstall` 编译；
- `CARGO_TARGET_DIR` 位于消费仓库构建缓存；
- 发布从 npm tarball 做干净构建，不能只验证相邻仓库 link；
- native CLI 提供协议版本和能力清单；
- 协议主版本不兼容时阻止写盘。

## 9. 数据库

Wing 持有 CAD DDL、Schema 版本、迁移规则和查询契约；产品持有连接、文件路径、权限和生命周期。

| 内容 | Wing | 产品宿主 |
| --- | --- | --- |
| 表/索引 DDL | 是 | 消费 |
| Schema 版本/兼容矩阵 | 是 | 执行检查 |
| 查询 DTO/fixture | 是 | 实现 adapter |
| `.phoenix` 路径 | 否 | 是 |
| WAL/权限/重建确认 | 否 | 是 |
| HTTP/VS Code API | 否 | 是 |

遇到未知数据库主版本时，两个宿主都必须只读或阻止操作，不能各自猜测迁移。

## 10. 分阶段路线

### Phase 0：计划与基线

- [x] 确认三 Git 仓库和 Wing 跨语言定位。
- [x] 确认同仓双 VSIX 与 `kt-auto-cad` 名称。
- [x] 确认多 npm 子包和 Rust source 发布方式。
- [ ] 冻结跨端 fixture、协议输出和数据库 Schema 哈希。

### Phase 1：Wing 多包与契约

- [ ] 建立兼容的 pnpm workspace，不中断现有 `phoenix-wing` 消费。
- [ ] 建立 `cad-contracts`、`cad-core` 和 `cad-rust-source`。
- [ ] 保持 Code core 与旧聚合包兼容入口。

### Phase 2：迁移 Rust 与 Desk Tools 切换

- [ ] 先迁 `fcstd-reader`、`fcstd-xlink` 和 CLI。
- [ ] Desk Tools 从 Wing npm source 编译并完成 Tauri/安装包 smoke。
- [x] `fcstd-query` 已迁 Wing；其只读 SQL/DTO 又下沉为无驱动查询核心，VS Code 直接接 Extension Host 内置 SQLite，不再依赖 Desk provider。

### Phase 3：KT Auto CAD 只读版本

- [ ] 建立第二个 VSIX 骨架和平台构建。
- [ ] 实现 FCStd 只读扫描、BOM 和引用诊断。
- [ ] 与 Desk Tools 运行同一 fixture。

### Phase 4：数据库与受控写回

- [ ] 两个宿主消费 Wing 数据库契约。
- [ ] 插件开放索引、XLink/Label/BOM Preview/Apply。
- [ ] 完成指纹冲突、取消、失败恢复和审计报告。

### Phase 5：UI 和发布收敛

- [ ] 根据真实重复提取共享 UI/token/图标。
- [ ] 建立 npm、VSIX、Tauri/Web 的兼容矩阵和自动冒烟。
- [ ] 清除产品仓库重复算法与过期 facade。

## 11. 验收标准

1. 不存在第四个共享 Git 仓库。
2. `kt-auto-code` 可独立安装；`kt-auto-cad` 正确声明依赖，安装后不新增 Activity Bar 图标，卸载后基础插件继续正常运行。
3. 任一 core 消费者不会被迫安装 Vue、Element Plus 或预编译 Rust 二进制。
4. Wing Rust source 从 npm tarball 可锁定编译；最终用户无需 Rust。
5. Desk Tools 与 `kt-auto-cad` 对相同 FCStd/XLink/数据库 fixture 输出一致。
6. 所有写盘先预览确认，并检查文件指纹和协议/Schema 版本。
7. VSIX、Tauri 和 Web 均不依赖相邻开发仓库才能运行。
