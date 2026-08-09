import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function getDefaultCadSiblingRoot(repoRoot) {
  return resolve(repoRoot, "..", "kt-auto-cad");
}

export function resolveCadSiblingRoot({ repoRoot, cadRoot }) {
  const root = cadRoot ? resolve(cadRoot) : getDefaultCadSiblingRoot(repoRoot);
  const manifestPath = resolve(root, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "[cad-sibling] 未找到并列 KT Auto CAD 仓库：" + root + "\n"
      + "请将 kt-auto-code、kt-auto-cad 与 phoenix-wing 放在同一级目录。\n"
      + "如只开发基础插件，请使用 pnpm ext:dev:code。",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== "kt-auto-cad") {
    throw new Error(
      "[cad-sibling] 目录不是 kt-auto-cad 仓库：" + root
      + "（package.json name=" + String(manifest.name ?? "<missing>") + "）",
    );
  }
  return root;
}
