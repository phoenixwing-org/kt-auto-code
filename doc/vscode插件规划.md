# VS Code 插件规划 — KT Auto Code

> 仓库：`kt-auto-code`  
> 定位：**一套面向 CAA / MSVC C++ 工作流的小工具集合**，统一入口在 Activity Bar + Primary Side Bar。  
> 当前工具：**头文件 ASCII 修正、文件转码、Ignore 设置、工作区搜索替换**。
> 核心逻辑复用现有 `src/sourceEncodingScan.ts`、`src/sourceEncodingWalk.ts`。

---

## 1. 产品定位


| 项                | 说明                                                            |
| ---------------- | ------------------------------------------------------------- |
| **Display Name** | KT Auto Code                                                  |
| **Extension ID** | `kuntai.kt-auto-code`                                             |
| **宿主**           | VS Code ≥ 1.85；Cursor 同 API，F5 调试方式一致                         |
| **首期用户**         | CAA / MSVC + CP936 环境下的 C++ 开发者                               |
| **形态**           | 一个 Activity Bar 品牌入口 + Side Bar 内四个小工具 + 右侧复杂 Workbench |


### 1.1 为什么要做「头文件 ASCII 修正」

CAA / 达索生态下的 C++ 工程有明确的编码约束：


| 约束               | 说明                                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| **不宜 UTF-8 头文件** | 团队规范与历史工具链通常要求头文件**不以 UTF-8 保存**；MSVC 在未开 `/utf-8` 时按系统代码页解释源文件。              |
| **本机代码页可以**      | 在中文 Windows（CP936 / GBK）下，注释里的中文双字节**语法上合法**，但**仍不建议写在头文件**。                                      |
| **跨国协作会出问题**     | 某国开发者用本国代码页写的多字节注释，传到另一国（不同代码页）后，字节含义变化 → **C4819**、乱码、或静默语义错误。               |
| **最佳实践**         | **头文件仅含 ASCII**——标识符、字符串字面量、注释均不用多字节；中文说明放 `.cpp`、文档或 NLS，而不是 `.h`。 |


因此本工具的目标不是「把整个工程转成 UTF-8」，而是：

1. **扫描**：找出头文件中的 **Windows-1252 弯引号**（`0x93`/`0x94` 等）等非法字节，以及 **GBK 中文**等合法多字节内容。
2. **修正**：弯引号等映射为 ASCII 标点；**GBK 中文替换为空格**，使头文件保持纯 ASCII。
3. **目标**：消除 MSVC **C4819** 告警，并符合跨国协作对头文件编码的约束。

与 CLI `pnpm fix-headers` 行为一致；UI 在 Side Bar 中操作。

### 1.2 工具路线图（小工具集合）


| 阶段     | 工具 ID         | 显示名          | 说明                                                |
| ------ | ------------- | ------------ | ------------------------------------------------- |
| **首期** | `headerAscii` | 头文件 ASCII 修正 | 扫描 / 修复 `.h` 等头文件中的问题字节（本文详述） |
| **规划** | `encodingFix` | **编码修正** | 整文件编码检测；GBK→UTF-8 等；见 [编码修正.md](./编码修正.md) |
| **已实现** | `ignoreSettings` | **Ignore 设置** | 打开、同步并共享 `.phoenix/.ignore` |
| **已实现** | `codeRename` | **搜索替换** | Side Bar 配置搜索/替换与范围，右侧主视图展示文本/文件名/文件夹名预览 |
| 待定     | `sourceAscii` | 源文件 ASCII 修正 | 扩展到头文件 + `.cpp` 等（复用同一 core，`headersOnly: false`） |
| 待定     | `…`           | …            | 其它 CAA 小工具（命名规范、模板生成等）各自独立模块                      |


**设计原则**：每个小工具 = 独立目录 + 独立命令前缀 + Side Bar 内一块 UI；**共用** Activity Bar 图标、工作区解析、Output 通道、Webview 壳。

---



## 2. 多工具架构（基础，首期就要铺好）



### 2.1 扩展点：`KtTool` 注册表

所有小工具实现同一接口，在 `activate` 时注册，避免后续每加一个工具就改一遍 `extension.ts`。

```typescript
/** extension/src/tools/types.ts */
export interface KtTool {
  /** 稳定 ID，用于命令与消息，如 headerAscii */
  readonly id: string;
  /** Side Bar 选项卡 / 列表中的短标题 */
  readonly title: string;
  /** 一两句话说明用途（显示在面板顶部） */
  readonly description: string;
  /** 可选：工具专属 codicon 或 media 下图标路径 */
  readonly icon?: string;
  /** 注册 VS Code 命令（scan / fix / …） */
  registerCommands(context: vscode.ExtensionContext): void;
  /** 向 Webview 提供该工具的 HTML 片段或状态模型 */
  getPanelModel(): ToolPanelModel;
  /** 处理来自 Webview 的消息：{ toolId, action, payload } */
  handleMessage(message: ToolMessage): Promise<void>;
}
```

```typescript
/** extension/src/tools/registry.ts */
const tools: KtTool[] = [];

export function registerTool(tool: KtTool): void {
  tools.push(tool);
}

export function getTools(): readonly KtTool[] {
  return tools;
}

export function getTool(id: string): KtTool | undefined {
  return tools.find((t) => t.id === id);
}
```

```typescript
/** extension/src/extension.ts（概念） */
import { registerTool } from "./tools/registry.js";
import { headerAsciiTool } from "./tools/headerAscii/index.js";

export function activate(context: vscode.ExtensionContext) {
  registerTool(headerAsciiTool);
  // registerTool(sourceAsciiTool);  // 后续一行接入

  for (const tool of getTools()) {
    tool.registerCommands(context);
  }
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("ktAutoCode.tools", toolsViewProvider),
    vscode.window.registerWebviewViewProvider("ktAutoCode.properties", propertiesViewProvider),
    vscode.window.registerTreeDataProvider("ktAutoCode-results", resultsTreeProvider),
    vscode.window.registerTreeDataProvider("ktAutoCode.tasks", tasksTreeProvider),
  );
}
```



### 2.2 命令命名约定

统一前缀，便于命令面板搜索与 `package.json` 维护：

```text
ktAutoCode.{toolId}.{action}

示例：
  ktAutoCode.headerAscii.scan
  ktAutoCode.headerAscii.fix
  ktAutoCode.sourceAscii.scan   # 未来
```

`package.json` 的 `commands` / `menus` 可由构建脚本从 `tools/*/manifest.json` 合并生成（Phase 2），首期手写 `headerAscii` 两条即可。

### 2.3 Side Bar UI：原生可伸缩 Blocks

Side Bar 采用 VS Code 原生的“同一 View Container 下多个 View”结构，效果参考内置源代码管理：多个块纵向排列，用户可独立折叠、展开、调整高度和重新排序。不要在单个 Webview 内用 CSS 模拟整套手风琴。

三个首期 Feature、SVG 图标、共享 Ignore Service 和 MVC 迁移步骤详见[Side Bar 界面改进计划](./侧边栏界面改进计划.md)。

```text
┌─ KT Auto Code ─────────────────────────────┐
│ ▼ 工具                         [刷新] […]  │  ← Vue WebviewView
│   [头文件 ASCII] [编码修正]                │
│   [预检] [修复/转换] [打开工作台]           │
├────────────────────────────────────────────┤
│ ▼ 属性                                  […]│  ← 紧凑 Vue WebviewView
│   范围、保留 GBK、去 BOM、显示详细          │
├────────────────────────────────────────────┤
│ ▼ 结果                              12  […]│  ← 原生 TreeView
│   MultiCharSample.h                 ×2     │
│   Other.h                           ×1     │
├────────────────────────────────────────────┤
│ ▶ 任务与日志                         1  […]│  ← 原生 TreeView；按需展开
└────────────────────────────────────────────┘
```

初始 View 划分：

| View ID | 标题 | 实现 | 职责 |
| --- | --- | --- | --- |
| `ktAutoCode.tools` | 工具 | Vue `WebviewView` | 第一块；工具 Tab、主要按钮、状态摘要、打开右侧工作台 |
| `ktAutoCode.properties` | 属性 | Vue `WebviewView` | 当前工具的紧凑属性、范围和选项 |
| `ktAutoCode-results` | 结果容器 | 原生 `TreeView` | 文件/问题层级、数量 badge、点击定位、查看全部 |
| `ktAutoCode.tasks` | 任务与日志 | 原生 `TreeView`，必要时再升级 Webview | 运行中任务、最近任务、日志入口和取消操作 |

`tools` 与 `properties` 可以加载同一份 Side Bar Vue bundle，由初始化数据中的 `viewKind` 决定根组件，避免生成两套代码。它们运行在不同 iframe 中，运行时内存仍各自独立，因此 Vue Webview Block 原则上不超过两个；展示型列表优先使用原生 `TreeView`。

每个 Block 的标题操作使用 `menus.view/title`，条目操作使用 `menus.view/item/context`，图标使用 codicon，并通过 `when` 条件根据当前工具和状态显示。块的折叠、尺寸和顺序交给 VS Code 管理，不在 Pinia 中重复保存。

`package.json` 贡献结构（概念）：

```json
{
  "views": {
    "kt-auto-code": [
      { "type": "webview", "id": "ktAutoCode.tools", "name": "工具" },
      { "type": "webview", "id": "ktAutoCode.properties", "name": "属性" },
      { "id": "ktAutoCode-results", "name": "结果" },
      { "id": "ktAutoCode.tasks", "name": "任务与日志" }
    ]
  }
}
```

Webview / TreeView ↔ Extension 消息协议使用同一个 Controller 和状态模型；Webview 消息固定外壳，工具只填 payload：

```typescript
// Webview → Extension
{ type: "run", toolId: "headerAscii", action: "scan" }
{ type: "selectTool", toolId: "headerAscii" }
{ type: "openIssue", toolId: "headerAscii", file: string, line: number }

// Extension → Webview
{ type: "tools", tools: [{ id, title, icon }] }
{ type: "state", toolId: "headerAscii", status: "idle"|"running"|"done", results: [...] }
```



### 2.4 右侧复杂工作台

复杂工具采用类似 Git Graph 的编辑区体验：由命令或 Side Bar 条目打开 `WebviewPanel`，显示在编辑器区域，可占用完整宽度，也可与源码分栏。

| 区域 | VS Code 容器 | 适合内容 |
| --- | --- | --- |
| 左侧轻量界面 | 多个原生 View | 工具入口、属性、范围、运行按钮、进度摘要、最近问题 |
| 右侧复杂界面 | `WebviewPanel` | 大结果表、筛选与排序、差异预览、批量选择、日志、任务历史、复杂编辑器 |

Side Bar 的“查看全部”或结果条目可打开/激活对应 Panel。Panel 由 Extension Host 统一管理实例，避免同一工具无意打开多个重复工作台；确实需要多实例的工具再通过 `contextKey` 区分。

左右两种 View 使用 Vue 3，但采用不同壳层：

- Side Bar 的工具和属性 View 使用紧凑布局，可复用属性 Schema、简单对话框和状态组件；外层 Block 由 VS Code 原生 View 提供。
- 右侧 Panel 可复用 `PnwPageHeader`、`PnwWorkbenchTabBar`、`PnwShellLogPanel`、`PnwAsyncProgressOverlay`、可调表格和工作台引擎。
- Ribbon 只在右侧确有多组复杂命令时使用，不放进窄 Side Bar。

### 2.4.1 前端架构决策

本项目确定采用以下组合：

```text
Extension Host：无 Vue、无 Element Plus
Side Bar：Vue 3 + 轻量 phoenix-wing 组件
Workbench：Vue 3 + phoenix-wing，按需使用少量 Element Plus
```

Vue 3 是正式 View 技术栈；Pinia 按实际共享状态需要引入，不作为强制依赖。Element Plus 不得全量注册或全量导入 CSS，只允许进入确实使用它的 Webview bundle。详细约束以[前端开发规则](./前端开发规则.md)为准。

### 2.5 Activity Bar

- **一个**品牌图标：`media/kt-auto-code.svg`
- **Tooltip**：`KT Auto Code`
- 不在 Activity Bar 为每个小工具单独加图标；小工具图标仅出现在 Side Bar 内选项卡或 View Title（`when` 子句绑定 `ktAutoCode.activeTool == headerAscii` 等 context，Phase 2）。

---



## 3. 仓库结构（建议）

在现有 monorepo 上增加 `extension/` 壳，**不重复**实现扫描逻辑：

```text
kt-auto-code/
├── src/                              # 纯 TS 核心（已有，无 vscode 依赖）
│   ├── sourceEncodingScan.ts
│   ├── sourceEncodingWalk.ts
│   └── …
├── extension/
│   ├── package.json
│   ├── src/
│   │   ├── extension.ts              # activate：registry + 多 View providers
│   │   ├── workspace.ts              # workspaceFolders[0].uri.fsPath
│   │   ├── output.ts                 # 统一 OutputChannel「KT Auto Code」
│   │   ├── sidebar/
│   │   │   ├── toolsViewProvider.ts
│   │   │   ├── propertiesViewProvider.ts
│   │   │   ├── resultsTreeProvider.ts
│   │   │   └── tasksTreeProvider.ts
│   │   └── tools/
│   │       ├── types.ts              # KtTool、ToolMessage
│   │       ├── registry.ts
│   │       └── headerAscii/
│   │           ├── index.ts          # headerAsciiTool 导出
│   │           ├── commands.ts     # scan / fix 实现
│   │           └── panel.ts          # 描述文案、结果列表模型
│   ├── media/
│   │   ├── kt-auto-code.svg          # Activity Bar
│   │   └── tools/
│   │       └── header-ascii.svg      # 可选，Side Bar 工具图标
│   └── .vscode/
│       ├── launch.json
│       └── tasks.json
├── tests/fixtures/multiChar/
├── doc/
│   ├── 源文件编码扫描.md
│   ├── vscode插件规划.md   # 本文
│   ├── 编码修正.md
│   └── 开发与测试.md
└── package.json
```

**依赖方向**：`extension/` → `../src/`（esbuild `bundle: true` 打进 `dist/extension.js`）。

**新增工具 checklist**（后续复制 `headerAscii/` 即可）：

1. 新建 `extension/src/tools/{toolId}/`，实现 `KtTool`
2. 在 `extension.ts` 增加一行 `registerTool(...)`
3. 在 `package.json` 增加 `ktAutoCode.{toolId}.*` 命令与可选 `view/title` 菜单
4. 在 `media/tools/` 放图标（可选）
5. 若需新算法，逻辑放 `src/`，extension 只做壳

---

## 3.1 `phoenix-wing` 复用与 MVC 分离计划

当前工程从 npm Registry 精确消费 `@phoenix-wing/code-core@0.4.3`、`@phoenix-wing/kt-codegen@0.4.3` 及 CAD 侧对应的 0.4.3 scoped packages；已移除 committed 相邻仓库 override、本地 Apply 契约副本，并直接消费 Registry 中的 Codegen 宿主契约、Workspace Schema 兼容性与纯能力 fixture。Extension Host 继续只引入无 UI 的小包，不能把包含 Vue 3 / Pinia / Element Plus 的聚合根入口引入 VS Code Host；最新测试数量以 `pnpm verify:ci` 的输出为准。

### 3.1.1 调查结论

| `phoenix-wing` API | 当前适配度 | 在本项目中的用途 | 处理决定 |
| --- | --- | --- | --- |
| `pnwScheduleDebounced` | 高 | Webview 搜索、筛选、连续配置写入的防抖 | 第一批复用；由适配层统一导出 |
| `pnwComputeProgressPercent` | 中 | 大工程扫描改为异步后，计算多阶段总进度 | 暂缓；先给 core 增加进度回调 |
| `pnwIsTerminal`、`pnwFilterActiveTasks`、`pnwSortTasksByTime` | 中 | 统一扫描/转换任务状态 | 暂缓；现有 `PnwTaskKind` 仍绑定 FCStd、单测、xref，需先泛化 |
| `pnwFormatDuration`、耗时统计函数 | 中 | 扫描耗时、剩余时间与性能诊断 | 有异步进度模型后复用 |
| `pnwBindPointerDrag` | 中 | 将来为结果区/详情区增加可调分隔条 | 有对应 UI 后按需引入 |
| `pnwProp*` 属性 Schema | 高 | 描述 Side Bar 工具属性和配置 | Vue 迁移后用于左侧属性区；通过 Controller 写 VS Code 配置 |
| `pnwCreateWorkbench`、Workbench Tab | 中 | 右侧复杂工具的多页/多结果工作台 | 仅用于右侧 `WebviewPanel`，不进入窄 Side Bar |
| Ribbon、Side Dock、日志面板 | 中 | 右侧复杂命令、布局和日志 | 按复杂工具需要选择性接入 |
| `usePnwAsyncTaskStore`、`PnwAsyncProgressOverlay` | 中 | 任务界面和进度浮层 | Store 只投影视图状态；Extension Host 仍是任务权威来源 |
| `pnwColorScheme` | 低 | 明暗主题 | VS Code CSS variables 已覆盖，不重复管理主题 |
| `pnwBrowserStorage` | 低 | 清理浏览器缓存 | Webview 使用 `vscode.getState/setState`，且函数会清理宽泛前缀，不采用 |
| `pnwDbAdapter` | 无 | SQLite 数据持久化 | 当前项目无数据库需求，不引入 WASM 依赖 |

### 3.1.2 发布包约束

本次同时检查了 npm 安装包、同级源码仓库及 `phoenix-open-issue`、`phoenix-desk-tools` 两个消费项目，并做了实际导入验证：

1. `import { ... } from "phoenix-wing"` 会加载根入口中导出的 Vue composable；当前未安装 `vue`，运行时会报 `Cannot find module 'vue'`。
2. `phoenix-wing/utils/pnwScheduleDebounced` 会被 exports 映射到一个不存在的无扩展名文件。
3. `phoenix-wing/utils/pnwScheduleDebounced.ts` 在当前 `tsx` 环境可用，但直接依赖包内 `.ts` 源文件不是理想的长期发布契约。
4. `phoenix-wing` README 引用的 `doc/` 没有包含在 npm 包的 `files` 中，消费项目只能看到 README 与源码。
5. 源码仓库的 `tsconfig.json` 配置了 `dist` 和声明文件，但实际设置为 `noEmit: true`，`package.json` 也没有 build 脚本；当前发布方式是直接发布 `src/`，并非编译后的 JS + `.d.ts`。
6. 两个现有消费项目本身已经安装 Vue，因此根入口可工作；服务端数据库代码则采用 `phoenix-wing/db/pnwDbAdapter` 子路径。这些用例不能消除本项目缺少 Vue 时的根入口问题。

因此第一阶段不允许业务模块直接从包根入口导入。先建立单一适配点，例如：

```text
extension/src/shared/phoenixWing.ts
  └── phoenix-wing/utils/pnwScheduleDebounced.ts
```

适配层负责隔离导入路径，并为以后升级到稳定的 `.js` exports 留出一个修改点。正式接入前还应：

- 在干净安装环境验证 `pnpm install`、扩展 esbuild 和 VSIX 打包。
- 明确依赖归属；若仅扩展使用，应在 `extension/package.json` 声明，而不是只依赖根目录的提升结果。
- 优先推动 `phoenix-wing` 发布编译后的 JS 和 `.d.ts`，提供不触发 Vue 加载的 `phoenix-wing/core` 或稳定 `utils/*` exports；Vue 壳层继续从独立入口导出。
- 为纯工具子路径增加消费端导入测试，防止 exports 再次指向不存在的文件。

同级仓库适合做开发期联调。可按 `../phoenix-wing/doc/本地验证方法.md` 的既有约定，通过 `pnpm-workspace.yaml` 临时纳入 `../phoenix-wing`；联调完成后仍应切回 npm 版本，验证发布包而非只验证源码软链接。这里的 pnpm workspace 只解决**开发依赖链接**，与插件运行时操作哪个 VS Code 工作目录无关。

建议在 `phoenix-wing` 上游先完成以下最小封装，再由本项目稳定消费：

```text
phoenix-wing
├── core               # 零 Vue/DOM 依赖的纯函数入口
├── vue                # composable、Pinia 和 Vue 组件入口
└── db                 # 可选 SQLite 适配入口
```

其中异步任务模块还应增加通用任务工厂，允许消费方传入 `kind` 和步骤列表；当前固定的 `PnwTaskKind` 与 `PNW_SCAN_STEP_LABELS` 不应泄漏到 KT Auto Code 的 Model。

### 3.1.3 MVC 目标结构

`phoenix-wing` 只提供可复用的基础函数，不代替本项目自己的 MVC 边界。目标依赖方向如下：

```text
View（Vue Side Bar + Vue Workbench Panel）
  ↓ 用户消息 / 可序列化 ViewModel
Controller（Sidebar + Workbench + Tool Controller）
  ↓ 用例调用
Model（src 核心 + extension 状态/配置）
```

| 层 | 目标职责 | 现有代码迁移方向 |
| --- | --- | --- |
| Model | 编码扫描、转换、工具状态、配置值；不依赖 DOM | 保留根 `src/`；新增纯 `ToolStateStore` / ViewModel 类型 |
| Controller | 消息校验、用例编排、确认框、状态转换、调用 Model | 将 `SidebarViewProvider.onMessage` 和各工具 `commands.ts` 的编排拆到 controller；增加 Workbench Panel controller |
| View | Vue 根据 ViewModel 渲染，收集用户操作并发送消息；不调用扫描逻辑 | 将 `panelHtml.ts` 中内联实现迁入 Side Bar Vue 入口；复杂结果进入独立 Workbench Vue 入口 |

Extension Host 是跨视图状态的唯一权威来源。Side Bar 与右侧 Panel 都通过消息订阅同一个 `ToolStateStore`；Pinia 只保存展开、筛选、选中行、列宽等 View 本地状态，不单独持有扫描任务真相。

建议目录：

```text
extension/src/
├── controllers/
│   ├── sidebarController.ts
│   ├── workbenchController.ts
│   └── toolController.ts
├── models/
│   ├── toolStateStore.ts
│   └── viewModels.ts
├── shared/
│   └── phoenixWing.ts
├── sidebar/
│   ├── toolsViewProvider.ts         # 第一块：工具 Tab 和主操作
│   ├── propertiesViewProvider.ts    # 第二块：当前工具属性
│   ├── resultsTreeProvider.ts       # 第三块：原生结果树
│   └── tasksTreeProvider.ts         # 第四块：任务与日志树
└── workbench/
    └── workbenchPanelManager.ts     # 创建、复用、销毁右侧 WebviewPanel

extension/webview/src/
├── shared/                           # 消息协议、ViewModel、共享 Vue 组件
├── sidebar/
│   ├── main.ts                       # 同一 bundle，按 viewKind 启动
│   ├── ToolsView.vue
│   └── PropertiesView.vue
└── workbench/
    ├── main.ts
    └── App.vue                       # 复杂结果与工作台
```

### 3.1.4 实施顺序

- [ ] **A0. 上游包边界**：在同级 `phoenix-wing` 增加 build、稳定的纯工具 exports 和消费端导入测试，发布包含 JS + `.d.ts` 的新版本。
- [ ] **A1. 本项目适配层**：增加 `shared/phoenixWing.ts`；只接入 `pnwScheduleDebounced`，开发期可用同级 workspace 联调，随后切回 npm 版本完成单测、esbuild 和 VSIX 验证。
- [ ] **B. Model**：从 `SidebarViewProvider` 抽出 `ToolStateStore` 和可序列化 ViewModel，不改变现有消息协议。
- [ ] **C. Controller**：抽出消息路由和工具执行编排；拆成 Tools/Properties Webview provider 与 Results/Tasks Tree provider；增加右侧 Panel 生命周期管理。
- [ ] **D. Vue View**：建立共享 Side Bar bundle 与 Workbench Vue 入口；Side Bar bundle 按 `viewKind` 渲染工具或属性，结果和任务保持原生 TreeView。
- [ ] **E. 异步扫描**：core 增加进度回调和取消信号，再评估复用 `pnwComputeProgressPercent` 等纯函数。
- [ ] **F. Phoenix UI 接入**：Side Bar 只接紧凑组件；复杂组件接入右侧 Workbench；按 VS Code 主题变量校准 Element Plus 和 `phoenix-wing` 样式。
- [ ] **G. 体积基线**：输出 Host、Side Bar、Workbench、共享 vendor 与 VSIX 的 raw/gzip 大小，建立后续 CI 预算。

验收原则：每一步保持 CLI 核心 API 不变，插件扫描结果与 CLI 一致；View 不导入根 `src/`，Model 不依赖 `vscode` 或 DOM，所有跨 Webview 边界的数据均可序列化；左右视图同时打开时状态一致，关闭或重开 Panel 不丢失 Host 中的任务状态。

---



## 4. 首期工具：头文件 ASCII 修正（`headerAscii`）



### 4.1 面板文案（可直接用于 Webview）

**标题**：头文件 ASCII 修正  

**说明**（面板顶部常驻）：

> CAA 头文件应仅含 ASCII。本工具扫描工作区 C++ 头文件，将弯引号、GBK 中文等非 ASCII 内容替换为 ASCII 标点或空格，减少 C4819 并满足跨国协作约束。



### 4.2 交互


| 操作       | 行为                                                                              |
| -------- | ------------------------------------------------------------------------------- |
| **扫描**   | `runWorkspaceEncodingScan({ headersOnly: true, fix: false })`，列表展示文件 + 行号 + 问题数 |
| **修复**   | Modal 二次确认 → `fix: true` → 写盘 → 刷新列表                                            |
| **点击条目** | `vscode.window.showTextDocument` 并跳转 `issue.line`                               |




### 4.3 修复策略（与 CLI `fix-headers` 一致）

1. **弯引号等 CP1252 标点** → 映射为 ASCII（`"` `'` `-` …）
2. **GBK 中文等多字节** → 替换为空格（`preserveGbk: false`）
3. CLI 通用命令（`fix-encoding`）默认仍保留 GBK；头文件专用 `fix-headers` 与插件均启用 `asciiOnly`



### 4.4 与核心的对接

```typescript
// extension/src/tools/headerAscii/commands.ts（概念）
import { runWorkspaceEncodingScan } from "../../../../src/sourceEncodingWalk.js";

export async function scanHeaders(root: string) {
  return runWorkspaceEncodingScan({ root, headersOnly: true, fix: false });
}

export async function fixHeaders(root: string) {
  const ok = await vscode.window.showWarningMessage(
    "将写回头文件，是否继续？",
    { modal: true },
    "修复",
  );
  if (ok !== "修复") return;
  return runWorkspaceEncodingScan({ root, headersOnly: true, fix: true });
}
```

**工作区根目录**：一般功能直接使用 `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`。搜索替换额外提供轻量本地目录选择和最近目录，不迁移 desk-tools 的服务端 workspace prefs 或 workset scope；工作区外目录作为独立扫描根。

---



## 5. `package.json` contributes（首期）

```json
{
  "activationEvents": [
    "onView:ktAutoCode.tools",
    "onView:ktAutoCode.properties",
    "onView:ktAutoCode-results",
    "onView:ktAutoCode.tasks"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "kt-auto-code",
        "title": "KT Auto Code",
        "icon": "media/kt-auto-code.svg"
      }]
    },
    "views": {
      "kt-auto-code": [
        { "type": "webview", "id": "ktAutoCode.tools", "name": "工具" },
        { "type": "webview", "id": "ktAutoCode.properties", "name": "属性" },
        { "id": "ktAutoCode-results", "name": "结果" },
        { "id": "ktAutoCode.tasks", "name": "任务与日志" }
      ]
    },
    "commands": [
      {
        "command": "ktAutoCode.headerAscii.scan",
        "title": "头文件 ASCII 修正：扫描",
        "icon": "$(search)"
      },
      {
        "command": "ktAutoCode.headerAscii.fix",
        "title": "头文件 ASCII 修正：修复",
        "icon": "$(wrench)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "ktAutoCode.headerAscii.scan",
          "when": "view == ktAutoCode.tools",
          "group": "navigation@1"
        },
        {
          "command": "ktAutoCode.headerAscii.fix",
          "when": "view == ktAutoCode.tools",
          "group": "navigation@2"
        }
      ]
    }
  }
}
```

后续每增加工具：复制 `commands` / `menus` 块并改 `toolId`；或用 `when: ktAutoCode.activeTool == xxx` 只显示当前工具按钮。

---



## 6. 本地开发模式

VS Code 扩展的标准调试方式完全适用于 Cursor。

### 6.1 Extension Development Host（推荐）

1. `extension/.vscode/launch.json`：`extensionDevelopmentPath` 指向 `extension/`
2. **F5** → 新窗口 **[Extension Development Host]**
3. 打开 `tests/fixtures/multiChar` 或真实 CAA 工程
4. Activity Bar 点 KT Auto Code → Side Bar 选「头文件 ASCII 修正」→ 扫描 / 修复



### 6.2 Watch 编译

`pnpm -C extension watch` + Host 窗口 **Ctrl+R** 重载。

### 6.3 双窗口


| 窗口      | 用途                             |
| ------- | ------------------------------ |
| A（开发）   | 编辑 `extension/src`、`src/`，断点调试 |
| B（Host） | 打开样例工程，验证小工具                   |




### 6.4 CLI 对照

```bash
pnpm scan-encoding --headers tests/fixtures/multiChar
pnpm fix-headers tests/fixtures/multiChar
```

插件与 CLI 结果应一致。

---



## 7. 实施阶段



### Phase 0 — 脚手架 + 多工具基础（0.5–1 天）

- [ ] 新建 `extension/package.json`、`esbuild`、`F5` 可启动  
- [ ] `tools/types.ts`、`tools/registry.ts`、`sidebar/` 壳（空选项卡 + 消息协议）  
- [ ] Activity Bar 图标可见；Webview 能列出四个已注册工具
- [ ] `launch.json` + `tasks.json` + `pnpm -C extension watch`  



### Phase 1 — 头文件 ASCII 修正 MVP（1–2 天）

- [ ] `tools/headerAscii/`：扫描 / 修复 + 面板文案  
- [ ] 对接 `runWorkspaceEncodingScan({ headersOnly: true })`  
- [ ] View Title 扫描 / 修复图标按钮  
- [ ] 修复前 Modal；Output 通道日志；点击结果跳转行  
- [ ] `tests/fixtures/multiChar/MultiCharSample.h` 走通全流程  



### Phase 2 — 体验与第二工具试点

- [ ] 明确单文件夹工作区状态；未打开文件夹时给出提示，多根工作区暂不建立业务选择器
- [ ] `headerAscii` 严格 ASCII 模式  
- [ ] Problems Diagnostic、保存时可选扫描  
- [ ] 试点第二个工具 `sourceAscii`（验证 registry 扩展流程）  
- [ ] `ktAutoCode.activeTool` context + 按工具显示 View Title 按钮  
- [ ] `@vscode/test-electron` 冒烟测试（可选）  



### Phase 3 — 与 desk-tools 协同（可选）

- 共用 `@phoenix/code-core` npm 包  
- desk-tools Web UI 与 VS Code 插件同一套 `src/` API

---



## 8. `extension/package.json` 关键字段


| 字段                 | 示例                          |
| ------------------ | --------------------------- |
| `name`             | `kt-auto-code`              |
| `displayName`      | `KT Auto Code`              |
| `publisher`        | `kuntai`                    |
| `engines.vscode`   | `^1.85.0`                   |
| `categories`       | `["Other"]`                 |
| `main`             | `./dist/extension.js`       |
| `activationEvents` | `onView:ktAutoCode.tools` 等四个 Side Bar View |


---



## 9. 风险与约束


| 风险                      | 缓解                                              |
| ----------------------- | ----------------------------------------------- |
| 修复写盘误伤 GBK 中文           | 默认 `sanitizeSourceForGbk`；修复前扫描预览；Git diff      |
| 用户误以为要转 UTF-8           | 面板顶部固定说明 CAA 约束与「头文件避免多字节」目标                    |
| 工具增多后 `package.json` 膨胀 | Phase 2 用 manifest 合并命令；registry 保持 activate 简洁 |
| Webview 打包路径            | esbuild 单文件 `dist/extension.js`                 |
| 大工程扫描卡顿                 | `SKIP_DIR_NAMES`；进度条 / Worker（Phase 2）          |


---



## 10. 下一步

1. 按 **§3** 创建 `extension/` 脚手架，**先实现 registry + 空 Webview 壳**（Phase 0）
2. 接入 **头文件 ASCII 修正**（Phase 1），用 `tests/fixtures/multiChar` 验证
3. 第二个小工具需求明确后，复制 `headerAscii/` 目录结构接入 registry

CLI 与插件并行维护：**算法只改** `src/` **一处**。
