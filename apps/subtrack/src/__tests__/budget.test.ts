import { test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const logMessages: string[] = []
const infoMessages: string[] = []
const errorMessages: string[] = []
const warnMessages: string[] = []

let originalEnv: string | undefined
let originalFetch: typeof globalThis.fetch

let SQL: Awaited<ReturnType<typeof initSqlJs>>
let testDb: Database

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  // Isolate config to a temporary directory
  originalEnv = process.env.SUBSC_CLI_DB_DIR
  const testConfigDir = mkdtempSync(join(tmpdir(), "subtrack-budget-"))
  process.env.SUBSC_CLI_DB_DIR = testConfigDir

  logMessages.length = 0
  infoMessages.length = 0
  errorMessages.length = 0
  warnMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "info") infoMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
      if (_type === "warn") warnMessages.push(clean)
    }
  })

  // Fresh in-memory DB
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
  const dbMod = await import("../db.ts")
  dbMod.__setDb(testDb)

  // Reset config cache
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
  const { resetConfig } = vi.importActual("../config.ts") as never
  void resetConfig
})

afterAll(() => {
  testDb.close()
})

// ── Helper ─────────────────────────────────────────────

function insertSub(overrides: Record<string, unknown> = {}): number {
  const db = testDb
  const fields = {
    name: "Test Sub",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    status: "active",
    billingDay: 1,
    createdAt: "2026-01-01",
    ...overrides,
  }
  db.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [fields.name, fields.price, fields.currency, fields.cycle, fields.status, fields.billingDay, fields.createdAt],
  )
  const row = db.exec("SELECT last_insert_rowid() AS id")
  const id = Number(row[0].values[0][0])

  const tags = (overrides.tags as string[] | undefined) ?? []
  for (const t of tags) {
    db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t])
    const tagRow = db.exec("SELECT id FROM tags WHERE name = ?", [t])
    const tagId = Number(tagRow[0].values[0][0])
    db.run("INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?, ?)", [id, tagId])
  }
  return id
}

async function setConfig(patch: Record<string, unknown>): Promise<void> {
  const { loadConfig, saveConfig } = await import("../config.ts")
  const config = loadConfig()
  Object.assign(config, patch)
  saveConfig(config)
}

// ── resolveBudget ──────────────────────────────────────

test("resolveBudget returns null when no budget set", async () => {
  const { resolveBudget } = await import("../budget.ts")
  expect(resolveBudget("monthly")).toBeNull()
  expect(resolveBudget("yearly")).toBeNull()
})

test("resolveBudget reads monthlyBudget from config", async () => {
  await setConfig({ monthlyBudget: 5000, defaultCurrency: "JPY" })
  const { resolveBudget } = await import("../budget.ts")
  const budget = resolveBudget("monthly")
  expect(budget).toEqual({ name: null, amount: 5000, currency: "JPY" })
})

test("resolveBudget yearly falls back to monthlyBudget * 12", async () => {
  await setConfig({ monthlyBudget: 5000, defaultCurrency: "JPY" })
  const { resolveBudget } = await import("../budget.ts")
  expect(resolveBudget("yearly")).toEqual({ name: null, amount: 60000, currency: "JPY" })
})

test("resolveBudget uses yearlyBudget when set", async () => {
  await setConfig({ monthlyBudget: 5000, yearlyBudget: 100000, defaultCurrency: "JPY" })
  const { resolveBudget } = await import("../budget.ts")
  expect(resolveBudget("yearly")?.amount).toBe(100000)
})

test("resolveBudget finds named budget with categories", async () => {
  await setConfig({
    budgets: [{ name: "streaming", amount: 3000, currency: "JPY", categories: ["video"] }],
  })
  const { resolveBudget } = await import("../budget.ts")
  expect(resolveBudget("monthly", "streaming")).toEqual({
    name: "streaming",
    amount: 3000,
    currency: "JPY",
    categories: ["video"],
  })
  expect(resolveBudget("monthly", "unknown")).toBeNull()
})

// ── convertTotals ──────────────────────────────────────

test("convertTotals converts per-currency totals to target", async () => {
  const { convertTotals } = await import("../budget.ts")
  const rates = { base: "USD", rates: { JPY: 160, USD: 1 } }
  const { sum, missing } = convertTotals({ JPY: 1600, USD: 1 }, "USD", rates)
  expect(missing).toBe(false)
  expect(sum).toBe(11)
})

test("convertTotals flags missing rates", async () => {
  const { convertTotals } = await import("../budget.ts")
  const rates = { base: "USD", rates: { USD: 1 } }
  const { sum, missing } = convertTotals({ XYZ: 100 }, "USD", rates)
  expect(missing).toBe(true)
  expect(sum).toBe(0)
})

// ── handleBudget ───────────────────────────────────────

test("handleBudget shows info when no budget set", async () => {
  const { handleBudget } = await import("../budget.ts")
  await handleBudget({})
  expect(infoMessages.some((m) => m.includes("No budget set"))).toBe(true)
  expect(process.exitCode).not.toBe(1)
})

test("handleBudget JSON when no budget set", async () => {
  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({ json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.set).toBe(false)
  expect(parsed.period).toBe("monthly")
})

test("handleBudget shows remaining when under budget", async () => {
  await setConfig({ monthlyBudget: 5000, defaultCurrency: "JPY" })
  insertSub({ name: "Netflix", price: 1000, currency: "JPY" })

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({})
  expect(logMessages.some((m) => m.includes("Monthly spending: ¥1,000/month"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Budget: ¥5,000/month"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Remaining: ¥4,000"))).toBe(true)
  expect(process.exitCode).not.toBe(1)
})

test("handleBudget --check exits 1 when over budget", async () => {
  await setConfig({ monthlyBudget: 5000, defaultCurrency: "JPY" })
  insertSub({ name: "Netflix", price: 1000, currency: "JPY" })
  insertSub({ name: "Spotify", price: 3000, currency: "JPY" })
  insertSub({ name: "AWS", price: 2000, currency: "JPY" })

  const prevExit = process.exitCode
  const { handleBudget } = await import("../budget.ts")
  await handleBudget({ check: true })
  expect(logMessages.some((m) => m.includes("Over budget: ¥1,000"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = prevExit
})

test("handleBudget yearly period uses yearly budget", async () => {
  await setConfig({ yearlyBudget: 60000, defaultCurrency: "JPY" })
  insertSub({ name: "Netflix", price: 1000, currency: "JPY" })

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({ period: "yearly" })
  expect(logMessages.some((m) => m.includes("Yearly spending: ¥12,000/year"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Budget: ¥60,000/year"))).toBe(true)
})

test("handleBudget converts currencies when budget currency differs", async () => {
  await setConfig({ monthlyBudget: 100, defaultCurrency: "USD" })
  insertSub({ name: "Netflix", price: 1600, currency: "JPY" })

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({})
  // JPY 1600 = USD 10 at rate 160
  expect(logMessages.some((m) => m.includes("$10/month"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Over budget"))).toBe(false)
})

test("handleBudget JSON output shape", async () => {
  await setConfig({ monthlyBudget: 5000, defaultCurrency: "JPY" })
  insertSub({ name: "Netflix", price: 1000, currency: "JPY" })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({ json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed).toMatchObject({
    set: true,
    period: "monthly",
    budgetName: null,
    budget: 5000,
    budgetCurrency: "JPY",
    spending: 1000,
    currency: "JPY",
    remaining: 4000,
    over: false,
  })
})

test("handleBudget named budget filters by categories", async () => {
  await setConfig({
    budgets: [{ name: "streaming", amount: 3000, currency: "JPY", categories: ["video"] }],
  })
  insertSub({ name: "Netflix", price: 2500, currency: "JPY", tags: ["video"] })
  insertSub({ name: "AWS", price: 5000, currency: "JPY", tags: ["infra"] })

  const { handleBudget } = await import("../budget.ts")
  await handleBudget({ name: "streaming" })
  // Only the video-tagged sub counts toward the streaming budget
  expect(logMessages.some((m) => m.includes("Monthly spending: ¥2,500/month"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Remaining: ¥500"))).toBe(true)
})

test("handleBudget named budget uses its own period", async () => {
  await setConfig({
    budgets: [{ name: "infra", amount: 60000, currency: "JPY", period: "yearly" }],
  })
  insertSub({ name: "AWS", price: 5000, currency: "JPY" })

  const { handleBudget } = await import("../budget.ts")
  // No explicit period — the named budget's own period (yearly) wins
  await handleBudget({ name: "infra" })
  expect(logMessages.some((m) => m.includes("Yearly spending: ¥60,000/year"))).toBe(true)
  expect(logMessages.some((m) => m.includes("Budget (infra): ¥60,000/year"))).toBe(true)
})