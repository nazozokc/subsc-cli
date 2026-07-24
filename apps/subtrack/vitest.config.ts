import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Scanner tests need time for sql.js WASM initialization at module level
    testTimeout: 15_000,
  },
})