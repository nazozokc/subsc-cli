import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"

let testDb: Database
let optimizeModule: typeof import("../optimize.ts")
let dbModule: typeof import("../db.ts")

function seedSub(
  id: number | null,
  name: string,
  price: number,
  cycle: string,
  status = "active",
  createdAt?: string,
) {
  const db = dbModule.getDb()
  db.run(
    `INSERT INTO subscriptions (id, name, price, cycle, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id ?? null, name, price, cycle, status, createdAt || "2020-01-01"],
  )
  dbModule.saveDb()
}

function seedPriceHistory(subId: number, oldPrice: number, newPrice: number, changedAt: string) {
  const db = dbModule.getDb()
  db.run(
    `INSERT INTO price_history (subscription_id, old_price, new_price, new_currency, changed_at)
     VALUES (?, ?, ?, 'USD', ?)`,
    [subId, oldPrice, newPrice, changedAt],
  )
  dbModule.saveDb()
}

beforeAll(async () => {
  const SQL = await initSqlJs()
  testDb = new SQL.Database()
  testDb.run("PRAGMA foreign_keys = ON")

  testDb.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
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
  testDb.run(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    old_price INTEGER,
    new_price INTEGER NOT NULL,
    old_currency TEXT,
    new_currency TEXT NOT NULL DEFAULT 'USD',
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  )`)

  dbModule = await import("../db.ts")
  dbModule.__setDb(testDb)

  optimizeModule = await import("../optimize.ts")
})

beforeEach(() => {
  testDb.run("DELETE FROM price_history")
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM sqlite_sequence")
})

describe("handleOptimize", () => {
  test("shows info when no subscriptions exist", () => {
    const infoLogs: string[] = []
    const origInfo = consola.info
    consola.info = (msg: unknown) => infoLogs.push(String(msg))

    optimizeModule.handleOptimize()

    expect(infoLogs.length).toBeGreaterThan(0)
    expect(infoLogs[0]).toContain("No subscriptions")
    consola.info = origInfo
  })

  test("suggests yearly billing for monthly subscriptions", () => {
    seedSub(null, "Netflix", 1549, "monthly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    expect(loggedLines.some((l) => l.includes("Cycle Optimization"))).toBe(true)
    expect(loggedLines.some((l) => l.includes("Netflix"))).toBe(true)
    expect(loggedLines.some((l) => l.includes("save"))).toBe(true)

    consola.log = origLog
  })

  test("skips yearly cycle subscriptions in cycle optimization", () => {
    seedSub(null, "Annual Sub", 12000, "yearly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    // Should not suggest cycle optimization for already-yearly subscriptions
    const hasCycleSection = loggedLines.some((l) => l.includes("Cycle Optimization"))
    expect(hasCycleSection).toBe(false)

    consola.log = origLog
  })

  test("detects duplicate subscriptions by name similarity", () => {
    seedSub(null, "Netflix Standard", 1549, "monthly")
    seedSub(null, "Netflix Premium", 1999, "monthly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    expect(loggedLines.some((l) => l.includes("Possible Duplicates"))).toBe(true)

    consola.log = origLog
  })

  test("detects inactive subscriptions (no price change >18 months)", () => {
    seedSub(1, "Old Sub", 1000, "monthly")
    // Add a price history entry from 2 years ago
    seedPriceHistory(1, 500, 1000, "2024-01-15")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    expect(loggedLines.some((l) => l.includes("Inactive"))).toBe(true)

    consola.log = origLog
  })

  test("shows cancelled subscription savings", () => {
    seedSub(null, "Cancelled Sub", 2000, "monthly", "cancelled")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    expect(loggedLines.some((l) => l.includes("Cancelled"))).toBe(true)
    expect(loggedLines.some((l) => l.includes("Cancelled Sub"))).toBe(true)

    consola.log = origLog
  })

  test("shows nothing to optimize when all is optimal", () => {
    seedSub(null, "Good Sub", 10000, "yearly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    optimizeModule.handleOptimize()

    const hasOptimizationSection =
      loggedLines.some((l) => l.includes("Cycle Optimization")) ||
      loggedLines.some((l) => l.includes("Possible Duplicates")) ||
      loggedLines.some((l) => l.includes("Inactive")) ||
      loggedLines.some((l) => l.includes("Cancelled"))
    expect(hasOptimizationSection).toBe(false)

    consola.log = origLog
  })

  test("outputs JSON with --json flag", () => {
    seedSub(null, "Netflix", 1549, "monthly")

    const jsonOutputs: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    const mockWrite = ((chunk: unknown) => {
      jsonOutputs.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    process.stdout.write = mockWrite

    optimizeModule.handleOptimize({ json: true })

    process.stdout.write = origWrite

    expect(jsonOutputs.length).toBeGreaterThan(0)
    const data = JSON.parse(jsonOutputs[0])
    expect(data).toHaveProperty("suggestions")
    expect(data).toHaveProperty("totalYearlySavings")
    expect(data.suggestions.length).toBeGreaterThan(0)
  })
})
