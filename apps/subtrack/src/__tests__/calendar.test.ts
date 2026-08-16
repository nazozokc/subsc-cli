import { test, expect, beforeEach, afterEach, beforeAll } from "vitest"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"

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
})

afterEach(() => {
  consola.mockTypes()
})

// ── calcCalendarEntries ─────────────────────────────────

test("monthly subscription appears every month on billing day", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: 15, createdAt: "2026-01-01" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  for (const month of [1, 2, 3, 12]) {
    const entries = calcCalendarEntries(month, 2026)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.day).toBe(15)
    expect(entries[0]!.subs[0]!.name).toBe("Netflix")
  }
})

test("yearly subscription appears only in the anchor month", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Annual", price: 12000, currency: "JPY", cycle: "yearly", tags: [], status: "active", billingDay: 10, createdAt: "2026-03-05" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  expect(calcCalendarEntries(1, 2026)).toEqual([])
  expect(calcCalendarEntries(2, 2026)).toEqual([])
  const mar = calcCalendarEntries(3, 2026)
  expect(mar).toHaveLength(1)
  expect(mar[0]!.day).toBe(10)
  expect(calcCalendarEntries(4, 2026)).toEqual([])
  // Also next year's anchor month
  const marNext = calcCalendarEntries(3, 2027)
  expect(marNext).toHaveLength(1)
  expect(marNext[0]!.day).toBe(10)
})

test("quarterly subscription appears every 3 months from anchor month", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Quarterly", price: 3000, currency: "JPY", cycle: "quarterly", tags: [], status: "active", billingDay: 5, createdAt: "2026-02-03" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  expect(calcCalendarEntries(1, 2026)).toEqual([])
  expect(calcCalendarEntries(2, 2026).map((e) => e.day)).toEqual([5])
  expect(calcCalendarEntries(3, 2026)).toEqual([])
  expect(calcCalendarEntries(4, 2026)).toEqual([])
  expect(calcCalendarEntries(5, 2026).map((e) => e.day)).toEqual([5])
  expect(calcCalendarEntries(8, 2026).map((e) => e.day)).toEqual([5])
  expect(calcCalendarEntries(11, 2026).map((e) => e.day)).toEqual([5])
})

test("semi-annual subscription appears every 6 months from anchor month", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Semi", price: 6000, currency: "JPY", cycle: "semi-annual", tags: [], status: "active", billingDay: 20, createdAt: "2026-01-31" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  expect(calcCalendarEntries(1, 2026).map((e) => e.day)).toEqual([20])
  expect(calcCalendarEntries(7, 2026).map((e) => e.day)).toEqual([20])
  expect(calcCalendarEntries(2, 2026)).toEqual([])
  expect(calcCalendarEntries(1, 2027).map((e) => e.day)).toEqual([20])
})

test("weekly subscription appears on each billing day in the month", async () => {
  const db = await import("../db.ts")
  // createdAt Jan 5 (Monday), billingDay 5 -> anchor Jan 5, +7d steps
  db.writeSubscription({ name: "Weekly", price: 500, currency: "JPY", cycle: "weekly", tags: [], status: "active", billingDay: 5, createdAt: "2026-01-05" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  // Jan 2026: anchor Jan 5, then Jan 12, 19, 26
  const jan = calcCalendarEntries(1, 2026)
  expect(jan.map((e) => e.day)).toEqual([5, 12, 19, 26])
  // Feb 2026: Feb 2, 9, 16, 23
  const feb = calcCalendarEntries(2, 2026)
  expect(feb.map((e) => e.day)).toEqual([2, 9, 16, 23])
})

test("calendar falls back to createdAt day when billingDay is unset", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "NoDay", price: 1000, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: null, createdAt: "2026-01-17" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  expect(calcCalendarEntries(3, 2026).map((e) => e.day)).toEqual([17])
})

test("day 31 clamps to last day of short months", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "EndOfMonth", price: 1000, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: 31, createdAt: "2026-01-01" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  expect(calcCalendarEntries(1, 2026).map((e) => e.day)).toEqual([31])
  expect(calcCalendarEntries(2, 2026).map((e) => e.day)).toEqual([28])
  expect(calcCalendarEntries(4, 2026).map((e) => e.day)).toEqual([30])
})

test("cancelled subscriptions are excluded", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Active", price: 100, currency: "USD", cycle: "monthly", tags: [], status: "active", billingDay: 10, createdAt: "2026-01-01" })
  db.writeSubscription({ name: "Cancelled", price: 200, currency: "USD", cycle: "monthly", tags: [], status: "cancelled", billingDay: 10, createdAt: "2026-01-01" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  const entries = calcCalendarEntries(5, 2026)
  expect(entries).toHaveLength(1)
  expect(entries[0]!.subs.map((s) => s.name)).toEqual(["Active"])
})

test("paused subscriptions are included", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Paused", price: 100, currency: "USD", cycle: "monthly", tags: [], status: "paused", billingDay: 10, createdAt: "2026-01-01" })

  const { calcCalendarEntries } = await import("../calendar.ts")
  const entries = calcCalendarEntries(5, 2026)
  expect(entries).toHaveLength(1)
  expect(entries[0]!.subs[0]!.name).toBe("Paused")
})