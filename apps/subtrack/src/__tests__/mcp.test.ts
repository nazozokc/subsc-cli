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

describe("MCP input validation", () => {
  test("validateArgs rejects oversized bulk_operations filter_name", async () => {
    const { validateArgs, INPUT_VALIDATIONS } = await import("../mcp/security.ts")
    const err = validateArgs(
      { action: "status", filter_name: "x".repeat(5000) },
      INPUT_VALIDATIONS.bulk_operations!,
    )
    expect(err).toMatch(/too long/)
  })

  test("validateArgs rejects wrong types for previously-uncovered tools", async () => {
    const { validateArgs, INPUT_VALIDATIONS } = await import("../mcp/security.ts")
    // list_subscriptions desc must be boolean
    const err = validateArgs(
      { desc: "yes" },
      INPUT_VALIDATIONS.list_subscriptions!,
    )
    expect(err).toMatch(/boolean/)
    // get_forecast currency must be a short string
    const err2 = validateArgs(
      { currency: "A".repeat(100) },
      INPUT_VALIDATIONS.get_forecast!,
    )
    expect(err2).toMatch(/too long/)
  })

  test("every registered tool has an input validation schema", async () => {
    const { INPUT_VALIDATIONS } = await import("../mcp/security.ts")
    const { TOOLS } = await import("../mcp/tools.ts")
    for (const tool of TOOLS) {
      expect(INPUT_VALIDATIONS[tool.name], `missing schema for ${tool.name}`).toBeDefined()
    }
  })
})

describe("MCP handlers", () => {
  test("handleAddSubscription validates cycle and status enums", async () => {
    const { handleAddSubscription } = await import("../mcp/handlers.ts")
    const badCycle = await handleAddSubscription({
      name: "X", price: 100, currency: "USD", cycle: "fortnightly",
    })
    expect(badCycle.isError).toBe(true)
    expect(JSON.stringify(badCycle)).toMatch(/Invalid cycle/)

    const badStatus = await handleAddSubscription({
      name: "X", price: 100, currency: "USD", cycle: "monthly", status: "deleted",
    })
    expect(badStatus.isError).toBe(true)
    expect(JSON.stringify(badStatus)).toMatch(/Invalid status/)

    const badCurrency = await handleAddSubscription({
      name: "X", price: 100, currency: "XX", cycle: "monthly",
    })
    expect(badCurrency.isError).toBe(true)
    expect(JSON.stringify(badCurrency)).toMatch(/Invalid currency/)

    const ok = await handleAddSubscription({
      name: "Valid", price: 100, currency: "USD", cycle: "monthly", status: "paused",
    })
    expect(ok.isError).toBeUndefined()
  })

  test("handleEditSubscription validates enums", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01')`,
    )
    const { handleEditSubscription } = await import("../mcp/handlers.ts")
    const bad = await handleEditSubscription({ id: 1, cycle: "fortnightly" })
    expect(bad.isError).toBe(true)
    expect(JSON.stringify(bad)).toMatch(/Invalid cycle/)
    const badStatus = await handleEditSubscription({ id: 1, status: "deleted" })
    expect(badStatus.isError).toBe(true)
  })

  test("handleGetAnalytics includes statusBreakdown distinct from summary", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'paused', 1, '2026-01-10'),
              (3, 'Old', 500, 'JPY', 'monthly', 'cancelled', 5, '2026-03-01'),
              (4, 'Legacy', 300, 'JPY', 'monthly', 'archived', 5, '2026-03-01')`,
    )
    const { handleGetAnalytics } = await import("../mcp/handlers.ts")
    const res = await handleGetAnalytics({})
    const data = JSON.parse(res.content[0].text)
    expect(data.statusBreakdown).toEqual({ active: 1, paused: 1, cancelled: 1, archived: 1 })
    expect(data.totalCount).toBe(2) // cancelled excluded from summary
  })

  test("handleListSubscriptions supports limit and offset", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'A', 100, 'USD', 'monthly', 'active', 1, '2026-01-01'),
              (2, 'B', 200, 'USD', 'monthly', 'active', 1, '2026-01-01'),
              (3, 'C', 300, 'USD', 'monthly', 'active', 1, '2026-01-01')`,
    )
    const { handleListSubscriptions } = await import("../mcp/handlers.ts")
    const res = await handleListSubscriptions({ limit: 2 })
    const data = JSON.parse(res.content[0].text)
    expect(data).toHaveLength(2)
    const res2 = await handleListSubscriptions({ limit: 2, offset: 2 })
    const data2 = JSON.parse(res2.content[0].text)
    expect(data2).toHaveLength(1)
    expect(data2[0].name).toBe("C")
  })

  test("handleListTags returns tags with counts", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'active', 1, '2026-01-10')`,
    )
    testDb.run(`INSERT INTO tags (id, name) VALUES (1, 'video'), (2, 'music'), (3, 'work')`)
    testDb.run(`INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (1, 1), (2, 2), (1, 3)`)

    const { handleListTags } = await import("../mcp/handlers.ts")
    const res = await handleListTags({})
    const data = JSON.parse(res.content[0].text)
    expect(data).toEqual([
      { name: "music", count: 1 },
      { name: "video", count: 1 },
      { name: "work", count: 1 },
    ])
  })

  test("handleGetTagSubscriptions filters by tags", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'active', 1, '2026-01-10')`,
    )
    testDb.run(`INSERT INTO tags (id, name) VALUES (1, 'video'), (2, 'music')`)
    testDb.run(`INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (1, 1), (2, 2)`)

    const { handleGetTagSubscriptions } = await import("../mcp/handlers.ts")
    const res = await handleGetTagSubscriptions({ tag: "video" })
    const data = JSON.parse(res.content[0].text)
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe("Netflix")

    const noTag = await handleGetTagSubscriptions({})
    expect(noTag.isError).toBe(true)
  })

  test("handleGetUsageTotal aggregates tokens and models", async () => {
    const db = await import("../db.ts")
    testDb.run(`CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      description TEXT,
      generation_id TEXT
    )`)
    testDb.run("DELETE FROM llm_usage")
    db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-08-01", description: null })
    db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 200, output_tokens: 100, cost: 2.0, date: "2026-08-02", description: null })

    const { handleGetUsageTotal } = await import("../mcp/handlers.ts")
    const res = await handleGetUsageTotal({ from: "2026-08-01", to: "2026-08-31" })
    const data = JSON.parse(res.content[0].text)
    expect(data.total).toBe(3.0)
    expect(data.tokens).toEqual({ inputTokens: 300, outputTokens: 150 })
    expect(data.byModel).toHaveLength(1)
    expect(data.byModel[0].model).toBe("gpt-4o")
  })

  test("handleListUsage lists entries with filters", async () => {
    const db = await import("../db.ts")
    testDb.run(`CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      description TEXT,
      generation_id TEXT
    )`)
    testDb.run("DELETE FROM llm_usage")
    db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-08-01", description: null })
    db.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-08-02", description: null })

    const { handleListUsage } = await import("../mcp/handlers.ts")
    const res = await handleListUsage({ provider: "openai" })
    const data = JSON.parse(res.content[0].text)
    expect(data).toHaveLength(1)
    expect(data[0].provider).toBe("openai")
  })

  test("handleBulkOperations reports errors instead of swallowing them", async () => {
    testDb.run(
      `INSERT INTO subscriptions (id, name, price, currency, cycle, status, billing_day, created_at)
       VALUES (1, 'Netflix', 1990, 'JPY', 'monthly', 'active', 15, '2026-01-01'),
              (2, 'Spotify', 980, 'JPY', 'monthly', 'active', 1, '2026-01-10')`,
    )
    const { handleBulkOperations } = await import("../mcp/handlers.ts")
    const res = await handleBulkOperations({ action: "status", status: "invalid-status" })
    expect(res.isError).toBe(true)
    expect(JSON.stringify(res)).toMatch(/Invalid status/)
  })
})
