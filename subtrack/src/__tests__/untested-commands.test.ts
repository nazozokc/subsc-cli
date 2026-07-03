import { test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { mkdtempSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"


// Mock consola
const logMessages: string[] = []
const infoMessages: string[] = []
const errorMessages: string[] = []

const makeFn = (arr: string[]) => (...args: unknown[]) => {
  arr.push(args.map((a) => String(a)).join(" "))
}

vi.mock("consola", () => ({
  default: {
    log: makeFn(logMessages),
    info: makeFn(infoMessages),
    success: makeFn([]),
    error: makeFn(errorMessages),
    warn: makeFn([]),
    fail: makeFn([]),
  },
  consola: {
    log: makeFn(logMessages),
    info: makeFn(infoMessages),
    success: makeFn([]),
    error: makeFn(errorMessages),
    warn: makeFn([]),
    fail: makeFn([]),
  },
  logMessages,
  infoMessages,
  successMessages: [] as string[],
  errorMessages,
}))

let SQL: Awaited<ReturnType<typeof initSqlJs>>
let cleanEnv: string
let tmpDir: string
let getDb: () => Database
let __setDb: (db: Database) => void

beforeAll(async () => {
  SQL = await initSqlJs()
  cleanEnv = process.env.SUBSC_CLI_DB_DIR ?? ""
  tmpDir = mkdtempSync(join(tmpdir(), "subtrack-untested-"))
  process.env.SUBSC_CLI_DB_DIR = tmpDir

  const dbMod = await import("../db.ts")
  getDb = dbMod.getDb
  __setDb = dbMod.__setDb
})

afterAll(() => {
  if (cleanEnv) process.env.SUBSC_CLI_DB_DIR = cleanEnv
  else delete process.env.SUBSC_CLI_DB_DIR
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  const db = new SQL.Database()
  db.run(
    "CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL, cycle TEXT NOT NULL DEFAULT 'monthly', status TEXT NOT NULL DEFAULT 'active', billing_day INTEGER, created_at TEXT NOT NULL, notes TEXT, payment_method TEXT)",
  )
  db.run(
    "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
  )
  db.run(
    "CREATE TABLE IF NOT EXISTS subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id))",
  )
  db.run(
    "CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER NOT NULL, old_price INTEGER, new_price INTEGER NOT NULL, old_currency TEXT, new_currency TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT (datetime('now')))",
  )
  db.run("CREATE TABLE IF NOT EXISTS trials (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, expires_at TEXT NOT NULL, price INTEGER, currency TEXT, cycle TEXT, notes TEXT, created_at TEXT NOT NULL)")

  __setDb(db)

  logMessages.length = 0
  infoMessages.length = 0
  errorMessages.length = 0
})

// ── Helper ─────────────────────────────────────────────

function insertSub(overrides: Record<string, unknown> = {}): number {
  const db = getDb()
  const fields = {
    name: "Test Sub",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    status: "active",
    billingDay: 1,
    createdAt: "2026-01-01",
    notes: null,
    paymentMethod: null,
    ...overrides,
  }
  db.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at, notes, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [fields.name, fields.price, fields.currency, fields.cycle, fields.status, fields.billingDay, fields.createdAt, fields.notes, fields.paymentMethod],
  )
  const row = db.exec("SELECT last_insert_rowid() AS id")
  return Number(row[0].values[0][0])
}

// ── Calendar tests ─────────────────────────────────────

test("handleCalendar shows info when no subscriptions", async () => {
  const { handleCalendar } = await import("../commands.ts")
  handleCalendar({ month: 6, year: 2026 })
  expect(infoMessages.some((m) => m.includes("No billing"))).toBe(true)
})

test("handleCalendar JSON output", { timeout: 5000 }, async () => {
  insertSub({ name: "Netflix", price: 1500, billingDay: 15, createdAt: "2026-06-01" })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => { writes.push(String(chunk)); return true }) as typeof process.stdout.write

  const { handleCalendar } = await import("../commands.ts")
  handleCalendar({ month: 6, year: 2026, json: true })

  process.stdout.write = origWrite

  expect(writes.length).toBeGreaterThan(0)
  const parsed = JSON.parse(writes.join(""))
  expect(Array.isArray(parsed)).toBe(true)
})

test("handleCalendar table output does not error", async () => {
  insertSub({ name: "Spotify", price: 980, billingDay: 10, createdAt: "2026-06-01" })

  const { handleCalendar } = await import("../commands.ts")
  handleCalendar({ month: 6, year: 2026 })
  expect(errorMessages.length).toBe(0)
})

// ── History tests ──────────────────────────────────────

test("handleHistory shows info when no history", async () => {
  const { handleHistory } = await import("../history.ts")
  handleHistory(undefined, { all: true })
    expect(infoMessages.some((m) => m.includes("No price changes recorded"))).toBe(true)
})

test("handleHistory shows history for a specific subscription", async () => {
  const id = insertSub({ name: "AWS" })
  const { writePriceHistory } = await import("../db.ts")
  writePriceHistory(id, 1000, 2000, "JPY", "JPY")

  const { handleHistory } = await import("../history.ts")
  handleHistory(id, {})
  expect(logMessages.length).toBeGreaterThan(0)
})

test("handleHistory shows all history with --all", async () => {
  const id1 = insertSub({ name: "AWS", createdAt: "2026-01-01" })
  const id2 = insertSub({ name: "Azure", createdAt: "2026-02-01" })

  const { writePriceHistory } = await import("../db.ts")
  writePriceHistory(id1, 5000, 6000, "USD", "USD")
  writePriceHistory(id2, 8000, 10000, "USD", "USD")

  const { handleHistory } = await import("../history.ts")
  handleHistory(undefined, { all: true })
  expect(logMessages.length).toBeGreaterThan(0)
})

test("handleHistory JSON output", async () => {
  const id = insertSub({ name: "GitHub Copilot" })
  const { writePriceHistory, getPriceHistory } = await import("../db.ts")
  writePriceHistory(id, 0, 1000, "USD", "USD")

  // Verify the data exists before testing output
  const entries = getPriceHistory(id)
  expect(entries.length).toBeGreaterThan(0)

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => { writes.push(String(chunk)); return true }) as typeof process.stdout.write

  const { handleHistory } = await import("../history.ts")
  handleHistory(id, { json: true })

  process.stdout.write = origWrite

  expect(writes.length).toBeGreaterThan(0)
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.length).toBeGreaterThan(0)
})

test("handleHistory with --days filters recent changes", async () => {
  const id = insertSub({ name: "Slack" })
  const { writePriceHistory } = await import("../db.ts")
  writePriceHistory(id, 1000, 1500, "USD", "USD")

  const { handleHistory } = await import("../history.ts")
  handleHistory(undefined, { all: true, days: 30 })
  expect(logMessages.length).toBeGreaterThan(0)
})

// ── Notify tests ───────────────────────────────────────

test("handleNotify dry-run shows no upcoming when no subscriptions", async () => {
  const { handleNotify } = await import("../notify.ts")
  await handleNotify({ days: 7, dryRun: true })
  expect(infoMessages.some((m) => m.includes("No upcoming"))).toBe(true)
})

test("handleNotify dry-run shows upcoming bills", async () => {
  // Billing on day 10 — next billing will be this month's 10th (within 7 days from July 3)
  insertSub({ name: "Netflix", price: 1500, billingDay: 10, createdAt: "2026-06-01" })

  const { handleNotify } = await import("../notify.ts")
  await handleNotify({ days: 7, dryRun: true })
  expect(logMessages.length).toBeGreaterThan(0)
})

test("handleNotify JSON output", async () => {
  insertSub({ name: "Netflix", price: 1500, billingDay: 2, createdAt: "2026-06-01" })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => { writes.push(String(chunk)); return true }) as typeof process.stdout.write

  const { handleNotify } = await import("../notify.ts")
  await handleNotify({ days: 7, json: true })

  process.stdout.write = origWrite

  expect(writes.length).toBeGreaterThan(0)
  const parsed = JSON.parse(writes.join(""))
  expect(parsed).toHaveProperty("count")
  expect(parsed).toHaveProperty("entries")
})

test("handleNotify with days=0 returns early", async () => {
  // Billing on day 10 — won't be within 0 days so "No upcoming" is expected
  insertSub({ name: "Netflix", price: 1500, billingDay: 10, createdAt: "2026-06-01" })

  const { handleNotify } = await import("../notify.ts")
  await handleNotify({ days: 0, dryRun: true })
  expect(infoMessages.some((m) => m.includes("No upcoming"))).toBe(true)
})
