import { test, expect, beforeEach, afterEach, vi } from "vitest"
import { consola } from "consola"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const logMessages: string[] = []
const errorMessages: string[] = []
const successMessages: string[] = []

let originalEnv: string | undefined

beforeEach(() => {
  // Isolate config to temporary directory
  originalEnv = process.env.SUBSC_CLI_DB_DIR
  const testConfigDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  process.env.SUBSC_CLI_DB_DIR = testConfigDir

  logMessages.length = 0
  errorMessages.length = 0
  successMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
      if (_type === "success") successMessages.push(clean)
    }
  })
})

afterEach(() => {
  consola.mockTypes()
  // Restore original environment
  if (originalEnv === undefined) {
    delete process.env.SUBSC_CLI_DB_DIR
  } else {
    process.env.SUBSC_CLI_DB_DIR = originalEnv
  }
})

test("handleConfigList shows all config keys", async () => {
  const { handleConfigList } = await import("../commands.ts")
  handleConfigList()
  expect(logMessages.some((m) => m.includes("defaultCurrency"))).toBe(true)
  expect(logMessages.some((m) => m.includes("USD"))).toBe(true)
  expect(logMessages.some((m) => m.includes("monthlyBudget"))).toBe(true)
  expect(logMessages.some((m) => m.includes("theme"))).toBe(true)
})

test("handleConfigGet shows a specific config value", async () => {
  const { handleConfigGet } = await import("../commands.ts")
  handleConfigGet("defaultCurrency")
  expect(logMessages.some((m) => m.includes("defaultCurrency: USD"))).toBe(true)
})

test("handleConfigGet shows error for unknown key", async () => {
  const { handleConfigGet } = await import("../commands.ts")
  handleConfigGet("unknown")
  expect(errorMessages.some((m) => m.includes("Unknown config key"))).toBe(true)
})

test("handleConfigSet sets a config value", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")

  handleConfigSet("defaultCurrency", "JPY")

  // Verify the change
  const config = loadConfig()
  expect(config.defaultCurrency).toBe("JPY")
  expect(successMessages.some((m) => m.includes("Set defaultCurrency = JPY"))).toBe(true)

  // Reset for next test
  handleConfigSet("defaultCurrency", "USD")
})

test("handleConfigSet shows error for invalid currency", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  handleConfigSet("defaultCurrency", "INVALID")
  expect(errorMessages.some((m) => m.includes("Invalid currency code"))).toBe(true)
})

test("handleConfigSet shows error for negative budget", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  handleConfigSet("monthlyBudget", "-100")
  expect(errorMessages.some((m) => m.includes("non-negative"))).toBe(true)
})

test("handleConfigReset resets config to defaults", async () => {
  const { handleConfigSet, handleConfigReset } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")
  resetConfig() // ensure clean state
  handleConfigSet("defaultCurrency", "JPY")

  await handleConfigReset()
  const config = loadConfig()
  expect(config.defaultCurrency).toBe("USD")
})
