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

test("handleConfigSet sets yearlyBudget", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig } = await import("../config.ts")

  handleConfigSet("yearlyBudget", "120000")
  expect(loadConfig().yearlyBudget).toBe(120000)
  expect(successMessages.some((m) => m.includes("Set yearlyBudget = 120000"))).toBe(true)
})

test("handleConfigSet rejects negative yearlyBudget", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  handleConfigSet("yearlyBudget", "-1")
  expect(errorMessages.some((m) => m.includes("non-negative"))).toBe(true)
})

test("handleConfigSet stores named budgets from JSON", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig } = await import("../config.ts")

  const json = JSON.stringify([
    { name: "streaming", amount: 3000, currency: "JPY", period: "monthly", categories: ["video", "music"] },
    { name: "infra", amount: 60000, currency: "JPY", period: "yearly" },
  ])
  handleConfigSet("budgets", json)

  const budgets = loadConfig().budgets
  expect(budgets).toHaveLength(2)
  expect(budgets![0]).toMatchObject({ name: "streaming", amount: 3000, currency: "JPY" })
  expect(budgets![0].categories).toEqual(["video", "music"])
  expect(budgets![1]).toMatchObject({ name: "infra", amount: 60000, period: "yearly" })
})

test("handleConfigSet rejects invalid budgets JSON", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  handleConfigSet("budgets", "not-json")
  expect(errorMessages.some((m) => m.includes("valid JSON array"))).toBe(true)
})

test("handleConfigSet rejects budget entries with bad fields", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  handleConfigSet("budgets", JSON.stringify([{ name: "x", amount: -5, currency: "JPY" }]))
  expect(errorMessages.some((m) => m.includes("non-negative number"))).toBe(true)
  handleConfigSet("budgets", JSON.stringify([{ name: "x", amount: 100, currency: "JP" }]))
  expect(errorMessages.some((m) => m.includes("3-letter code"))).toBe(true)
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

test("webhook secrets are masked in list, get, and set output", async () => {
  const { handleConfigSet, handleConfigGet, handleConfigList } = await import("../commands.ts")
  const { resetConfig, loadConfig } = await import("../config.ts")
  // Build the dummy URL at runtime so no static literal matches the
  // Slack Incoming Webhook pattern (GitHub secret scanning / CodeQL)
  const SECRET = `https://hooks.slack.com/services/${"T000"}/${"B000"}/secret-token-abc`

  resetConfig()
  handleConfigSet("slackWebhook", SECRET)

  // Set output masks the value
  expect(successMessages.some((m) => m.includes(SECRET))).toBe(false)
  expect(successMessages.some((m) => m.includes("slackWebhook = https://hooks.slack.com/***"))).toBe(true)

  // Get output masks the value
  handleConfigGet("slackWebhook")
  expect(logMessages.some((m) => m.includes(SECRET))).toBe(false)
  expect(logMessages.some((m) => m.includes("slackWebhook: https://hooks.slack.com/***"))).toBe(true)

  // List output masks the value
  handleConfigList()
  expect(logMessages.some((m) => m.includes(SECRET))).toBe(false)

  // The real value is still stored
  expect(loadConfig().slackWebhook).toBe(SECRET)
})

// ── Display theme keys ───────────────────────────────

test("theme accepts preset names and rejects unknown", async () => {
  const { handleConfigSet, handleConfigGet } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")

  resetConfig()
  handleConfigSet("theme", "light")
  expect(loadConfig().theme).toBe("light")
  expect(successMessages.some((m) => m.includes("theme = light"))).toBe(true)

  resetConfig()
  handleConfigSet("theme", "vaporwave")
  expect(errorMessages.some((m) => m.includes("theme must be one of"))).toBe(true)
  expect(loadConfig().theme).not.toBe("vaporwave")
})

test("color keys validate color names", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")

  resetConfig()
  handleConfigSet("tableBorderColor", "brightMagenta")
  expect(loadConfig().tableBorderColor).toBe("brightMagenta")

  resetConfig()
  handleConfigSet("accentColor", "notacolor")
  expect(errorMessages.some((m) => m.includes("must be a color name"))).toBe(true)
  expect(loadConfig().accentColor).toBeUndefined()

  resetConfig()
  handleConfigSet("tableHeaderColor", "cyan")
  expect(loadConfig().tableHeaderColor).toBe("cyan")
})

test("tableZebra and tableMinWidth validate values", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")

  resetConfig()
  handleConfigSet("tableZebra", "off")
  expect(loadConfig().tableZebra).toBe("off")

  resetConfig()
  handleConfigSet("tableZebra", "maybe")
  expect(errorMessages.some((m) => m.includes("tableZebra must be"))).toBe(true)

  resetConfig()
  handleConfigSet("tableMinWidth", "120")
  expect(loadConfig().tableMinWidth).toBe(120)

  resetConfig()
  handleConfigSet("tableMinWidth", "10")
  expect(errorMessages.some((m) => m.includes("tableMinWidth must be"))).toBe(true)
})

test("dateFormat and listShow keys validate values", async () => {
  const { handleConfigSet } = await import("../commands.ts")
  const { loadConfig, resetConfig } = await import("../config.ts")

  resetConfig()
  handleConfigSet("dateFormat", "short")
  expect(loadConfig().dateFormat).toBe("short")

  resetConfig()
  handleConfigSet("dateFormat", "long")
  expect(errorMessages.some((m) => m.includes("dateFormat must be"))).toBe(true)

  resetConfig()
  handleConfigSet("listShowNotes", "on")
  expect(loadConfig().listShowNotes).toBe("on")

  resetConfig()
  handleConfigSet("listShowMethod", "yes")
  expect(errorMessages.some((m) => m.includes("must be 'on' or 'off'"))).toBe(true)
})
