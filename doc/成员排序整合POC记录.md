# C++ 成员排序跨产品整合 POC

> 目标：用一小时验证 `phoenix-desk-tools` 迁移后的排序实现，能否以共享 core 方式接入 KT Auto Code；本记录只覆盖最小入口，不代表生产功能已完成。

## 当前基线

- desk-tools master 的排序引擎：
  - `phoenix-desk-tools/server/src/lib/reorderCppEngine.ts`
  - `phoenix-desk-tools/server/src/lib/reorderHeaderEngine.ts`
  - `phoenix-desk-tools/server/src/lib/reorderMembersService.ts`
- Python `phoenix/code/reorder_members.py` 是遗留参考，不作为 VS Code 运行时依赖。
- desk-tools 已有 15 个 header、7 个 `.cpp` fixture 的迁移差分测试证据；后续共享包应以这些输出为契约。
- 当前安装的 `phoenix-wing` `0.1.4` 只导出通用 Vue/工具模块，未导出 `reorderCppText` 或 `reorderHeaderText`；因此本次 POC 尚不能声称已完成三方算法调用。
- 两个排序引擎本身是无 import 的纯 TypeScript 函数，适合直接抽到 phoenix-wing；`reorderMembersService.ts` 则包含 Node 文件系统、偏好和批处理逻辑，不应整体带入 VS Code core。

## 本次 POC 已完成

1. VS Code 插件新增 `reorderMembers` 工具入口，显示为“C++ 成员排序”。
2. 侧栏新增轻量 Block：扫描工作区 `.h/.hpp/.hh/.c/.cc/.cpp/.cxx` 文件。
3. 默认排除 `.git`、`node_modules`、`dist`、`build`、`out`、`target`。
4. 扫描结果显示相对路径和文件类型，最多展示前 100 项。
5. 增加命令：`KT Auto Code：C++ 成员排序（POC）`。
6. POC 明确不嵌入 Vue3/Element Plus，不写回文件，不复制 desk-tools CAA 页面。

## 验证结果

```text
pnpm -C extension build
通过：extension/dist/extension.js 生成成功
pnpm test
通过：27 个测试文件 / 189 个测试
```

侧栏单测命令未执行成功：当前 `extension/` 没有安装 Vitest，因此 `pnpm -C extension exec vitest ...` 返回 `Command "vitest" not found`。这不是排序算法失败，而是测试依赖尚未接入扩展包。

尝试直接运行 desk-tools 的两个排序引擎测试时，Vite 需要向其 `server/node_modules/.vite-temp` 写临时配置文件，但当前受限工作区返回 `EPERM`。因此本次只引用仓库已有的 master 迁移测试记录，没有在本工作区重复执行 desk-tools 测试。

## 尚未完成

- 尚未把 `reorderCppEngine.ts` / `reorderHeaderEngine.ts` 抽到 phoenix-wing 公共包。
- VS Code 目前只扫描文件，尚未调用排序引擎生成预览 diff。
- 尚未实现选中文件、锁定区诊断、编码读取、取消、写回和撤销。
- 尚未连接 Tauri companion app 或 desk-tools 本地端口。
- 侧栏候选列表暂时不是 editor-area 的完整结果 View。
- 当前 `phoenix-wing` npm 包没有排序导出，真正的共享调用链被“引擎抽包/发布”这一步阻塞。

## 下一步建议

1. 先将 desk-tools 两个 TS 引擎及 `sourceTextCodec` 抽成无 UI 的共享包，保留现有 golden 输出。
2. 在 VS Code Host 增加 `preview` 命令：读取所选文件，调用 shared core，打开 diff View；暂不写盘。
3. 再决定由 VS Code 直接调用 shared core，还是把复杂 CAA/拖拽操作交给 Tauri。
4. 为扩展增加独立的最小测试依赖或复用根测试配置，覆盖扫描 glob、排序预览和错误状态。
