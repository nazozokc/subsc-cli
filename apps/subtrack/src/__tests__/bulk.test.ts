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

import { input, confirm, select } from "@inquirer/prompts"
import { infoMessages, successMessages, errorMessages } from "consola"
import type { BulkFilters, BulkOptions } from "../bulk.ts"

let testDb: Database
let dbModule: typeof import("../db.ts")

function seedSub(name: string, overrides: Partial<{ status: string; tags: string[]; price: number }> = {}) {
  const db = testDb
  const status = overrides.status ?? "active"
  db.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status) VALUES (?, ?, ?, ?, ?)",
    [name, overrides.price ?? 1000, "JPY", "monthly", status],
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

  dbModule = await import("../db.ts")
  dbModule.__setDb(testDb)
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM trials")

  infoMessages.length = 0
  successMessages.length = 0
  errorMessages.length = 0

  vi.mocked(input).mockReset().mockResolvedValue("")
  vi.mocked(confirm).mockReset().mockResolvedValue(true)
  vi.mocked(select).mockReset().mockResolvedValue("active")
})

afterAll(() => {
  testDb?.close()
})

// ── handleBulkStatus ─────────────────────────────────────

test("bulk status changes active to paused", async () => {
  seedSub("Active One", { status: "active" })
  seedSub("Active Two", { status: "active" })

  const filters: BulkFilters = {}
  const options: BulkOptions = { force: true }

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("paused", filters, options)

  expect(successMessages.some((m) => m.includes('Updated 2 subscriptions to "paused"'))).toBe(true)

  const subs = dbModule.getSubscriptions()
  expect(subs.every((s) => s.status === "paused")).toBe(true)
})

test("bulk status filters by name", async () => {
  seedSub("Target", { status: "active" })
  seedSub("Other", { status: "active" })

  const filters: BulkFilters = { name: "Target" }
  const options: BulkOptions = { force: true }

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("cancelled", filters, options)

  const target = dbModule.getSubscriptions().find((s) => s.name === "Target")
  const other = dbModule.getSubscriptions().find((s) => s.name === "Other")
  expect(target?.status).toBe("cancelled")
  expect(other?.status).toBe("active")
})

test("bulk status filters by tag", async () => {
  seedSub("VideoApp", { tags: ["video"] })
  seedSub("MusicApp", { tags: ["music"] })

  const filters: BulkFilters = { tag: "music" }
  const options: BulkOptions = { force: true }

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("paused", filters, options)

  const musicApp = dbModule.getSubscriptions().find((s) => s.name === "MusicApp")
  const videoApp = dbModule.getSubscriptions().find((s) => s.name === "VideoApp")
  expect(musicApp?.status).toBe("paused")
  expect(videoApp?.status).toBe("active")
})

test("bulk status filters by status", async () => {
  seedSub("Active One", { status: "active" })
  seedSub("Paused One", { status: "paused" })

  const filters: BulkFilters = { status: "paused" }
  const options: BulkOptions = { force: true }

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("cancelled", filters, options)

  expect(dbModule.getSubscriptions().find((s) => s.name === "Paused One")?.status).toBe("cancelled")
  expect(dbModule.getSubscriptions().find((s) => s.name === "Active One")?.status).toBe("active")
})

test("bulk status invalid target shows error", async () => {
  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("invalid", {}, {})

  expect(errorMessages.some((m) => m.includes('Invalid status "invalid"'))).toBe(true)
})

test("bulk status no match shows info", async () => {
  seedSub("Existing", { status: "active" })

  const filters: BulkFilters = { name: "NonExistent" }
  const options: BulkOptions = {}

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("cancelled", filters, options)

  expect(infoMessages).toContain("No subscriptions match the filter")
})

// ── handleBulkDelete ─────────────────────────────────────

test("bulk delete with filter", async () => {
  seedSub("Delete Me", { price: 100 })
  seedSub("Keep Me", { price: 200 })

  const filters: BulkFilters = { name: "Delete" }
  const options: BulkOptions = { force: true }

  const { handleBulkDelete } = await import("../bulk.ts")
  await handleBulkDelete(filters, options)

  const subs = dbModule.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].name).toBe("Keep Me")
})

test("bulk delete no match shows info", async () => {
  seedSub("One", {})

  const filters: BulkFilters = { name: "zzz" }
  const options: BulkOptions = {}

  const { handleBulkDelete } = await import("../bulk.ts")
  await handleBulkDelete(filters, options)

  expect(infoMessages).toContain("No subscriptions match the filter")
  expect(dbModule.getSubscriptions()).toHaveLength(1)
})

test("bulk delete interactive prompt cancels when user declines", async () => {
  seedSub("One", {})
  seedSub("Two", {})

  vi.mocked(confirm).mockResolvedValue(false)

  const { handleBulkDelete } = await import("../bulk.ts")
  await handleBulkDelete({}, {})

  expect(dbModule.getSubscriptions()).toHaveLength(2)
})

// ── handleBulkTagAdd ─────────────────────────────────────

test("bulk tag add with name filter", async () => {
  seedSub("Target", { tags: [] })
  seedSub("Other", { tags: [] })

  const { handleBulkTagAdd } = await import("../bulk.ts")
  await handleBulkTagAdd("newtag", { name: "Target" })

  const target = dbModule.getSubscriptions().find((s) => s.name === "Target")
  const other = dbModule.getSubscriptions().find((s) => s.name === "Other")
  expect(target?.tags).toContain("newtag")
  expect(other?.tags).not.toContain("newtag")
})

test("bulk tag add skips if already has tag", async () => {
  seedSub("Existing", { tags: ["mytag"] })

  const { handleBulkTagAdd } = await import("../bulk.ts")
  await handleBulkTagAdd("mytag", { name: "Existing" })

  const sub = dbModule.getSubscriptions().find((s) => s.name === "Existing")
  expect(sub?.tags).toEqual(["mytag"])
})

test("bulk tag add empty tag shows error", async () => {
  const { handleBulkTagAdd } = await import("../bulk.ts")
  await handleBulkTagAdd("", {})

  expect(errorMessages.some((m) => m.includes("Tag name is required"))).toBe(true)
})

test("bulk tag add with force skips confirmation", async () => {
  seedSub("Target", { tags: [] })

  const { handleBulkTagAdd } = await import("../bulk.ts")
  await handleBulkTagAdd("newtag", { name: "Target" }, { force: true })

  const target = dbModule.getSubscriptions().find((s) => s.name === "Target")
  expect(target?.tags).toContain("newtag")
  expect(confirm).not.toHaveBeenCalled()
})

// ── handleBulkTagRemove ──────────────────────────────────

test("bulk tag remove with name filter", async () => {
  seedSub("Target", { tags: ["oldtag", "keep"] })
  seedSub("Other", { tags: ["oldtag"] })

  const { handleBulkTagRemove } = await import("../bulk.ts")
  await handleBulkTagRemove("oldtag", { name: "Target" })

  const target = dbModule.getSubscriptions().find((s) => s.name === "Target")
  const other = dbModule.getSubscriptions().find((s) => s.name === "Other")
  expect(target?.tags).toEqual(["keep"])
  expect(other?.tags).toContain("oldtag")
})

test("bulk tag remove empty tag shows error", async () => {
  const { handleBulkTagRemove } = await import("../bulk.ts")
  await handleBulkTagRemove("", {})

  expect(errorMessages.some((m) => m.includes("Tag name is required"))).toBe(true)
})

test("bulk tag remove with force skips confirmation", async () => {
  seedSub("Target", { tags: ["oldtag"] })

  const { handleBulkTagRemove } = await import("../bulk.ts")
  await handleBulkTagRemove("oldtag", { name: "Target" }, { force: true })

  const target = dbModule.getSubscriptions().find((s) => s.name === "Target")
  expect(target?.tags).toEqual([])
  expect(confirm).not.toHaveBeenCalled()
})

// ── Interactive mode (no filters given) ──────────────────

test("bulk status enters interactive mode when no filters provided", async () => {
  seedSub("Only One", { status: "active" })

  // Interactive mode: input(tag) -> empty, select(status) -> "" (all), input(name) -> "Only One"
  vi.mocked(input)
    .mockResolvedValueOnce("")           // tag filter: empty (no tag filter)
    .mockResolvedValueOnce("Only One")   // name filter
  vi.mocked(select).mockResolvedValue("")

  const { handleBulkStatus } = await import("../bulk.ts")
  await handleBulkStatus("paused", {}, {})

  expect(dbModule.getSubscriptions().find((s) => s.name === "Only One")?.status).toBe("paused")
})
