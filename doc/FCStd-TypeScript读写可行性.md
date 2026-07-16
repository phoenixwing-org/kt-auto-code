# FCStd TypeScript 读写可行性

## 结论

FCStd 是 ZIP 复合文档。CAD 插件可以用 TypeScript 高效完成以下能力：

1. 扫描文件、读取 ZIP 中的 `Document.xml`。
2. 提取对象名、文件名 BOM 字段、XLink 和基础引用树。
3. 将轻量分析结果写入 workspace Schema v13 SQLite。
4. 对明确、有限的 XML 字段执行受控写回。

不建议用 TypeScript 代替 FreeCAD 完成几何、拓扑、表达式重算或任意对象属性写入。此类完整语义操作仍应使用 FreeCAD API 或经过协议约束的本机程序。

## 本地实测

测试环境为 macOS arm64、Node.js 23.7.0。样本来自 `phoenix-freecad-study` 的 10 个开源 FCStd，以及 `phoenix-desk-tools/tests/fixtures` 的两个真实 `Document.xml`。

| 项目 | 结果 |
| --- | ---: |
| FCStd 数量 | 10 |
| 单文件压缩大小 | 17,616–155,218 bytes |
| FCStd 总大小 | 463,593 bytes |
| `Document.xml` 总大小 | 846,634 bytes |
| 首轮读取、解压、对象/XLink 解析 | 12.03 ms / 10 文件 |
| 热解析平均耗时 | 0.429 ms / 文件 |
| 热解析吞吐 | 约 2,332 文件/秒 |
| 同时持有 10 个文件与结果的 RSS 增量 | 约 5.7 MB |
| 完整 ZIP 读取并重打包 | 5.15 ms / 文件 |
| 完整重打包吞吐 | 约 194 文件/秒 |
| 重打包后逐 entry 解压并校验内容 | 450 个 entry 全部一致 |

Desk Tools XML fixture 验证结果：

- `图纸-通过link来创建-Document.xml`：78,615 bytes，14 个对象，正确提取 1 个 XLink。
- `内部装配示例-Document.xml`：132,242 bytes，66 个对象，无 XLink。

这些样本偏小，不能直接代表数十或数百 MB 的复杂模型。大文件必须改为流式 ZIP 读写、限制并发和 XML 输出大小，不能将整个工作区同时读入内存。

## 读取方案

当前插件直接解析 ZIP central directory，只解压 `Document.xml`：

- 支持 ZIP stored（method 0）和 deflate（method 8）。
- 支持 local header 使用 data descriptor，因为压缩大小取自 central directory。
- `Document.xml` 解压后限制为 32 MB，避免异常文件占满 Extension Host。
- 单文件失败只记录 `parse_error`，文件本身仍进入 SQLite 文件索引。
- XLink 继续复用 `@phoenix-wing/cad-core` 的纯 TypeScript 规则。

暂不支持 ZIP64、加密 ZIP 和非 0/8 压缩方法。FreeCAD 正常保存的测试数据未触发这些情况。

## 写回方案

### 可以由 TypeScript 实现

- 修改已知 `Property/String@value`。
- 修改已知 XLink 的 `file` 属性。
- 增删 Phoenix 自有 BOM 字符串属性。

### 必须满足的安全流程

1. 读取并保留所有 ZIP entry、顺序、文件名和时间信息。
2. 只替换 `Document.xml`，其余 entry 内容逐字节不变。
3. 输出到同目录临时文件，禁止原地覆盖 ZIP。
4. 重开临时 ZIP，校验 entry 清单、CRC/解压和未修改 entry 的 SHA-256。
5. 校验修改后的 XML 可解析，目标字段数量符合预期。
6. 使用原子 rename 替换原文件；失败时保留原文件并删除临时文件。
7. 默认先生成 `.FCBak` 或由 Git 工作区提供可恢复点。
8. 发布前必须用受支持的 FreeCAD 版本批量打开、重算并关闭真实 fixture。

### 不应由轻量 TS 写回

- Shape、Placement、表达式依赖和几何二进制 entry。
- 对象创建/删除、对象 ID 或引用关系的通用变更。
- 需要 FreeCAD recompute 才能保持一致的数据。
- 未建立 fixture 和 FreeCAD 回开验收的 XML 结构。

## 性能策略

- 索引读取并发默认 4，避免 Extension Host 主线程和磁盘抖动。
- 读取只解压 `Document.xml`，不解压 Shape、缩略图等无关 entry。
- SQLite 写入使用单事务，扫描完成后一次替换引用/BOM 索引。
- 写回使用异步流式 ZIP 库；同步 `zlib` 只适合当前小文件只读原型。
- 大于阈值的 XML、ZIP64 或未知压缩方法转交 Desk Tools/本机程序。

## 决策

- 文件检索、SQLite 入库、XLink 和基础 BOM：现在由 TypeScript 实现。
- FCStd 元数据/XLink 写回：后续建立独立 Block，先做预览和备份，再有限开放。
- 深度对象读取、几何和重算：继续作为可选 Rust/FreeCAD 增强能力。

## TODO：点检与跨库提炼

- [ ] 用 CAD 插件和 Desk Tools 的真实调用点复核 DTO，确认至少两个消费者需要相同接口后再迁移。
- [ ] 将 ZIP central directory、`Document.xml` 提取和大小限制提炼到 Wing CAD Core；保持纯函数、零 VS Code 依赖。
- [ ] 将 XLink 图、循环检测和基础 BOM plan 提炼到 Wing CAD Core；输入输出只使用稳定 DTO。
- [ ] 将 Schema v13 写入 plan/SQL 契约放到 Wing workspace-schema 或 cad-contracts；数据库连接和事务生命周期仍由宿主管理。
- [ ] CAD 插件保留 VS Code 文件 API、`node:sqlite` Adapter、Controller 和 Block View。
- [ ] Desk Tools 保留桌面文件系统、发布/runtime Adapter，并消费同一 Core。
- [ ] 把 `CadBlockProvider` 从激活入口拆为 View，把扫描/搜索/查询编排拆为 Controller；Block 内不直接实现算法。
- [ ] 迁移前固定当前 10 个 FCStd、2 个 Desk XML fixture、SQLite 往返结果和性能基线；迁移后逐项点检，不允许静默退化。
- [ ] `kt-codegen` 并行迁移完成前，不修改其目录、清单或 lockfile 所属改动。

## 参考

- [FreeCAD 文档：FreeCAD document 与 FCStd ZIP 结构](https://reqrefusion.github.io/FreeCAD-Documentation-html/wiki/Manual%3BThe_FreeCAD_document.html)
- [FreeCAD 官方源码仓库](https://github.com/FreeCAD/FreeCAD)
- [Node.js zlib 文档：线程池、内存和压缩级别](https://nodejs.org/api/zlib.html)
