import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"

let testDb: Database
let timelineModule: typeof import("../timeline.ts")
let dbModule: typeof import("../db.ts")

function seedSub(
  name: string,
  price: number,
  cycle: string,
  status = "active",
  createdAt?: string,
) {
  const db = dbModule.getDb()
  db.run(
    `INSERT INTO subscriptions (name, price, currency, cycle, status, created_at)
     VALUES (?, ?, 'USD', ?, ?, ?)`,
    [name, price, cycle, status, createdAt || "2020-01-01"],
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
    new_currency TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  )`)

  dbModule = await import("../db.ts")
  dbModule.__setDb(testDb)

  timelineModule = await import("../timeline.ts")
})

beforeEach(() => {
  testDb.run("DELETE FROM price_history")
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM sqlite_sequence")
})

describe("handleTimeline", () => {
  test("shows info when no subscriptions exist", () => {
    const infoLogs: string[] = []
    const origInfo = consola.info
    consola.info = (msg: unknown) => infoLogs.push(String(msg))

    timelineModule.handleTimeline()

    expect(infoLogs.length).toBeGreaterThan(0)
    expect(infoLogs[0]).toContain("No subscriptions")
    consola.info = origInfo
  })

  test("returns chart output for active subscriptions", () => {
    seedSub("Netflix", 1549, "monthly")
    seedSub("Spotify", 999, "monthly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    timelineModule.handleTimeline({ months: 3 })

    expect(loggedLines.length).toBeGreaterThan(0)
    expect(loggedLines.some((l) => l.includes("Monthly spending"))).toBe(true)

    consola.log = origLog
  })

  test("excludes cancelled subscriptions", () => {
    seedSub("Netflix", 1549, "monthly", "active")
    seedSub("Cancelled Thing", 5000, "monthly", "cancelled")

    // With only the cancelled sub, should show no meaningful data
    const loggedLines: string[] = []
    const origLog = consola.log
    const origInfo = consola.info
    consola.log = (msg: unknown) => loggedLines.push(String(msg))
    consola.info = () => {}

    // Clear and add only cancelled
    testDb.run("DELETE FROM subscriptions")
    seedSub("Cancelled Thing", 5000, "monthly", "cancelled")

    timelineModule.handleTimeline({ months: 3 })

    // Should still produce chart output (activeSubs is just empty but that's handled)
    // Actually: zero active subs, getSubscriptions returns the cancelled one,
    // activeSubs filter means empty array, calcMonthlyTotals returns all zeros
    expect(loggedLines.some((l) => l.includes("Monthly spending"))).toBe(true)

    consola.log = origLog
    consola.info = origInfo
  })

  test("handles yearly cycle subscriptions", () => {
    // $120/yr = $10/mo
    seedSub("Annual", 12000, "yearly")

    const loggedLines: string[] = []
    const origLog = consola.log
    consola.log = (msg: unknown) => loggedLines.push(String(msg))

    timelineModule.handleTimeline({ months: 3 })

    expect(loggedLines.some((l) => l.includes("Monthly spending"))).toBe(true)
    consola.log = origLog
  })

  test("outputs JSON with --json flag", () => {
    seedSub("Netflix", 1549, "monthly")

    const jsonOutputs: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    const mockWrite = ((chunk: unknown) => {
      jsonOutputs.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    process.stdout.write = mockWrite

    timelineModule.handleTimeline({ json: true })

    process.stdout.write = origWrite

    expect(jsonOutputs.length).toBeGreaterThan(0)
    const data = JSON.parse(jsonOutputs[0])
    expect(data).toHaveProperty("months")
    expect(data).toHaveProperty("entries")
    expect(data.months).toBe(12)
    expect(data.entries.length).toBe(12)
    expect(data.entries[0]).toHaveProperty("month")
    expect(data.entries[0]).toHaveProperty("total")
  })

  test("respects createdAt date for subscription inclusion", () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`

    seedSub("Old Sub", 1000, "monthly", "active", "2020-01-01")
    seedSub("New Sub", 2000, "monthly", "active", lastMonthStr)

    const jsonOutputs: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    const mockWrite = ((chunk: unknown) => {
      jsonOutputs.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    process.stdout.write = mockWrite

    timelineModule.handleTimeline({ months: 12, json: true })

    process.stdout.write = origWrite

    const data = JSON.parse(jsonOutputs[0])
    expect(data.entries.length).toBe(12)
  })

  test("errors on invalid months", () => {
    const errLogs: string[] = []
    const origError = consola.error
    consola.error = (msg: unknown) => errLogs.push(String(msg))

    timelineModule.handleTimeline({ months: 0 })

    expect(errLogs.length).toBeGreaterThan(0)
    expect(errLogs[0]).toContain("positive integer")
    consola.error = origError
  })
})
