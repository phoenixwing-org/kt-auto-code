import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveLocalWingImport,
  resolveLocalWingRoot,
  validateRequiredLocalWingPackages,
} from "./local-wing-resolution.mjs";

// Explicit opt-in only:
// pnpm exec vitest run --config scripts/vitest-local-wing-cleanup.config.mjs
// Build the sibling Wing dist with pnpm ext:dev:prepare first. This config never
// changes the normal Registry test resolution, manifests, lockfile, or process env.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wingRoot = resolveLocalWingRoot({ repoRoot: root, environment: {} });
const packages = validateRequiredLocalWingPackages(wingRoot, ["@phoenix-wing/code-core"]);

export default {
  root,
  plugins: [{
    name: "phoenix-wing-local-cleanup-dom-tests",
    enforce: "pre",
    resolveId(source) {
      return source.startsWith("@phoenix-wing/")
        ? resolveLocalWingImport(source, packages)
        : undefined;
    },
  }],
  test: {
    include: ["tests/local-wing/autoBuildCleanupDialog.test.ts"],
    environment: "happy-dom",
  },
};
