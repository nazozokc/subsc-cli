import { test, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const logMessages: string[] = []
const errorMessages: string[] = []

let originalEnv: string | undefined
let originalFetch: typeof globalThis.fetch

let SQL: Awaited<ReturnType<typeof initSqlJs>>
let testDb: Database

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  originalEnv = process.env.SUBSC_CLI_DB_DIR
  const testConfigDir = mkdtempSync(join(tmpdir(), "subtrack-report-"))
  process.env.SUBSC_CLI_DB_DIR = testConfigDir

  logMessages.length = 0
  errorMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
    }
  })

  testDb = new SQL.Database()
  testDb.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    currency TEXT NOT NULL,
    cycle TEXT NOT NULL DEFAULT 'monthly',
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
  testDb.run(
    "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
  )
  testDb.run(
    "CREATE TABLE IF NOT EXISTS subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id))",
  )
  testDb.run(
    "CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER NOT NULL, old_price INTEGER, new_price INTEGER NOT NULL, old_currency TEXT, new_currency TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT (datetime('now')))",
  )
  testDb.run(
    "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target_type TEXT, target_id INTEGER, details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  )

  const dbMod = await import("../db.ts")
  dbMod.__setDb(testDb)

  const { resetConfig } = await import("../config.ts")
  resetConfig()

  originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        base: "USD",
        rates: { JPY: 160, USD: 1 },
      }),
    )
})

afterEach(() => {
  consola.mockTypes()
  globalThis.fetch = originalFetch
  if (originalEnv === undefined) {
    delete process.env.SUBSC_CLI_DB_DIR
  } else {
    process.env.SUBSC_CLI_DB_DIR = originalEnv
  }
})

afterAll(() => {
  testDb.close()
})

// ── Helper ─────────────────────────────────────────────

function insertSub(overrides: Record<string, unknown> = {}): number {
  const fields = {
    name: "Test Sub",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    status: "active",
    billingDay: 1,
    createdAt: "2026-01-01",
    contractEnd: null,
    ...overrides,
  }
  testDb.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [fields.name, fields.price, fields.currency, fields.cycle, fields.status, fields.billingDay, fields.createdAt, fields.contractEnd],
  )
  const row = testDb.exec("SELECT last_insert_rowid() AS id")
  return Number(row[0].values[0][0])
}

// ── calcYearlyTotals ───────────────────────────────────

test("calcYearlyTotals computes per-month totals for a year", async () => {
  const { calcYearlyTotals } = await import("../report.ts")
  const subs = [
    { id: 1, name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", status: "active", tags: [], billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
  ] as never[]

  const totals = calcYearlyTotals(subs, 2026)
  expect(totals.length).toBe(12)
  expect(totals[0]).toEqual({ label: "2026-01", year: 2026, month: 0, total: 1000 })
  expect(totals[11]!.total).toBe(1000)
})

test("calcYearlyTotals excludes subs created after the month", async () => {
  const { calcYearlyTotals } = await import("../report.ts")
  const subs = [
    { id: 1, name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", status: "active", tags: [], billingDay: 1, createdAt: "2026-06-15", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
  ] as never[]

  const totals = calcYearlyTotals(subs, 2026)
  expect(totals[0]!.total).toBe(0)
  expect(totals[5]!.total).toBe(1000)
  expect(totals[11]!.total).toBe(1000)
})

test("calcYearlyTotals counts cancelled subs until contractEnd", async () => {
  const { calcYearlyTotals } = await import("../report.ts")
  const subs = [
    { id: 1, name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", status: "cancelled", tags: [], billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: "2026-03-31", autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
  ] as never[]

  const totals = calcYearlyTotals(subs, 2026)
  expect(totals[0]!.total).toBe(1000)
  expect(totals[2]!.total).toBe(1000)
  expect(totals[3]!.total).toBe(0)
})

test("calcYearlyTotals scales non-monthly cycles", async () => {
  const { calcYearlyTotals } = await import("../report.ts")
  const subs = [
    { id: 1, name: "AWS", price: 12000, currency: "JPY", cycle: "yearly", status: "active", tags: [], billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
  ] as never[]

  const totals = calcYearlyTotals(subs, 2026)
  expect(totals[0]!.total).toBe(1000) // 12000 / 12
})

// ── yearlyCost / calcTopSubscriptions ──────────────────

test("yearlyCost uses occurrences per year", async () => {
  const { yearlyCost } = await import("../report.ts")
  const mk = (cycle: string) => ({
    id: 1, name: "X", price: 100, currency: "JPY", cycle, status: "active", tags: [],
    billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null,
    contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null,
    vendorUrl: null, planTier: null, discountAmount: null, discountType: null,
  }) as never as Parameters<typeof yearlyCost>[0]
  expect(yearlyCost(mk("monthly"))).toBe(1200)
  expect(yearlyCost(mk("yearly"))).toBe(100)
  expect(yearlyCost(mk("weekly"))).toBe(5200)
})

test("calcTopSubscriptions returns top 5 by yearly cost", async () => {
  const { calcTopSubscriptions } = await import("../report.ts")
  const mk = (id: number, name: string, price: number) => ({
    id, name, price, currency: "JPY", cycle: "monthly", status: "active", tags: [],
    billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null,
    contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null,
    vendorUrl: null, planTier: null, discountAmount: null, discountType: null,
  }) as never as Parameters<typeof calcTopSubscriptions>[0]
  const subs = [mk(1, "A", 100), mk(2, "B", 500), mk(3, "C", 300), mk(4, "D", 200), mk(5, "E", 900), mk(6, "F", 700)]
  const top = calcTopSubscriptions(subs, 5)
  expect(top.map((s) => s.name)).toEqual(["E", "F", "B", "C", "D"])
})

// ── calcAddedThisYear / calcCancelledThisYear ──────────

test("calcAddedThisYear filters by createdAt year", async () => {
  insertSub({ name: "Netflix", createdAt: "2025-11-01" })
  insertSub({ name: "Spotify", createdAt: "2026-02-10" })
  insertSub({ name: "AWS", createdAt: "2026-07-01", status: "cancelled", contractEnd: "2026-09-30" })

  const { calcAddedThisYear, calcCancelledThisYear } = await import("../report.ts")
  const { getSubscriptions } = await import("../db.ts")
  const subs = getSubscriptions({ includeArchived: true })

  const added = calcAddedThisYear(subs, 2026)
  expect(added.map((s) => s.name).sort()).toEqual(["AWS", "Spotify"])

  const cancelled = calcCancelledThisYear(subs, 2026)
  expect(cancelled.map((c) => c.name)).toEqual(["AWS"])
})

test("calcCancelledThisYear includes audit log entries", async () => {
  const id = insertSub({ name: "Netflix", status: "cancelled", contractEnd: null })
  testDb.run(
    "INSERT INTO audit_log (action, target_type, target_id, details, created_at) VALUES ('subscription.cancel', 'subscription', ?, 'Netflix', '2026-05-15 10:00:00')",
    [id],
  )

  const { calcCancelledThisYear } = await import("../report.ts")
  const { getSubscriptions } = await import("../db.ts")
  const subs = getSubscriptions({ includeArchived: true })
  const cancelled = calcCancelledThisYear(subs, 2026)
  expect(cancelled.some((c) => c.name === "Netflix")).toBe(true)
})

// ── handleReport ───────────────────────────────────────

test("handleReport renders yearly report", async () => {
  insertSub({ name: "Netflix", price: 1000, createdAt: "2025-11-01" })
  insertSub({ name: "Spotify", price: 980, createdAt: "2026-02-10" })

  const { handleReport } = await import("../report.ts")
  await handleReport({ year: 2026 })

  expect(logMessages.some((m) => m.includes("Subscription Report — 2026"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Total spending"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Top subscriptions"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Spotify"))).toBe(true)
  expect(errorMessages.length).toBe(0)
})

test("handleReport JSON output", async () => {
  insertSub({ name: "Netflix", price: 1000, createdAt: "2026-01-01" })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleReport } = await import("../report.ts")
  await handleReport({ year: 2026, json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.year).toBe(2026)
  expect(parsed.total).toBe(12000)
  expect(parsed.monthly.length).toBe(12)
  expect(parsed.top[0].name).toBe("Netflix")
  expect(parsed.added.length).toBe(1)
  expect(parsed.cancelled).toEqual([])
})

test("handleReport JSON includes price changes for the year", async () => {
  const id = insertSub({ name: "Netflix", price: 2000, createdAt: "2025-01-01" })
  testDb.run(
    "INSERT INTO price_history (subscription_id, old_price, new_price, old_currency, new_currency, changed_at) VALUES (?, 1000, 2000, 'JPY', 'JPY', '2026-03-01 12:00:00')",
    [id],
  )
  // Entry from another year should be excluded
  testDb.run(
    "INSERT INTO price_history (subscription_id, old_price, new_price, old_currency, new_currency, changed_at) VALUES (?, 500, 1000, 'JPY', 'JPY', '2025-03-01 12:00:00')",
    [id],
  )

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleReport } = await import("../report.ts")
  await handleReport({ year: 2026, json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.priceChanges.length).toBe(1)
  expect(parsed.priceChanges[0].diff).toBe(1000)
})

test("handleReport converts currency when requested", async () => {
  insertSub({ name: "Netflix", price: 1600, currency: "JPY", createdAt: "2026-01-01" })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleReport } = await import("../report.ts")
  await handleReport({ year: 2026, currency: "USD", json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.currency).toBe("USD")
  expect(parsed.total).toBe(120) // JPY 1600/mo × 12 = 19200 → USD 120
})

test("handleReport validates year", async () => {
  const { handleReport } = await import("../report.ts")
  await handleReport({ year: 99 })
  expect(errorMessages.some((m) => m.includes("year"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = 0
})