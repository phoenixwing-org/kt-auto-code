# TODO：Phoenix Wing CLI 与 CAA CI/CD

> 状态：待讨论、未立项、当前不实现。
>
> 本文只记录长期方向，不代表 KT Auto Code、Phoenix Wing 或 0.6.0 已提供命令行、批量构建、安装器或 CI Runner。

## 1. 目标

未来让其他 V5 CAA 项目直接调用 Phoenix Wing 的公共能力完成 `MK`、`Run` 和批量编译，不要求安装 KT Auto Code，也不要求工程中存在 `mk.ps1`、`run.ps1` 或项目自带 `.bat` wrapper。

期望的依赖方向：

```text
其他 CAA 项目 / CI ─┐
                     ├─> Phoenix Wing run-core / run-node
KT Auto Code ────────┘
```

Phoenix Wing 不反向依赖 KT Auto Code。插件只是 Wing 的一个 VS Code 消费者。

## 2. 候选 Wing CLI

可评估独立的 `ktc-run` 或 `@phoenix-wing/run-cli`，Windows 安装后把 `bin` 加入 `PATH`：

```bat
ktc-run discover --root C:\work
ktc-run doctor --caa-version 22
ktc-run plan mk --project C:\work\PNXCombinedCurveWsp --caa-version 22
ktc-run mk --project C:\work\PNXCombinedCurveWsp --caa-version 22
ktc-run run --project C:\work\PNXCombinedCurveWsp --caa-version 22
ktc-run batch --profile .phoenix\run\ci.json
```

带关联/前置工程的候选形式：

```bat
ktc-run mk ^
  --project C:\work\PNXCombinedCurveWsp ^
  --preq C:\work\PNXBomAnalysisWsp ^
  --caa-version 22
```

上述名称、参数和发行形式均未冻结。

## 3. Wing 所有权边界

最终应由 Wing 统一维护：

- CAA project/target/profile schema；
- CAA 版本解析与参数优先级；
- Preq DAG、拓扑排序、循环检测和批量策略；
- RADE/厂商脚本预检；
- `tck_init`、`tck_profile`、`mkGetPreq`、`mkmk`、`mkrtv`、`mkCreateRuntimeView`、`mkrun` 的受控命令计划；
- runner 资产、hash、结构化日志与退出码；
- 不依赖 VS Code 的 fixture 和 Windows 实机契约测试。

建议拆分：

- `run-core`：纯类型和算法，不访问文件系统、不启动进程；
- `run-node`：本地发现、环境预检、runner 资源和 process launch plan；
- 可选 `run-cli`：参数/profile、信号处理与输出格式，不复制 core/node 算法；
- KT Auto Code：VS Code Task、Terminal、Problems、Primary UI、安全确认和配置编辑 adapter。

## 4. 配置与 CAA_MK_VERSION

命令行和 CI 不能读取 VS Code User Settings 或扩展 `workspaceState`。候选优先级：

```text
CLI --caa-version
> 团队可见 profile 的版本或版本矩阵
> CI child process 的 CAA_MK_VERSION
> 明确、受控的默认值
```

Wing CLI 只向当前 child process 注入 `CAA_MK_VERSION`，不得运行 `setx`、修改系统 profile 或把机器安装路径写进仓库。

可以评估从插件的 `ktAutoCode.run.caaProjects`、`caaRelatedProjects` 导出 workspace-relative profile，但导出必须是显式动作；这些插件设置本身不能成为 CI 的隐式事实来源。

## 5. 无项目脚本运行

工程内没有 PowerShell/batch wrapper 时，Wing 仍可使用自身发布的 runner 资产创建 launch plan。Windows Agent 仍必须安装有效的 CATIA/RADE 和厂商 batch；Wing 负责预检并报告缺少的版本、目录或脚本。

候选发行方式：

1. 内部 npm/pnpm 包，需要 Node 22；
2. 固定版本 ZIP，包含 CLI、runner assets 和 manifest；
3. 单文件 Windows executable；
4. 显式导出的 `.phoenix/run/ci/` 自包含 runner，服务不允许安装 Node 的 Agent。

CI 不应通过猜测 VS Code 扩展安装目录长期调用 runner。`code --locate-extension` 最多作为临时引导或导出来源，不是稳定执行 contract。

## 6. 批量构建候选要求

- profile 使用 workspace-relative project 路径、目标 ID、版本矩阵和 Preq ID；
- 默认串行构建，只有证明 CAA runtime/build 目录隔离后才开放并行；
- 支持 `fail-fast` 和 `continue-on-error`，最终退出码必须反映失败；
- 每个 project/version 独立日志；
- 可选输出 JUnit、SARIF 或 CI provider annotation；
- 信号取消后停止后续节点并清理本次临时资源；
- runner/profile 记录 schema、Wing 版本和资源 hash；
- 不依赖 VS Code Problems、Terminal 或 Task API。

## 7. 暂不执行

当前明确不做：

- 不创建 `run-cli` package；
- 不注册 `ktc-run` 命令；
- 不修改 Windows `PATH`；
- 不生成 `.phoenix/run/ci/`；
- 不实现批量 DAG 执行器；
- 不把插件安装目录定义成公共 CLI 接口；
- 不宣称 0.6.0 支持 CAA CI/CD。

未来只有在 CI/CD 场景、发行方式、公共 API、配置 schema、Windows Agent 环境和维护责任完成独立评审后，才进入实施计划。
