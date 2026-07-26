import { test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"

vi.mock("consola", () => {
  const logMessages: string[] = []
  const infoMessages: string[] = []
  const successMessages: string[] = []
  const errorMessages: string[] = []
  const failMessages: string[] = []
  const warnMessages: string[] = []

  const makeFn = (arr: string[]) => (...args: unknown[]) => {
    const str = args.map((a) => String(a)).join(" ")
    arr.push(str)
  }

  return {
    logMessages, infoMessages, successMessages, errorMessages, failMessages, warnMessages,
    default: {
      log: makeFn(logMessages),
      info: makeFn(infoMessages),
      success: makeFn(successMessages),
      error: makeFn(errorMessages),
      fail: makeFn(failMessages),
      warn: makeFn(warnMessages),
    },
    consola: {
      log: makeFn(logMessages),
      info: makeFn(infoMessages),
      success: makeFn(successMessages),
      error: makeFn(errorMessages),
      fail: makeFn(failMessages),
      warn: makeFn(warnMessages),
    },
  }
})

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  checkbox: vi.fn(),
  select: vi.fn(),
  search: vi.fn(),
}))

import { logMessages, infoMessages } from "consola"

let testDb: Database
let originalFetch: typeof globalThis.fetch

function seedSub(name: string, overrides: Partial<{ price: number; currency: string; cycle: string; status: string }> = {}) {
  const db = testDb
  db.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status) VALUES (?, ?, ?, ?, ?)",
    [name, overrides.price ?? 1000, overrides.currency ?? "JPY", overrides.cycle ?? "monthly", overrides.status ?? "active"],
  )
}

beforeAll(async () => {
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
  testDb.run(`CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    generation_id TEXT
  )`)
  testDb.run(`CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    price INTEGER,
    currency TEXT,
    cycle TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (date('now'))
  )`)

  const db = await import("../db.ts")
  db.__setDb(testDb)

  originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }),
    )
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM trials")

  infoMessages.length = 0
  logMessages.length = 0
})

afterAll(() => {
  testDb?.close()
  globalThis.fetch = originalFetch
})

// ── handleForecast ───────────────────────────────────────

test("forecast shows info when no active subscriptions", async () => {
  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12 })

  expect(infoMessages).toContain("No active subscriptions to forecast")
})

test("forecast shows info when only cancelled subscriptions exist", async () => {
  seedSub("Cancelled Sub", { status: "cancelled" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12 })

  expect(infoMessages).toContain("No active subscriptions to forecast")
})

test("forecast displays monthly and yearly totals", async () => {
  seedSub("Netflix", { price: 1500, currency: "JPY" })
  seedSub("GitHub", { price: 1000, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12 })

  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
  expect(combined).toContain("GitHub")
  expect(combined).toContain("¥2,500")
  expect(combined).toContain("¥30,000")
  expect(combined).toContain("Year")
})

test("forecast custom months", async () => {
  seedSub("Sub", { price: 1000, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 3 })

  const combined = logMessages.join("\n")
  expect(combined).toContain("3 Months")
  expect(combined).toContain("¥3,000")
})

test("forecast with cancel removes subscription from total", async () => {
  seedSub("Keep", { price: 1000, currency: "JPY" })
  seedSub("CancelMe", { price: 2000, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12, cancel: ["CancelMe"] })

  const combined = logMessages.join("\n")
  expect(combined).toContain("Keep")
  expect(combined).toContain("¥12,000")
  expect(combined).toContain("save")
  // CancelMe should not be in the table rows (only in savings text)
  expect(combined).not.toMatch(/\│ *CancelMe/)
})

test("forecast with add-name adds hypothetical subscription", async () => {
  seedSub("Existing", { price: 1000, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({
    months: 12,
    addName: "Hypothetical",
    addPrice: "500",
    addCurrency: "JPY",
    addCycle: "monthly",
  })

  const combined = logMessages.join("\n")
  expect(combined).toContain("Hypothetical")
  expect(combined).toContain("¥1,500")
})

test("forecast with currency converts to target", async () => {
  seedSub("JP Sub", { price: 1600, currency: "JPY" })
  seedSub("US Sub", { price: 10, currency: "USD" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12, currency: "JPY" })

  const combined = logMessages.join("\n")
  expect(combined).toContain("¥3,200")
  expect(combined).toContain("Total")
})

test("forecast handles mixed currencies grouped separately", async () => {
  seedSub("JP", { price: 1000, currency: "JPY" })
  seedSub("US", { price: 10, currency: "USD" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12 })

  const combined = logMessages.join("\n")
  expect(combined).toContain("── JPY ──")
  expect(combined).toContain("── USD ──")
  expect(combined).toContain("¥12,000")
  expect(combined).toContain("$120")
})

test("forecast yearly cycle converts to monthly", async () => {
  seedSub("Annual", { price: 12000, currency: "JPY", cycle: "yearly" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12 })

  const combined = logMessages.join("\n")
  expect(combined).toContain("¥12,000")
})

test("forecast handles fetch failure gracefully", async () => {
  globalThis.fetch = async () => { throw new Error("Network error") }
  seedSub("JP", { price: 1000, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({ months: 12, currency: "JPY" })

  const combined = logMessages.join("\n")
  expect(combined).toContain("¥1,000")

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }),
    )
})

test("forecast with add and cancel simultaneously", async () => {
  seedSub("Keep", { price: 1000, currency: "JPY" })
  seedSub("Ditch", { price: 500, currency: "JPY" })

  const { handleForecast } = await import("../forecast.ts")
  await handleForecast({
    months: 12,
    cancel: ["Ditch"],
    addName: "NewSub",
    addPrice: "300",
    addCurrency: "JPY",
    addCycle: "monthly",
  })

  const combined = logMessages.join("\n")
  expect(combined).toContain("Keep")
  expect(combined).toContain("NewSub")
  expect(combined).toContain("¥1,300")
  expect(combined).toContain("¥15,600")
  expect(combined).toContain("save")
  // Ditch should not be in table rows (only in savings text)
  expect(combined).not.toMatch(/\│ *Ditch/)
})
