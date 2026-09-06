# 内部 Webview 热预览骨架

这是一个仅用于开发期的轻量预览内核。它把浏览器预览所需的 Node 能力从 KT Auto Code 场景中抽离，但目前仍随本仓库维护，不作为公共包发布。

## 当前边界

通用内核负责：

- 只监听 `127.0.0.1` 的临时 HTTP 服务；
- 显式静态资源白名单、Host 校验和基础 CSP；
- esbuild 内存构建与保留上一份成功 bundle；
- TypeScript、HTML、CSS 和刷新客户端的变更监听；
- SSE 构建状态、监视异常提示与整页自动刷新；
- 可重复关闭和启动失败回滚。

静态资源按父目录监视，兼容编辑器的原子保存。若运行期目录被移动、删除或在 Windows 上触发 `EPERM`，失效 watcher 会被关闭并通过 `watch-error` 通知页面；HTTP 服务和其他 watcher 继续运行，开发者可在目录恢复后重启预览服务。

产品适配层负责：

- Primary、Right View 或联合布局；
- VS Code 主题变量和宽度预设；
- Tool/Group/Editor fixture、中文文案和图标；
- 模拟的导航、MRU、关闭与 Primary/Editor 联动。

预览不会加载 Extension Host，不提供真实 `vscode` API，也不会执行文件、Git、进程或工具 Action。

## 接入形态

每个消费者保留一个薄启动脚本，只声明入口、bundle 路由和允许公开的静态文件：

```ts
await startWebviewPreviewServer({
  label: "My extension preview",
  workingDirectory: repositoryRoot,
  entryPoint: previewEntry,
  bundleRoute: "/preview.js",
  staticAssets: {
    "/": { filename: indexFile, contentType: "text/html; charset=utf-8" },
    "/styles.css": { filename: styleFile, contentType: "text/css; charset=utf-8" },
  },
}, 4173);
```

静态文件不会按目录暴露。`bundleRoute`、事件路由和静态资源路由必须互不冲突，资源文件必须使用绝对路径。默认不生成 inline sourcemap，避免把导入源码附加进浏览器 bundle。

## 后续复用门槛

先用 KT Auto Code 验证 API。Auto CAD 或 Desk Tools 成为第二个消费者且无需复制内核后，再迁移到 Phoenix Wing 的独立开发期 package；迁移时按 Wing 规范改用 `Pnw` / `pnw` 公共命名。只有两个以上非同构消费者稳定使用后，才评估独立开源仓库、版本策略和品牌/许可证说明。

正式扩展构建和 VSIX 不得依赖正在运行的预览服务；真实行为仍以 `pnpm ext:dev` 和 Extension Host 点检为准。
