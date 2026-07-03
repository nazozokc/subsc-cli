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

import { input, confirm, checkbox, select } from "@inquirer/prompts"
import { logMessages, infoMessages, successMessages, errorMessages } from "consola"

let testDb: Database
let dbModule: typeof import("../db.ts")

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

  dbModule = await import("../db.ts")
  dbModule.__setDb(testDb)
})

beforeEach(() => {
  testDb.run("DELETE FROM trials")
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")

  infoMessages.length = 0
  successMessages.length = 0
  errorMessages.length = 0
  logMessages.length = 0

  vi.mocked(input).mockReset().mockResolvedValue("")
  vi.mocked(confirm).mockReset().mockResolvedValue(true)
  vi.mocked(checkbox).mockReset().mockResolvedValue([])
  vi.mocked(select).mockReset()
})

afterAll(() => {
  testDb?.close()
})

// ── handleTrialList ──────────────────────────────────────

test("handleTrialList shows info when no trials", async () => {
  const { handleTrialList } = await import("../trial.ts")
  handleTrialList()
  expect(infoMessages).toContain("No trials found")
})

test("handleTrialList displays trials", async () => {
  dbModule.writeTrial({ name: "Netflix Trial", expiresAt: "2099-12-31", price: 1500, currency: "JPY", cycle: "monthly" })
  dbModule.writeTrial({ name: "Spotify Trial", expiresAt: "2099-12-30" })

  const { handleTrialList } = await import("../trial.ts")
  handleTrialList()

  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix Trial")
  expect(combined).toContain("Spotify Trial")
  expect(combined).toContain("¥1,500")
})

// ── handleTrialAdd with flags ─────────────────────────────

test("handleTrialAdd with all flags", async () => {
  const { handleTrialAdd } = await import("../trial.ts")
  await handleTrialAdd({
    name: "Premium Trial",
    expiresAt: "2099-12-31",
    price: "2000",
    currency: "USD",
    cycle: "monthly",
    notes: "30-day trial",
  })

  expect(successMessages.some((m) => m.includes("Added trial: Premium Trial"))).toBe(true)

  const trials = dbModule.getTrials()
  expect(trials).toHaveLength(1)
  expect(trials[0].name).toBe("Premium Trial")
  expect(trials[0].price).toBe(2000)
  expect(trials[0].currency).toBe("USD")
  expect(trials[0].cycle).toBe("monthly")
  expect(trials[0].notes).toBe("30-day trial")
})

test("handleTrialAdd with required flags only", async () => {
  const { handleTrialAdd } = await import("../trial.ts")
  await handleTrialAdd({ name: "Basic Trial", expiresAt: "2099-12-31" })

  expect(successMessages.some((m) => m.includes("Added trial: Basic Trial"))).toBe(true)

  const trials = dbModule.getTrials()
  expect(trials).toHaveLength(1)
  expect(trials[0].price).toBeNull()
  expect(trials[0].currency).toBeNull()
})

test("handleTrialAdd interactive flow", async () => {
  vi.mocked(input)
    .mockResolvedValueOnce("Interactive Trial")
    .mockResolvedValueOnce("2099-12-31")
    .mockResolvedValueOnce("")
    .mockResolvedValueOnce("")
  vi.mocked(select)
    .mockResolvedValueOnce("USD")
    .mockResolvedValueOnce("monthly")

  const { handleTrialAdd } = await import("../trial.ts")
  await handleTrialAdd({})

  expect(successMessages.some((m) => m.includes("Added trial: Interactive Trial"))).toBe(true)
})

test("handleTrialAdd validates empty name", async () => {
  const { handleTrialAdd } = await import("../trial.ts")
  await handleTrialAdd({ name: "", expiresAt: "2099-12-31" })

  expect(dbModule.getTrials()).toHaveLength(0)
})

test("handleTrialAdd validates bad expiration date", async () => {
  const { handleTrialAdd } = await import("../trial.ts")
  await handleTrialAdd({ name: "Bad Trial", expiresAt: "not-a-date" })

  expect(dbModule.getTrials()).toHaveLength(0)
})

// ── handleTrialDelete ────────────────────────────────────

test("handleTrialDelete with ids", async () => {
  dbModule.writeTrial({ name: "Delete Me", expiresAt: "2099-12-31" })
  const trials = dbModule.getTrials()
  const id = trials[0].id

  const { handleTrialDelete } = await import("../trial.ts")
  await handleTrialDelete([id])

  expect(dbModule.getTrials()).toHaveLength(0)
  expect(successMessages.some((m) => m.includes("Deleted trial: Delete Me"))).toBe(true)
})

test("handleTrialDelete with invalid id shows error", async () => {
  const { handleTrialDelete } = await import("../trial.ts")
  await handleTrialDelete([999])

  expect(errorMessages.some((m) => m.includes("Trial with id 999 not found"))).toBe(true)
})

test("handleTrialDelete interactive (with checkbox mock)", async () => {
  dbModule.writeTrial({ name: "Trial A", expiresAt: "2099-12-31" })
  dbModule.writeTrial({ name: "Trial B", expiresAt: "2099-12-30" })
  const all = dbModule.getTrials()

  vi.mocked(checkbox).mockResolvedValue(all)

  const { handleTrialDelete } = await import("../trial.ts")
  await handleTrialDelete()

  expect(dbModule.getTrials()).toHaveLength(0)
})

test("handleTrialDelete interactive cancels when checkbox returns empty", async () => {
  dbModule.writeTrial({ name: "Keep Me", expiresAt: "2099-12-31" })

  vi.mocked(checkbox).mockResolvedValue([])

  const { handleTrialDelete } = await import("../trial.ts")
  await handleTrialDelete()

  expect(dbModule.getTrials()).toHaveLength(1)
  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
})

test("handleTrialDelete shows info when no trials exist", async () => {
  const { handleTrialDelete } = await import("../trial.ts")
  await handleTrialDelete()

  expect(infoMessages).toContain("No trials found")
})

// ── handleTrialExpiring ──────────────────────────────────

test("handleTrialExpiring shows info when none expire soon", async () => {
  dbModule.writeTrial({ name: "Far Future", expiresAt: "2099-12-31" })

  const { handleTrialExpiring } = await import("../trial.ts")
  handleTrialExpiring(1)

  expect(infoMessages.some((m) => m.includes("No trials expiring within"))).toBe(true)
})

test("handleTrialExpiring shows trials expiring within days", async () => {
  const future = new Date()
  future.setDate(future.getDate() + 3)
  const dateStr = future.toISOString().split("T")[0]

  dbModule.writeTrial({ name: "Expiring Soon", expiresAt: dateStr })
  dbModule.writeTrial({ name: "Not Expiring", expiresAt: "2099-12-31" })

  const { handleTrialExpiring } = await import("../trial.ts")
  handleTrialExpiring(7)

  const combined = logMessages.join("\n")
  expect(combined).toContain("Expiring Soon")
  expect(combined).not.toContain("Not Expiring")
})

// ── DB-level trial CRUD ──────────────────────────────────

test("writeTrial saves and retrieves", () => {
  dbModule.writeTrial({ name: "DB Trial", expiresAt: "2099-12-31", price: 500, currency: "USD", cycle: "yearly", notes: "test" })

  const all = dbModule.getTrials()
  expect(all).toHaveLength(1)
  expect(all[0].name).toBe("DB Trial")
  expect(all[0].price).toBe(500)
  expect(all[0].currency).toBe("USD")
  expect(all[0].cycle).toBe("yearly")
  expect(all[0].notes).toBe("test")
})

test("getTrial returns undefined for missing id", async () => {
  expect(dbModule.getTrial(999)).toBeUndefined()
})

test("deleteTrial returns false for missing id", async () => {
  expect(dbModule.deleteTrial(999)).toBe(false)
})

test("getTrialsExpiringSoon returns only matching trials", async () => {
  const future = new Date()
  future.setDate(future.getDate() + 2)
  const soonStr = future.toISOString().split("T")[0]

  dbModule.writeTrial({ name: "Soon", expiresAt: soonStr })
  dbModule.writeTrial({ name: "Later", expiresAt: "2099-12-31" })

  const expiring = dbModule.getTrialsExpiringSoon(7)
  expect(expiring).toHaveLength(1)
  expect(expiring[0].name).toBe("Soon")
})
