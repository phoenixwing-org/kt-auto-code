# VS Code 插件规划 — Kt Auto Code

> 仓库：`kt-auto-code`  
> 定位：**一套面向 CAA / MSVC C++ 工作流的小工具集合**，统一入口在 Activity Bar + Primary Side Bar。  
> 首期工具：**头文件 ASCII 修正**（`headerAscii`）。  
> 核心逻辑复用现有 `src/sourceEncodingScan.ts`、`src/sourceEncodingWalk.ts`。

---

## 1. 产品定位


| 项                | 说明                                                            |
| ---------------- | ------------------------------------------------------------- |
| **Display Name** | Kt Auto Code                                                  |
| **Extension ID** | `kt.kt-auto-code`（publisher 待定）                               |
| **宿主**           | VS Code ≥ 1.85；Cursor 同 API，F5 调试方式一致                         |
| **首期用户**         | CAA / MSVC + CP936 环境下的 C++ 开发者                               |
| **形态**           | 一个 Activity Bar 品牌入口 + Side Bar 内**多个可切换的小工具**（首期 1 个，后续按需追加） |


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
    vscode.window.registerWebviewViewProvider("ktAutoCode.sidebar", sidebarProvider),
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

### 2.3 Side Bar UI：单 Webview + 工具切换

**一个** `WebviewView`（`ktAutoCode.sidebar`），内部用选项卡或左侧图标列表切换工具，而不是每个工具占一个 Activity Bar 图标（避免图标栏拥挤）。

```text
┌─ Kt Auto Code ─────────────────────────────┐
│ [🅰 头文件 ASCII] [ 源文件 … ] [ + 预留 ] │  ← 工具切换（首期仅第一项可点）
├────────────────────────────────────────────┤
│ 头文件 ASCII 修正                           │
│ 消除头文件中误粘贴弯引号等问题字节，避免     │
│ 跨国代码页差异与 MSVC C4819。               │
│ ─────────────────────────────────────────  │
│ 范围：C++ 头文件 (.h/.hpp/…)               │
│ 工作区：MyCaaModule                        │
│                                            │
│ [ 扫描 ]  [ 修复 ]                         │
│                                            │
│ 结果                                       │
│  MultiCharSample.h  L18  ×2               │
│  Other.h            L12   ×1               │
└────────────────────────────────────────────┘
```

**View Title 工具栏**（`menus.view/title`）：可为**当前选中的工具**显示快捷按钮（扫描、修复），图标用 VS Code codicon（`$(search)`、`$(wrench)`），与 Webview 内按钮调用同一命令。

Webview ↔ Extension 消息协议（固定外壳，工具只填 payload）：

```typescript
// Webview → Extension
{ type: "run", toolId: "headerAscii", action: "scan" }
{ type: "selectTool", toolId: "headerAscii" }
{ type: "openIssue", toolId: "headerAscii", file: string, line: number }

// Extension → Webview
{ type: "tools", tools: [{ id, title, icon }] }
{ type: "state", toolId: "headerAscii", status: "idle"|"running"|"done", results: [...] }
```



### 2.4 Activity Bar

- **一个**品牌图标：`media/kt-auto-code.svg`
- **Tooltip**：`Kt Auto Code`
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
│   │   ├── extension.ts              # activate：registry + WebviewView
│   │   ├── workspace.ts              # workspaceFolders[0].uri.fsPath
│   │   ├── output.ts                 # 统一 OutputChannel「Kt Auto Code」
│   │   ├── sidebar/
│   │   │   ├── sidebarViewProvider.ts
│   │   │   └── panelHtml.ts          # 壳 HTML + CSP + 工具选项卡槽位
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

**工作区根目录**：`vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`；多根工作区 Phase 2。

---



## 5. `package.json` contributes（首期）

```json
{
  "activationEvents": ["onView:ktAutoCode.sidebar"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "kt-auto-code",
        "title": "Kt Auto Code",
        "icon": "media/kt-auto-code.svg"
      }]
    },
    "views": {
      "kt-auto-code": [{
        "type": "webview",
        "id": "ktAutoCode.sidebar",
        "name": "Kt Auto Code"
      }]
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
          "when": "view == ktAutoCode.sidebar",
          "group": "navigation@1"
        },
        {
          "command": "ktAutoCode.headerAscii.fix",
          "when": "view == ktAutoCode.sidebar",
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
4. Activity Bar 点 Kt Auto Code → Side Bar 选「头文件 ASCII 修正」→ 扫描 / 修复



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
- [ ] Activity Bar 图标可见；Webview 能列出已注册工具（首期一条）  
- [ ] `launch.json` + `tasks.json` + `pnpm -C extension watch`  



### Phase 1 — 头文件 ASCII 修正 MVP（1–2 天）

- [ ] `tools/headerAscii/`：扫描 / 修复 + 面板文案  
- [ ] 对接 `runWorkspaceEncodingScan({ headersOnly: true })`  
- [ ] View Title 扫描 / 修复图标按钮  
- [ ] 修复前 Modal；Output 通道日志；点击结果跳转行  
- [ ] `tests/fixtures/multiChar/MultiCharSample.h` 走通全流程  



### Phase 2 — 体验与第二工具试点

- [ ] 多工作区文件夹选择  
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
| `displayName`      | `Kt Auto Code`              |
| `publisher`        | `kt`                        |
| `engines.vscode`   | `^1.85.0`                   |
| `categories`       | `["Other"]`                 |
| `main`             | `./dist/extension.js`       |
| `activationEvents` | `onView:ktAutoCode.sidebar` |


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