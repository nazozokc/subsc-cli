import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import type { SharedArgs } from "../types.ts"
import { today } from "../date-utils.ts"

let testDb: Database
let originalFetch: typeof globalThis.fetch

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

  const db = await import("../db.ts")
  db.__setDb(testDb)
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM llm_usage")
  testDb.run("DELETE FROM price_history")

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
  globalThis.fetch = originalFetch
})

afterAll(() => {
  testDb.close()
})

// Use dynamic import to keep module reference after __setDb
async function db() {
  return await import("../db.ts")
}

async function captureJson(fn: () => Promise<void> | void): Promise<unknown> {
  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await fn()
  } finally {
    process.stdout.write = origWrite
  }
  return JSON.parse(writes.join(""))
}

// ── handlePayment (JSON) ──────────────────────────────

test("handlePayment json returns empty result when no subscriptions", async () => {
  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true }))
  expect(out).toMatchObject({ period: "monthly", total: 0, subscriptions: [] })
})

test("handlePayment json sums monthly totals per subscription", async () => {
  const d = await db()
  d.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [] })
  d.writeSubscription({ name: "GitHub", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  d.writeSubscription({ name: "iCloud", price: 12000, currency: "JPY", cycle: "yearly", tags: [] })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true })) as {
    total: number
    subscriptions: { name: string; periodPrice: number }[]
  }

  // 1500 + 100 + 1000 (yearly prorated) — mixed currencies are summed as-is
  expect(out.total).toBe(1500 + 100 + 1000)
  expect(out.subscriptions).toHaveLength(3)
  const netflix = out.subscriptions.find((s) => s.name === "Netflix")
  expect(netflix?.periodPrice).toBe(1500)
})

test("handlePayment json excludes cancelled subscriptions", async () => {
  const d = await db()
  d.writeSubscription({ name: "Active", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  d.writeSubscription({ name: "Gone", price: 9999, currency: "JPY", cycle: "monthly", tags: [], status: "cancelled" })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true })) as {
    total: number
    subscriptions: { name: string }[]
  }

  expect(out.total).toBe(1000)
  expect(out.subscriptions.map((s) => s.name)).toEqual(["Active"])
})

test("handlePayment json converts to target currency", async () => {
  const d = await db()
  d.writeSubscription({ name: "Netflix", price: 1600, currency: "JPY", cycle: "monthly", tags: [] })
  d.writeSubscription({ name: "GitHub", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true, currency: "USD" })) as {
    total: number
    currency: string
  }

  expect(out.currency).toBe("USD")
  expect(out.total).toBe(10 + 100) // 1600 JPY → 10 USD
})

test("handlePayment json groups by payment method", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 1000, currency: "JPY", cycle: "monthly", tags: [], paymentMethod: "credit_card" })
  d.writeSubscription({ name: "B", price: 2000, currency: "JPY", cycle: "monthly", tags: [], paymentMethod: "credit_card" })
  d.writeSubscription({ name: "C", price: 500, currency: "JPY", cycle: "monthly", tags: [], paymentMethod: null })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true, method: true })) as {
    byMethod: Record<string, { total: number; currencies: string[]; byCurrency: Record<string, number> }>
  }

  expect(out.byMethod.credit_card.total).toBe(3000)
  expect(out.byMethod.credit_card.byCurrency).toEqual({ JPY: 3000 })
  expect(out.byMethod.unspecified.total).toBe(500)
})

test("handlePayment json byMethod keeps currencies separate when mixed", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 1000, currency: "JPY", cycle: "monthly", tags: [], paymentMethod: "card" })
  d.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [], paymentMethod: "card" })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true, method: true })) as {
    byMethod: Record<string, { total: number; currencies: string[]; byCurrency: Record<string, number> }>
  }

  expect(out.byMethod.card.total).toBe(1000 + 100) // raw sum, documented as such
  expect(out.byMethod.card.currencies.sort()).toEqual(["JPY", "USD"])
  expect(out.byMethod.card.byCurrency).toEqual({ JPY: 1000, USD: 100 })
})

test("handlePayment json byMethod converts when target currency is set", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 1600, currency: "JPY", cycle: "monthly", tags: [], paymentMethod: "card" })
  d.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [], paymentMethod: "card" })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true, method: true, currency: "USD" })) as {
    total: number
    currency: string
    byMethod: Record<string, { total: number; currencies: string[]; byCurrency: Record<string, number> }>
  }

  expect(out.currency).toBe("USD")
  expect(out.total).toBe(10 + 100)
  expect(out.byMethod.card.total).toBe(10 + 100)
  expect(out.byMethod.card.byCurrency).toEqual({ USD: 110 })
})

test("handlePayment json includes API usage when requested", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  d.addLlmUsage({
    provider: "openai", model: "gpt-4o", input_tokens: 1000, output_tokens: 500,
    cost: 1.25, date: today(), description: null,
  })

  const { handlePayment } = await import("../payment.ts")
  const out = await captureJson(() => handlePayment("monthly", { json: true, api: true })) as {
    apiUsage: { total: number; byProvider: { provider: string; total: number }[] }
  }

  expect(out.apiUsage.total).toBe(1.25)
  expect(out.apiUsage.byProvider).toEqual([{ provider: "openai", total: 1.25 }])
})

// ── handleSummary (JSON) ──────────────────────────────

test("handleSummary json returns summary data", async () => {
  const d = await db()
  d.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] })
  d.writeSubscription({ name: "iCloud", price: 12000, currency: "JPY", cycle: "yearly", tags: ["storage"] })
  d.writeSubscription({ name: "Spotify", price: 980, currency: "JPY", cycle: "monthly", tags: ["video", "music"] })

  const { handleSummary } = await import("../payment.ts")
  const out = await captureJson(() => handleSummary({ json: true })) as {
    totalCount: number
    monthlyByCurrency: Record<string, number>
    monthlyByTag: Record<string, { count: number; monthly: Record<string, number> }>
    mostExpensive: { name: string } | undefined
  }

  expect(out.totalCount).toBe(3)
  expect(out.monthlyByCurrency.JPY).toBe(1500 + 1000 + 980)
  expect(out.monthlyByTag.video.count).toBe(2)
  expect(out.monthlyByTag.video.monthly.JPY).toBe(1500 + 980)
  // mostExpensive compares raw price (not monthly-adjusted): iCloud yearly = 12000
  expect(out.mostExpensive?.name).toBe("iCloud")
})

test("handleSummary json excludes cancelled subscriptions", async () => {
  const d = await db()
  d.writeSubscription({ name: "Active", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  d.writeSubscription({ name: "Gone", price: 9999, currency: "JPY", cycle: "monthly", tags: [], status: "cancelled" })

  const { handleSummary } = await import("../payment.ts")
  const out = await captureJson(() => handleSummary({ json: true })) as {
    totalCount: number
    monthlyByCurrency: Record<string, number>
  }

  expect(out.totalCount).toBe(1)
  expect(out.monthlyByCurrency).toEqual({ JPY: 1000 })
})

// ── calcSubTotal ──────────────────────────────────────

function makeSub(overrides: Partial<SharedArgs> = {}): SharedArgs {
  return {
    id: 1,
    name: "S",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    tags: [],
    status: "active",
    billingDay: null,
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
    ...overrides,
  }
}

test("calcSubTotal sums per currency", async () => {
  const { calcSubTotal } = await import("../payment.ts")
  const totals = calcSubTotal(
    [
      makeSub({ id: 1, name: "A", price: 1000, currency: "JPY" }),
      makeSub({ id: 2, name: "B", price: 12000, currency: "JPY", cycle: "yearly" }),
      makeSub({ id: 3, name: "C", price: 50, currency: "USD" }),
    ],
    null,
    undefined,
  )
  expect(totals).toEqual({ JPY: 1000 + 1000, USD: 50 })
})

test("calcSubTotal excludes cancelled subscriptions", async () => {
  const { calcSubTotal } = await import("../payment.ts")
  const totals = calcSubTotal(
    [
      makeSub({ id: 1, name: "A", price: 1000, currency: "JPY" }),
      makeSub({ id: 2, name: "B", price: 9999, currency: "JPY", status: "cancelled" }),
    ],
    null,
    undefined,
  )
  expect(totals).toEqual({ JPY: 1000 })
})

test("calcSubTotal converts to target currency with rates", async () => {
  const { calcSubTotal } = await import("../payment.ts")
  const rates = { base: "USD", rates: { JPY: 160, USD: 1 } }
  const totals = calcSubTotal(
    [
      makeSub({ id: 1, name: "A", price: 1600, currency: "JPY" }),
      makeSub({ id: 2, name: "B", price: 100, currency: "USD" }),
    ],
    rates,
    "USD",
  )
  expect(totals).toEqual({ USD: 10 + 100 })
})

// ── calcPreviousTotals ────────────────────────────────

test("calcPreviousTotals uses historical price when available", async () => {
  const d = await db()
  const id = d.writeSubscription({ name: "A", price: 2000, currency: "JPY", cycle: "monthly", tags: [] })

  const { calcPreviousTotals } = await import("../payment.ts")
  // Price change: old 1000 → new 2000
  testDb.run(
    "INSERT INTO price_history (subscription_id, old_price, new_price, new_currency) VALUES (?, ?, ?, 'JPY')",
    [id, 1000, 2000],
  )

  const subs = d.getSubscriptions()
  const totals = calcPreviousTotals(subs, null, undefined)
  expect(totals).toEqual({ JPY: 1000 })
})

test("calcPreviousTotals falls back to current price without history", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 2000, currency: "JPY", cycle: "monthly", tags: [] })

  const { calcPreviousTotals } = await import("../payment.ts")
  const totals = calcPreviousTotals(d.getSubscriptions(), null, undefined)
  expect(totals).toEqual({ JPY: 2000 })
})

test("calcPreviousTotals excludes cancelled subscriptions", async () => {
  const d = await db()
  d.writeSubscription({ name: "A", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  const cancelledId = d.writeSubscription({ name: "B", price: 9999, currency: "JPY", cycle: "monthly", tags: [], status: "cancelled" })

  const { calcPreviousTotals } = await import("../payment.ts")
  testDb.run(
    "INSERT INTO price_history (subscription_id, old_price, new_price, new_currency) VALUES (?, ?, ?, 'JPY')",
    [cancelledId, 500, 9999],
  )

  const totals = calcPreviousTotals(d.getSubscriptions(), null, undefined)
  expect(totals).toEqual({ JPY: 1000 })
})
