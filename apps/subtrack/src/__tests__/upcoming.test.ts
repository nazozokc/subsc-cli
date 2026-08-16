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

// ── calculateNextBilling / nextDateForCycle ─────────────

const baseSub = {
  id: 1,
  name: "Test",
  price: 1000,
  currency: "JPY",
  cycle: "monthly" as const,
  tags: [] as string[],
  status: "active" as const,
  billingDay: 15,
  createdAt: "2026-01-01",
  notes: null,
  paymentMethod: null,
  contractStart: null,
  contractEnd: null,
  autoRenewal: true,
  vendorName: null,
  vendorUrl: null,
  planTier: null,
  discountAmount: null,
  discountType: null,
}

test("monthly billing day 31 clamps to last day of short months", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  const sub = { ...baseSub, cycle: "monthly", billingDay: 31 }
  // Feb 10 -> next billing is Feb 28 (not Mar 3 via JS overflow)
  expect(calculateNextBilling(sub, new Date(2026, 1, 10))).toEqual(new Date(2026, 1, 28))
  // Apr 10 -> Apr 30
  expect(calculateNextBilling(sub, new Date(2026, 3, 10))).toEqual(new Date(2026, 3, 30))
  // May 1 -> May 31
  expect(calculateNextBilling(sub, new Date(2026, 4, 1))).toEqual(new Date(2026, 4, 31))
})

test("quarterly billing respects billingDay instead of createdAt day", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  // createdAt Jan 5, billingDay 20 -> next from Feb 1 is Apr 20 (not Mar 31 via clamp bug)
  const sub = { ...baseSub, cycle: "quarterly", billingDay: 20, createdAt: "2026-01-05" }
  expect(calculateNextBilling(sub, new Date(2026, 1, 1))).toEqual(new Date(2026, 3, 20))
  // From Apr 21 -> Jul 20
  expect(calculateNextBilling(sub, new Date(2026, 3, 21))).toEqual(new Date(2026, 6, 20))
})

test("quarterly without billingDay falls back to createdAt day", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  const sub = { ...baseSub, cycle: "quarterly", billingDay: null, createdAt: "2026-01-05" }
  expect(calculateNextBilling(sub, new Date(2026, 1, 1))).toEqual(new Date(2026, 3, 5))
  // Quarter boundary exactly at fromDate
  expect(calculateNextBilling(sub, new Date(2026, 3, 5))).toEqual(new Date(2026, 3, 5))
})

test("semi-annual billing respects billingDay", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  const sub = { ...baseSub, cycle: "semi-annual", billingDay: 10, createdAt: "2026-02-03" }
  expect(calculateNextBilling(sub, new Date(2026, 2, 1))).toEqual(new Date(2026, 7, 10))
})

test("weekly billing anchors on billingDay of the createdAt month", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  // createdAt Jan 5, billingDay 20 -> anchor Jan 20, then +7d steps
  const sub = { ...baseSub, cycle: "weekly", billingDay: 20, createdAt: "2026-01-05" }
  expect(calculateNextBilling(sub, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 3))
  // createdAt Jan 5, no billingDay -> anchor Jan 5
  const sub2 = { ...baseSub, cycle: "weekly", billingDay: null, createdAt: "2026-01-05" }
  expect(calculateNextBilling(sub2, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 2))
})

test("bi-weekly billing follows 14-day steps from anchor", async () => {
  const { calculateNextBilling } = await import("../upcoming.ts")
  const sub = { ...baseSub, cycle: "bi-weekly", billingDay: null, createdAt: "2026-01-05" }
  // Jan 5 + 2*14 = Feb 2
  expect(calculateNextBilling(sub, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 2))
})
