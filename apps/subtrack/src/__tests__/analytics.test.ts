import { test, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const logMessages: string[] = []
const infoMessages: string[] = []

let testDb: Database
let testConfigDir: string

beforeAll(async () => {
  // Isolate config to temporary directory
  testConfigDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  process.env.SUBSC_CLI_DB_DIR = testConfigDir

  const SQL = await initSqlJs()
  testDb = new SQL.Database()
  testDb.run("PRAGMA foreign_keys = ON")
  testDb.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    currency TEXT NOT NULL,
    cycle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    billing_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (date('now')),
    notes TEXT,
    payment_method TEXT,
    contract_start TEXT,
    contract_end TEXT,
    auto_renewal INTEGER NOT NULL DEFAULT 1,
    vendor_name TEXT,
    vendor_url TEXT,
    plan_tier TEXT,
    discount_amount INTEGER,
    discount_type TEXT
  )`)
  testDb.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`)
  testDb.run(`CREATE TABLE IF NOT EXISTS subscription_tags (
    subscription_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (subscription_id, tag_id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`)

  const db = await import("../db.ts")
  db.__setDb(testDb)
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")

  logMessages.length = 0
  infoMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "info") infoMessages.push(clean)
    }
  })
})

afterEach(() => {
  consola.mockTypes()
})

afterAll(() => {
  testDb.close()
  delete process.env.SUBSC_CLI_DB_DIR
})

test("showAnalytics shows info when no subscriptions", async () => {
  const { showAnalytics } = await import("../analytics.ts")
  showAnalytics()
  expect(infoMessages.some((m) => m.includes("No active subscriptions"))).toBe(true)
})

test("showAnalytics shows overview for active subscriptions", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] })
  db.writeSubscription({ name: "Spotify", price: 980, currency: "JPY", cycle: "monthly", tags: ["music"] })

  const { showAnalytics } = await import("../analytics.ts")
  showAnalytics()

  const output = logMessages.join("\n")
  expect(output).toContain("Total subscriptions:  2")
  expect(output).toContain("Netflix")
  expect(output).toContain("JPY    ¥2,480")
  expect(output).toContain("video")
  expect(output).toContain("music")
})

test("showAnalytics counts statuses correctly", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Active1", price: 100, currency: "USD", cycle: "monthly", tags: [], status: "active" })
  db.writeSubscription({ name: "Active2", price: 200, currency: "USD", cycle: "monthly", tags: [], status: "active" })
  db.writeSubscription({ name: "Paused1", price: 300, currency: "USD", cycle: "monthly", tags: [], status: "paused" })
  db.writeSubscription({ name: "Cancelled1", price: 400, currency: "USD", cycle: "monthly", tags: [], status: "cancelled" })

  const { showAnalytics } = await import("../analytics.ts")
  showAnalytics()

  const output = logMessages.join("\n")
  expect(output).toContain("active: 2")
  expect(output).toContain("paused: 1")
  expect(output).toContain("cancelled: 1")
})

test("showAnalytics includes budget info when configured", async () => {
  const { resetConfig } = await import("../config.ts")
  resetConfig()
  const { setConfig } = await import("../config.ts")
  setConfig("monthlyBudget", "50000")

  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "USD", cycle: "monthly", tags: [] })

  const { showAnalytics } = await import("../analytics.ts")
  showAnalytics()

  const output = logMessages.join("\n")
  expect(output).toContain("Budget:")
  expect(output).toContain("$50,000")

  // Reset budget
  setConfig("monthlyBudget", "0")
})

test("showAnalytics converts spending to target currency", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }))

  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1600, currency: "JPY", cycle: "monthly", tags: [] })

  const { showAnalytics } = await import("../analytics.ts")
  await showAnalytics({ currency: "USD" })

  const output = logMessages.join("\n")
  expect(output).toContain("USD    $10")

  globalThis.fetch = originalFetch
})

test("showAnalytics yearly period shows annual figures", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })

  const { showAnalytics } = await import("../analytics.ts")
  await showAnalytics({ period: "yearly" })

  const output = logMessages.join("\n")
  expect(output).toContain("Yearly spending:")
  expect(output).toContain("¥12,000")
})

test("showAnalytics compares budget across currencies with --currency", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }))

  const { resetConfig } = await import("../config.ts")
  resetConfig()
  const { setConfig } = await import("../config.ts")
  setConfig("monthlyBudget", "200")
  setConfig("defaultCurrency", "USD")

  const db = await import("../db.ts")
  // ¥16,000 = $100
  db.writeSubscription({ name: "JP", price: 16000, currency: "JPY", cycle: "monthly", tags: [] })

  const { showAnalytics } = await import("../analytics.ts")
  await showAnalytics({ currency: "JPY" })

  const output = logMessages.join("\n")
  expect(output).toContain("Remaining:")
  // budget $200 - spending $100 => remaining $100
  expect(output).toContain("$100")

  setConfig("monthlyBudget", "0")
  globalThis.fetch = originalFetch
})
