import { test, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))

vi.mock("@inquirer/prompts", () => ({
  confirm: confirmMock,
}))

const logMessages: string[] = []
const infoMessages: string[] = []
const errorMessages: string[] = []
const successMessages: string[] = []
const warnMessages: string[] = []

let SQL: Awaited<ReturnType<typeof initSqlJs>>
let testDb: Database

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  logMessages.length = 0
  infoMessages.length = 0
  errorMessages.length = 0
  successMessages.length = 0
  warnMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "info") infoMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
      if (_type === "success") successMessages.push(clean)
      if (_type === "warn") warnMessages.push(clean)
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
    "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target_type TEXT, target_id INTEGER, details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  )

  const dbMod = await import("../db.ts")
  dbMod.__setDb(testDb)
})

afterEach(() => {
  consola.mockTypes()
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
    notes: null,
    contractEnd: null,
    ...overrides,
  }
  testDb.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at, notes, contract_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [fields.name, fields.price, fields.currency, fields.cycle, fields.status, fields.billingDay, fields.createdAt, fields.notes, fields.contractEnd],
  )
  const row = testDb.exec("SELECT last_insert_rowid() AS id")
  return Number(row[0].values[0][0])
}

function getSub(id: number): Record<string, unknown> {
  const db = testDb
  const rows = db.exec("SELECT * FROM subscriptions WHERE id = ?", [id])
  if (!rows.length || !rows[0].values.length) return {}
  const { columns, values } = rows[0]
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < columns.length; i++) obj[columns[i]!] = values[0]![i]
  return obj
}

// ── handleCancel: --force ──────────────────────────────

test("cancel --force sets status to cancelled and contractEnd", async () => {
  const id = insertSub({ name: "Netflix" })

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { force: true })

  const sub = getSub(id)
  expect(sub.status).toBe("cancelled")
  expect(sub.contract_end).toBeTruthy()
  expect(successMessages.some((m) => m.includes("Cancelled: \"Netflix\""))).toBe(true)
})

test("cancel --force keeps existing contractEnd", async () => {
  const id = insertSub({ name: "Netflix", contractEnd: "2026-12-31" })

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { force: true })

  expect(getSub(id).contract_end).toBe("2026-12-31")
})

test("cancel --force writes an audit entry", async () => {
  const id = insertSub({ name: "Spotify" })

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { force: true })

  const rows = testDb.exec("SELECT action FROM audit_log WHERE target_id = ?", [id])
  expect(rows.length).toBeGreaterThan(0)
  expect(String(rows[0]!.values[0]![0])).toBe("subscription.cancel")
})

test("cancel fails for unknown id", async () => {
  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(999, { force: true })
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = 0
})

test("cancel reports already-cancelled subscriptions", async () => {
  const id = insertSub({ name: "Netflix", status: "cancelled" })

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { force: true })
  expect(infoMessages.some((m) => m.includes("already cancelled"))).toBe(true)
})

test("cancel refuses archived subscriptions", async () => {
  const id = insertSub({ name: "Netflix", status: "archived" })

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { force: true })
  expect(infoMessages.some((m) => m.includes("archived"))).toBe(true)
})

// ── handleCancel: --json ───────────────────────────────

test("cancel --json outputs subscription info without changes", async () => {
  const id = insertSub({ name: "Netflix", price: 1500 })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id, { json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed).toMatchObject({
    id,
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    status: "active",
  })
  expect(parsed.cancellationDate).toBeTruthy()
  // No change made
  expect(getSub(id).status).toBe("active")
})

// ── handleCancel: interactive checklist ────────────────

test("cancel aborts when final confirmation is declined", async () => {
  const id = insertSub({ name: "Netflix" })

  confirmMock
    .mockReset()
    .mockResolvedValueOnce(false) // export data
    .mockResolvedValueOnce(true)  // alternatives checked
    .mockResolvedValueOnce(true)  // note cancellation date
    .mockResolvedValueOnce(false) // final confirm

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id)

  expect(infoMessages.some((m2) => m2.includes("Aborted"))).toBe(true)
  expect(getSub(id).status).toBe("active")
})

test("cancel completes checklist flow and updates subscription", async () => {
  const id = insertSub({ name: "Netflix", notes: "Family plan" })

  confirmMock
    .mockReset()
    .mockResolvedValueOnce(false) // export data
    .mockResolvedValueOnce(true)  // alternatives checked
    .mockResolvedValueOnce(true)  // note cancellation date
    .mockResolvedValueOnce(true)  // final confirm

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id)

  const sub = getSub(id)
  expect(sub.status).toBe("cancelled")
  expect(String(sub.notes)).toContain("Cancelled:")
  expect(String(sub.notes)).toContain("Family plan")
})

test("cancel does not add note when declined", async () => {
  const id = insertSub({ name: "Netflix", notes: "Keep notes" })

  confirmMock
    .mockReset()
    .mockResolvedValueOnce(false) // export data
    .mockResolvedValueOnce(true)  // alternatives checked
    .mockResolvedValueOnce(false) // note cancellation date
    .mockResolvedValueOnce(true)  // final confirm

  const { handleCancel } = await import("../cancel.ts")
  await handleCancel(id)

  expect(getSub(id).notes).toBe("Keep notes")
})