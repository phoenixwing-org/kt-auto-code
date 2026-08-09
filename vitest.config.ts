import { defineConfig } from "vitest/config";
import {
  discoverLocalWingPackages,
  localWingBuildContextFromEnvironment,
  resolveLocalWingImport,
} from "./scripts/local-wing-resolution.mjs";

const localWing = localWingBuildContextFromEnvironment();
const localWingPackages = localWing ? discoverLocalWingPackages(localWing.wingRoot) : undefined;

export default defineConfig({
  plugins: localWingPackages ? [{
    name: "phoenix-wing-local-vitest",
    enforce: "pre",
    resolveId(source) {
      return source.startsWith("@phoenix-wing/")
        ? resolveLocalWingImport(source, localWingPackages)
        : undefined;
    },
  }] : [],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
