# 脚本回归测试

测试脚本与 `../auto-build/` 中的运行脚本分开存放，不同步到 Root。测试加载项目内的共享实现，只在系统临时目录创建样本和执行清理，不使用实际 Root。

从仓库根目录运行（Windows PowerShell 5.1）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupGitProtection.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupRecursion.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupRelativePaths.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupIgnore.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupToml.ps1
'n' | powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-CleanupConfirmation.ps1
```

- `Test-CleanupGitProtection.ps1`：Git/LFS、嵌套仓库、链接别名和底层删除保护。
- `Test-CleanupRecursion.ps1`：递归选项、预览、目录联接、重复目标和循环。
- `Test-CleanupRelativePaths.ps1`：相对路径精确范围、正反斜杠、链接、Git 保护、无效规则前置校验和未找到目标。
- `Test-CleanupIgnore.ps1`：完整名称、通配符、只判断当前项、忽略的下级随父目录删除、相对路径优先级、链接别名、取消链接、空节点和兼容性。
- `Test-CleanupToml.ps1`：TOML 受控数组解析、默认优先级和旧 YAML 过渡兼容。
- `Test-CleanupConfirmation.ps1`：输入 `N` 后保留子内容，结果计为跳过。

测试会打印并保留临时样本目录，便于检查结果。
