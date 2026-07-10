# encoding fixtures

- `utf8-bom.md` — UTF-8 with BOM (`EF BB BF`)
- `gbk-comment.cpp` — GBK-encoded comment
- `utf16-le.h` — UTF-16 LE with BOM

```bash
pnpm scan-file-encoding tests/fixtures/encoding
pnpm convert-file-encoding tests/fixtures/encoding
```
