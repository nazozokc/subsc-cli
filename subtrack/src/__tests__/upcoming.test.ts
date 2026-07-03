import { test, expect, beforeEach, afterEach, beforeAll } from "vitest"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"

const logMessages: string[] = []
const infoMessages: string[] = []

let testDb: Database

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
  testDb.run(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (date('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
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

test("showUpcoming shows info when no subscriptions", async () => {
  const { showUpcoming } = await import("../upcoming.ts")
  await showUpcoming(7)
  expect(infoMessages.some((m) => m.includes("No upcoming bills"))).toBe(true)
})

test("showUpcoming shows info when no upcoming bills", async () => {
  const db = await import("../db.ts")
  // Create a subscription with billing far in the future
  db.writeSubscription({ name: "Yearly", price: 1000, currency: "USD", cycle: "yearly", tags: [], status: "active", createdAt: "2025-01-01", billingDay: 1 })

  const { showUpcoming } = await import("../upcoming.ts")
  await showUpcoming(7)
  expect(infoMessages.some((m) => m.includes("No upcoming bills"))).toBe(true)
})

test("showUpcoming shows upcoming monthly subscription", async () => {
  const db = await import("../db.ts")
  // Create a subscription with billing day = 25 (tomorrow-ish)
  const today = new Date()
  const billingDay = today.getDate() + 1 > 28 ? 28 : today.getDate() + 1
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"], status: "active", billingDay, createdAt: "2026-01-15" })

  const { showUpcoming } = await import("../upcoming.ts")
  await showUpcoming(30)
  expect(logMessages.length).toBeGreaterThan(0)
  const output = logMessages.join("\n")
  expect(output).toContain("Netflix")
  expect(output).toContain("¥1,500")
})

test("showUpcoming excludes cancelled subscriptions", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Active", price: 100, currency: "USD", cycle: "monthly", tags: [], status: "active", billingDay: 28, createdAt: "2026-01-01" })
  db.writeSubscription({ name: "Cancelled", price: 200, currency: "USD", cycle: "monthly", tags: [], status: "cancelled", billingDay: 28, createdAt: "2026-01-01" })

  const { showUpcoming } = await import("../upcoming.ts")
  await showUpcoming(30)
  const output = logMessages.join("\n")
  expect(output).toContain("Active")
  expect(output).not.toContain("Cancelled")
})
