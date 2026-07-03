import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"

let testDb: Database
let dbModule: typeof import("../db.ts")

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
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
})

beforeEach(() => {
  testDb.run("DELETE FROM price_history")
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM sqlite_sequence")
})

describe("MCP helper functions", () => {
  test("formatDateISO formats date to ISO string", async () => {
    const { formatDateISO } = await import("../mcp.ts")
    expect(formatDateISO(new Date("2026-06-15"))).toBe("2026-06-15")
  })

  test("nextDateForCycle — monthly basic case", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    // Use local date constructors for timezone safety
    const anchor = new Date(2026, 0, 15)  // Jan 15
    const from = new Date(2026, 5, 1)     // Jun 1
    const next = nextDateForCycle(15, anchor, "monthly", from)
    // Should be Jun 15 (within same month)
    expect(next.getMonth()).toBe(5)  // June
    expect(next.getDate()).toBe(15)
  })

  test("nextDateForCycle — monthly rolls to next month", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    const anchor = new Date(2026, 0, 15)  // Jan 15
    const from = new Date(2026, 5, 20)    // Jun 20 (past billing day 15)
    const next = nextDateForCycle(15, anchor, "monthly", from)
    expect(next.getMonth()).toBe(6)  // July
    expect(next.getDate()).toBe(15)
  })

  test("nextDateForCycle — yearly returns next year", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    const anchor = new Date(2026, 2, 10)  // Mar 10
    const from = new Date(2026, 5, 1)     // Jun 1
    const next = nextDateForCycle(10, anchor, "yearly", from)
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(2)  // March
    expect(next.getDate()).toBe(10)
  })

  test("nextDateForCycle — weekly returns next week", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    const anchor = new Date(2026, 5, 1)   // Jun 1 (Monday)
    const from = new Date(2026, 5, 15)    // Jun 15
    const next = nextDateForCycle(1, anchor, "weekly", from)
    // Should be a Monday on or after Jun 15
    expect(next.getDay()).toBe(1)  // Monday
    expect(next.getTime()).toBeGreaterThanOrEqual(from.getTime())
    const diffDays = (next.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBeLessThanOrEqual(7)
  })

  test("nextDateForCycle — bi-weekly returns correct date", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    const anchor = new Date(2026, 5, 1)   // Jun 1
    const from = new Date(2026, 5, 15)    // Jun 15
    const next = nextDateForCycle(1, anchor, "bi-weekly", from)
    expect(next.getTime()).toBeGreaterThanOrEqual(from.getTime())
    const diffDays = (next.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBeLessThanOrEqual(14)
  })

  test("nextDateForCycle — quarterly returns next quarter", async () => {
    const { nextDateForCycle } = await import("../upcoming.ts")
    const anchor = new Date(2026, 0, 15)  // Jan 15
    const from = new Date(2026, 5, 1)     // Jun 1
    const next = nextDateForCycle(15, anchor, "quarterly", from)
    expect(next.getMonth()).toBe(6)  // July (Q3)
    expect(next.getDate()).toBe(15)
  })
})

describe("calcUpcoming", () => {
  test("returns upcoming billings within period", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'active', 1, '2026-01-10'),
              (3, 'GitHub Copilot', 1000, 'USD', 'monthly', 'cancelled', 5, '2026-03-01')`,
    )

    const { calcUpcoming } = await import("../upcoming.ts")
    const result = calcUpcoming(30)
    const names = result.map((e: { sub: { name: string } }) => e.sub.name)
    expect(names).toContain("Netflix")
    expect(names).not.toContain("GitHub Copilot")
  })
})

describe("searchSubscriptions", () => {
  test("searches by name pattern", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at, notes)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01', 'Family plan'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'active', 1, '2026-01-10', NULL)`,
    )

    const { searchSubscriptions } = await import("../search.ts")
    const results = searchSubscriptions("net", {})
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r: { name: string }) => r.name === "Netflix")).toBe(true)
  })

  test("returns empty array for no match", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01')`,
    )

    const { searchSubscriptions } = await import("../search.ts")
    const results = searchSubscriptions("zzzzz", {})
    expect(results.length).toBe(0)
  })
})

describe("startMcpServer", () => {
  test("exports startMcpServer function", async () => {
    const { startMcpServer } = await import("../mcp.ts")
    expect(typeof startMcpServer).toBe("function")
  })
})
