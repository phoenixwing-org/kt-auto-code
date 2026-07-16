import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "extension/src/**/*.test.ts",
      "extensions/kt-auto-cad/src/**/*.test.ts",
    ],
  },
});
