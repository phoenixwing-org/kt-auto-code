# Phoenix 三形态产品架构计划

> 目标：用同一套 Code / CAD 领域能力，为用户提供 **VS Code 插件、Tauri 桌面应用、Web 应用**三种使用形态。
> 本文是产品与技术总纲；具体插件界面见[VS Code 插件规划](./vscode插件规划.md)和[Side Bar 界面改进计划](./侧边栏界面改进计划.md)。

## 1. 总体结论

Phoenix 不应做成一个包含全部能力的巨型插件，也不应在 VS Code、Tauri、Web 中复制三套算法。推荐按领域拆分核心、按宿主提供适配器、按产品组合模块：

```text
领域核心
  ├── phoenix-code-core
  └── phoenix-cad-core
          ↓
共享契约与 UI
  ├── phoenix-app-contracts
  └── phoenix-wing
          ↓
三种宿主产品
  ├── VS Code：kt-auto-code + phoenix-cad
  ├── Tauri：phoenix-desk-tools desktop
  └── Web：phoenix-desk-tools web
```

VS Code 侧建议维持两个插件：

- `kt-auto-code`：源码、CAA / C++、编码、Ignore、工作区搜索替换。
- `phoenix-cad`：FreeCAD / FCStd、XLink、CAD 文件改名引用分析、BOM 等。

另提供 `Phoenix Tools Extension Pack`，让需要全套能力的用户一键安装两个插件。

## 2. 产品矩阵

| 产品 | 主要用户 | 能力范围 | 是否直接访问本地文件 |
| --- | --- | --- | --- |
| `kt-auto-code` VS Code 插件 | CAA / C++ 开发者 | 编码治理、源码扫描、Ignore、工作区搜索替换 | 是，当前 VS Code 工作目录 |
| `phoenix-cad` VS Code 插件 | FreeCAD / CAD 开发者 | FCStd、引用分析、XLink、CAD 改名修正、BOM | 是，当前 VS Code 工作目录 |
| `phoenix-desk-tools` Tauri | 综合桌面用户 | 同时组合 Code 与 CAD，全功能工作台 | 是，通过 Tauri 文件系统 |
| `phoenix-desk-tools` Web | 浏览器/服务端用户 | Code 与 CAD 的远程或受限工作流 | 通常否，通过 Server API |
| `Phoenix Tools Extension Pack` | VS Code 全量用户 | 安装和发现两个领域插件 | 不承载业务逻辑 |

产品边界原则：

1. Code 与 CAD 可以共享壳层、设置契约和任务系统，但不共享领域算法与写盘逻辑。
2. 单独安装任一 VS Code 插件时都应完整可用，不强制依赖另一个插件。
3. Desk Tools 是聚合产品，不成为领域算法的唯一实现位置。
4. Web 模式不假设能任意访问用户本地目录。

## 3. 领域拆分

### 3.1 `phoenix-code-core`

负责源码与工程文本领域：

- 头文件 ASCII / 编码问题扫描与修正。
- 整文件编码检测与转码。
- `.phoenix/.ignore` 规则解析和匹配。
- 源码目录、文件、文本批量改名。
- 二进制识别、文本编码、换行和 BOM 保留。
- 扫描范围、预览结果、写盘报告。

不负责：

- VS Code View、Tauri command、HTTP API。
- Vue、Pinia、Element Plus。
- FCStd 和 XLink 语义。

### 3.2 `phoenix-cad-core`

负责 CAD / FreeCAD 领域：

- `.FCStd` 容器与 `Document.xml` 读取。
- 文件改名后的引用影响分析。
- XLink、外部路径和跨文件引用修正。
- CAD 改名日志、修正计划和报告。
- BOM、装配关系及后续 CAD 工具。

不负责：

- 通用源码文本替换。
- VS Code 或 Tauri 的界面生命周期。
- 用户设置的具体存储位置。

### 3.3 不合并两套 Rename

两套 Rename 保持独立：

| 模块 | 输入 | 核心语义 | 写盘对象 |
| --- | --- | --- | --- |
| Code Rename | 旧名、新名、目录/文件/文本级别 | 精确文本命中和路径 basename 改名 | 普通目录、文件和文本 |
| CAD Rename References | FCStd 改名记录、新旧路径 | CAD 文档关系、XLink 和引用图 | FCStd 内部 XML、引用字段、报告 |

可共享预览/确认流程、任务状态、Ignore、日志和结果容器，但不能共用扫描结果类型或 apply 实现。

## 4. 共享包职责

### 4.1 `phoenix-wing`

定位为 Vue 3 UI 与应用壳层，不继续承载 Code/CAD 领域算法：

- Side Bar 紧凑组件与属性 Schema。
- Workbench、Tab、Page Header、日志面板。
- 对话框、进度浮层、布局和表格交互。
- Vue composable、Pinia View Store、主题适配。
- 与领域无关的纯 UI 工具函数。

包入口应逐步拆分为稳定边界：

```text
phoenix-wing/core      # 零 Vue/DOM 的通用小工具
phoenix-wing/vue       # Vue composable 与 Store
phoenix-wing/components
phoenix-wing/layout
phoenix-wing/db        # 可选 Node 数据库适配
```

### 4.2 `phoenix-app-contracts`

负责跨领域、跨宿主的可序列化契约：

- `TaskState`、进度、取消和日志事件。
- `FeatureManifest`、Action、Property Schema DTO。
- Preview / Apply 结果基础类型。
- 设置 Schema、默认值、版本和迁移。
- Host ↔ View 消息信封、错误码和能力声明。

该包不得依赖 Vue、VS Code、Tauri、Node 文件系统或浏览器 DOM。

### 4.3 是否单独建包

初期可先在现有仓库中建立清晰目录和接口，稳定后再发布 npm 包；但依赖方向从第一天起按独立包约束，避免以后难以拆出。

## 5. 宿主适配架构

领域核心只依赖端口，不直接调用宿主 API：

```typescript
interface FileSystemPort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  walk(root: string, options: WalkOptions): AsyncIterable<FileEntry>;
}

interface WorkspaceContext {
  root: string;
  displayName: string;
  capabilities: HostCapabilities;
}

interface SettingsStore {
  get<T>(key: string, fallback: T): Promise<T>;
  update<T>(key: string, value: T): Promise<void>;
}

interface IgnoreRuleProvider {
  getSnapshot(root: string): Promise<IgnoreSnapshot>;
}

interface TaskReporter {
  progress(event: TaskProgressEvent): void;
  throwIfCancelled(): void;
}
```

宿主分别实现这些端口：

| 端口 | VS Code | Tauri | Web |
| --- | --- | --- | --- |
| 文件系统 | `workspace.fs` / Node FS | Tauri FS command | Server API 或 File System Access API |
| 工作目录 | `workspaceFolders[0]` | 用户打开的项目 | 服务端项目 / 浏览器授权目录 |
| 设置 | VS Code configuration/state | 配置文件或数据库 | Server prefs / localStorage |
| 确认 | VS Code modal | Tauri/Vue dialog | Web dialog |
| 任务 | Extension Host Store | Tauri task manager | Server task / Web stream |
| 日志 | Output Channel | 本地日志面板/文件 | Web 日志面板/服务端日志 |

## 6. VS Code 产品架构

### 6.1 `kt-auto-code`

首期 Feature：

- 头文件编码修正。
- 文件转码。
- Ignore 设置。
- Code 批量改名（后续接入）。

Side Bar 只放紧凑入口、属性、结果摘要和任务；批量改名等复杂功能进入右侧 `WebviewPanel`。

### 6.2 `phoenix-cad`

建议 Feature：

- CAD 工程概览。
- FCStd 改名引用分析。
- XLink 检查与修正。
- BOM / 装配关系浏览。
- CAD 报告与历史任务。

Side Bar 可根据当前工作区是否存在 `.FCStd` 动态提示能力，但不要把插件注册逻辑绑定到 `kt-auto-code`。

### 6.3 VS Code 共享壳

两个插件可以复用一个 `phoenix-vscode-shell` 内部包：

- 原生多 View Container 注册辅助。
- Vue Webview CSP、资源 URI 和消息桥。
- Workbench Panel 生命周期。
- Task Store、Output Channel、状态广播。
- 设置适配、主题变量和错误展示。

该包不能直接引用 Code/CAD core，具体 Feature 由插件注入。

### 6.4 Extension Pack

单独发布轻量 Extension Pack：

```text
Phoenix Tools
  ├── recommends kt-auto-code
  └── recommends phoenix-cad
```

Extension Pack 只负责安装入口和品牌说明，不注册命令、不访问工作区、不包含 Webview。

## 7. Desk Tools 架构

### 7.1 Tauri 模式

Tauri 版组合 `phoenix-code-core` 与 `phoenix-cad-core`：

- Vue UI 使用 `phoenix-wing`。
- Rust/Tauri 层提供文件系统、进程、系统对话框和安全边界。
- TypeScript core 可直接运行的逻辑留在前端/共享 worker。
- 需要 Python/FreeCAD 的能力通过 sidecar 或服务接口隔离，不污染所有模块启动。

### 7.2 Web 模式

Web 版复用同一 Vue 页面和 contracts，但文件与任务通常通过服务端：

- 浏览器不默认拥有本地目录权限。
- 大文件、FCStd、长扫描放到服务端任务。
- 使用 SSE/WebSocket/轮询把 `TaskProgressEvent` 映射到统一任务 UI。
- 若采用 File System Access API，必须作为可选 capability，不成为唯一实现。

### 7.3 页面复用

页面分为两层：

```text
Feature View（可复用）
  - 属性、结果、预览、任务 UI

Host Shell（各自实现）
  - VS Code Side Bar / WebviewPanel
  - Tauri 主窗口
  - Web 路由与应用壳
```

Feature View 只依赖 contracts 和注入的 Host Client，不能直接调用 Tauri、VS Code 或 `fetch('/api/...')`。

## 8. 通用设置体系

设置采用“共享定义、宿主存储”：

```typescript
interface SettingDefinition<T> {
  key: string;
  version: number;
  defaultValue: T;
  validate(value: unknown): T;
  scope: "user" | "workspace";
}
```

适合共享定义的设置：

- Ignore 规则与预设。
- 扫描扩展名和跳过目录。
- 默认目标编码。
- Code Rename 级别与写回策略。
- CAD 扫描范围和报告选项。
- 任务并发、日志详细度和结果上限。

宿主存储：

| 宿主 | 存储方式 |
| --- | --- |
| VS Code | `workspace.getConfiguration`、workspace/global state |
| Tauri | 本地配置文件或 SQLite |
| Web | 服务端用户/项目设置，少量 View 状态用 localStorage |
| CLI | 参数 + 工作区配置文件 |

不得把 Pinia/localStorage 当作领域设置的唯一来源。

## 9. 本地开发与发布

### 9.1 本地联调

同级仓库开发时使用 pnpm workspace 临时链接：

```yaml
packages:
  - "."
  - "extension"
  - "../phoenix-wing"
  - "../phoenix-code-core"
  - "../phoenix-cad-core"
```

这只解决开发依赖链接。VS Code 插件运行时操作的项目仍由 `workspaceFolders[0]` 决定，两者不能混淆。

### 9.2 发布验证

每个共享包必须同时验证：

1. 同级 workspace 源码联调。
2. 打包后的 npm tarball 消费。
3. 干净安装构建。
4. VSIX、Tauri、Web 三个消费端至少各一个冒烟测试。

不要只验证 workspace symlink；发布包必须包含稳定 JS、`.d.ts` 和正确 exports。

### 9.3 版本兼容

- contracts 使用语义化版本。
- Host 与 core 启动时交换 capability/version。
- 设置 Schema 提供版本和迁移函数。
- UI 对未知字段向前兼容，写盘操作对不兼容版本直接阻止。

## 10. 依赖方向

允许：

```text
apps/plugins → host adapters → contracts → domain cores
apps/plugins → phoenix-wing
feature views → contracts + phoenix-wing
```

禁止：

```text
domain core → vscode / tauri / vue / pinia / element-plus
phoenix-wing → code-core / cad-core
code-core ↔ cad-core
feature view → Node fs / vscode / Tauri API
Web implementation → 假定本地路径可直接访问
```

Code/CAD 之间若需协作，由上层应用编排，不建立相互依赖。例如 CAD 引用分析需要普通文本搜索时，由 Host 同时调用两个 core 并合并结果。

## 11. 分阶段路线图

### Phase 0：契约与现状冻结

- [ ] 记录 kt-auto-code、desk-tools Code Rename、CAD Rename Analysis 当前行为。
- [ ] 定义 Host ports、Task contracts、Settings schema 和 Preview/Apply 基础结果。
- [ ] 建立跨产品测试夹具。

### Phase 1：Code Core

- [ ] 将 kt-auto-code 编码、Ignore、扫描逻辑整理为 `phoenix-code-core` 边界。
- [ ] 将 desk-tools 成熟的 Python Code Rename 行为移植为 TypeScript，并移植测试。
- [ ] KT Auto Code 先接入 Code Rename 预览，再开放写盘。
- [ ] Desk Tools 通过 adapter 切换到同一 core，保留回退开关直到结果一致。

### Phase 2：VS Code Code 插件完善

- [ ] 完成 kt-auto-code 原生多 Block Side Bar。
- [ ] 完成 Code Rename 右侧 Workbench。
- [ ] 完成 SVG、任务、Ignore 联动和 VSIX 验证。

### Phase 3：CAD Core 审计与拆分

- [ ] 列出 FCStd/XLink 分析对 Python、FreeCAD、数据库和服务端的依赖。
- [ ] 提取可纯 TypeScript 实现的 FCStd/引用模型。
- [ ] 为不可移植能力定义 sidecar/server port。
- [ ] 用 desk-tools 现有测试和真实样例验证一致性。

### Phase 4：`phoenix-cad` VS Code 插件

- [ ] 建立独立扩展 ID、Activity Bar 和 Feature 注册表。
- [ ] 接入 CAD Rename References 预览和报告。
- [ ] 确认安全策略后开放 XLink/FCStd 写盘修正。
- [ ] 发布 Phoenix Tools Extension Pack。

### Phase 5：Desk Tools Tauri

- [ ] Tauri Host 实现统一 ports。
- [ ] Code/CAD 页面改用 contracts + Host Client。
- [ ] Python/FreeCAD 能力改为可选 sidecar。
- [ ] 完成安装包、升级和离线能力验证。

### Phase 6：Desk Tools Web

- [ ] Server 实现同一 Host contracts。
- [ ] 长任务支持取消、恢复和进度流。
- [ ] 明确本地目录授权与服务端项目两种 capability。
- [ ] 完成权限、上传、隔离和并发验证。

### Phase 7：统一发布与维护

- [ ] 建立共享版本矩阵和兼容测试。
- [ ] 自动生成 VSIX、Tauri 安装包、Web 镜像和 npm 包。
- [ ] 建立三种形态的冒烟测试与体积报告。
- [ ] 文档按“领域能力”编写，分别注明各宿主差异。

## 12. 决策检查点

在进入对应阶段前必须确认：

1. Code Rename 是否完整支持目录、文件、文本三级，还是先只开放文本。
2. CAD Core 哪些功能能脱离 FreeCAD/Python，哪些必须 sidecar。
3. Web 模式采用服务端工作区、上传包还是 File System Access API。
4. 共享包采用单仓库 monorepo 还是继续同级多仓库。
5. VS Code 两插件是否共享发布者、品牌图标、设置命名前缀和遥测政策。

默认建议：Code Rename 先完整预览、分阶段开放写盘；CAD 写盘晚于只读分析；共享包先保持同级仓库，通过 pnpm workspace 联调，API 稳定后再决定是否合并 monorepo。

### 12.1 品牌与共享图标决策

- VS Code 可见名称固定为 **KT Auto Code**，中文说明使用“KT 自动代码工具”；包名 `kt-auto-code`，命令和设置前缀 `ktAutoCode`，扩展 ID 为 `kt.kt-auto-code`。
- VS Code、Tauri 和 Web 共用的品牌/通用工具 SVG 最终以 `phoenix-wing` 的稳定 assets 子入口为单一来源；领域专用图标仍归 Code/CAD 模块管理。
- 共享 SVG 使用统一 `20 × 20`/`24 × 24` viewBox、`currentColor`、无渐变和无宿主 CSS 依赖；各宿主只做颜色与尺寸适配。
- 在 `phoenix-wing` 发布稳定 assets exports 前，`kt-auto-code/extension/media` 保留可发布副本，不在运行时跨仓库读取文件。

## 13. 最终验收标准

1. 同一 Code/CAD 核心测试可被 VS Code、Tauri、Web 三种宿主复用。
2. `kt-auto-code` 不包含 CAD 领域依赖，`phoenix-cad` 不包含源码编码实现。
3. Desk Tools 同时组合两个领域模块，但不维护第四套算法。
4. 所有写盘操作均有预览、确认、取消、日志和可审查结果。
5. 三种宿主使用同一设置定义，存储实现可以不同。
6. Web 不依赖未授权的本地文件访问；Tauri/VS Code 不强制启动 Web 服务。
7. 本地 workspace 和发布包均通过消费测试。
8. 用户可以单独安装 Code、单独安装 CAD，或通过 Extension Pack 安装全套。
