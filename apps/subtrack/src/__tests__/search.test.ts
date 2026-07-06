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

import { input } from "@inquirer/prompts"
import { consola, logMessages, infoMessages } from "consola"

let testDb: Database

function seedSub(name: string, overrides: Partial<{ notes: string; tags: string[]; price: number; currency: string; cycle: string; paymentMethod: string }> = {}) {
  const db = testDb
  db.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, notes, payment_method) VALUES (?, ?, ?, ?, ?, ?)",
    [name, overrides.price ?? 1000, overrides.currency ?? "JPY", overrides.cycle ?? "monthly", overrides.notes ?? null, overrides.paymentMethod ?? null],
  )
  const subId = (db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0] as number)
  if (overrides.tags && overrides.tags.length > 0) {
    for (const tag of overrides.tags) {
      db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tag])
      const tagId = (db.exec("SELECT id FROM tags WHERE name = ?", [tag])[0].values[0][0] as number)
      db.run("INSERT OR IGNORE INTO subscription_tags (subscription_id, tag_id) VALUES (?, ?)", [subId, tagId])
    }
  }
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
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM trials")

  infoMessages.length = 0
  logMessages.length = 0

  vi.mocked(input).mockReset().mockResolvedValue("")
})

afterAll(() => {
  testDb?.close()
})

test("shows info when no results match", async () => {
  vi.mocked(input).mockResolvedValue("no-match-query")
  const { handleSearch } = await import("../search.ts")
  await handleSearch("", {})
  expect(infoMessages.some((m) => m.includes('No results for "no-match-query"'))).toBe(true)
})

test("shows info when no results match with direct query", async () => {
  const { handleSearch } = await import("../search.ts")
  await handleSearch("zzznonexistent", {})
  expect(infoMessages.some((m) => m.includes('No results for "zzznonexistent"'))).toBe(true)
})

test("searches by name", async () => {
  seedSub("Netflix", { price: 1500 })
  seedSub("NotSpotify", { price: 980 })
  seedSub("Other", { price: 500 })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("Netflix", {})

  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
  expect(combined).toContain("¥1,500")
  expect(combined).not.toContain("NotSpotify")
})

test("searches by notes", async () => {
  seedSub("Service A", { notes: "family sharing plan" })
  seedSub("Service B", { notes: "personal account" })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("family", { names: false, notes: true, tags: false })

  const combined = logMessages.join("\n")
  expect(combined).toContain("Service A")
  expect(combined).not.toContain("Service B")
})

test("searches by tags", async () => {
  seedSub("VideoApp", { tags: ["video"] })
  seedSub("MusicApp", { tags: ["music"] })
  seedSub("StorageApp", { tags: ["storage"] })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("video", { names: false, notes: false, tags: true })

  const combined = logMessages.join("\n")
  expect(combined).toContain("VideoApp")
  expect(combined).not.toContain("MusicApp")
  expect(combined).not.toContain("StorageApp")
})

test("searches across all fields by default", async () => {
  seedSub("Netflix", { notes: "streaming service" })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("streaming", {})

  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
})

test("displays correct result count", async () => {
  seedSub("Service A", { price: 100 })
  seedSub("Service B", { price: 200 })
  seedSub("Service C", { price: 300 })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("Service A", {})
  expect(infoMessages.some((m) => m.includes("Found 1 result"))).toBe(true)

  infoMessages.length = 0
  logMessages.length = 0

  await handleSearch("Service", {})
  expect(infoMessages.some((m) => m.includes("Found 3 results"))).toBe(true)
})

test("triggers interactive prompt when no query given", async () => {
  vi.mocked(input).mockResolvedValue("Netflix")
  seedSub("Netflix", { price: 1500 })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("", {})

  expect(vi.mocked(input)).toHaveBeenCalled()
  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
})

test("handles special characters in query", async () => {
  seedSub("Test Service (2026)", { notes: "price: $10/month" })

  const { handleSearch } = await import("../search.ts")
  await handleSearch("price: $10", {})

  const combined = logMessages.join("\n")
  expect(combined).toContain("Test Service (2026)")
})
