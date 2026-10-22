import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Server actions are exercised end-to-end by Playwright; unit tests stub
      // them so component rendering does not require a Next request context.
      { find: /^@\/lib\/actions\/studio$/, replacement: path.resolve(__dirname, "tests/stubs/actions-studio.ts") },
      { find: /^@\/lib\/actions\/crm$/, replacement: path.resolve(__dirname, "tests/stubs/actions-crm.ts") },
      { find: /^server-only$/, replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
