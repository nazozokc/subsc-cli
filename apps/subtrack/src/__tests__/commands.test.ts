import { test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// Mock consola to capture output
vi.mock("consola", () => {
  const logMessages: string[] = []
  const infoMessages: string[] = []
  const successMessages: string[] = []
  const errorMessages: string[] = []
  const failMessages: string[] = []
  const warnMessages: string[] = []

  // Expose for test assertions
  const _consola = { logMessages, infoMessages, successMessages, errorMessages, failMessages, warnMessages }

  const makeFn = (arr: string[]) => (...args: unknown[]) => {
    const str = args.map((a) => String(a)).join(" ")
    arr.push(str)
  }

  return {
    ..._consola,
    default: {
      log: makeFn(logMessages),
      info: makeFn(infoMessages),
      success: makeFn(successMessages),
      error: makeFn(errorMessages),
      fail: makeFn(failMessages),
      warn: makeFn(warnMessages),
    },
    consola: {
      log: makeFn(logMessages),
      info: makeFn(infoMessages),
      success: makeFn(successMessages),
      error: makeFn(errorMessages),
      fail: makeFn(failMessages),
      warn: makeFn(warnMessages),
    },
  }
})

// Mock pricing module for LLM usage tests
vi.mock("../pricing.ts", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ensurePricingCache: vi.fn().mockResolvedValue({
      "gpt-4o": {
        input_cost_per_token: 2.5e-6,
        output_cost_per_token: 1e-5,
        litellm_provider: "openai",
      },
    }),
    calculateCostCents: vi.fn().mockReturnValue(0.75),
  }
})

// Mock scanner system for handleUsageRefresh tests
vi.mock("../scanner.ts", () => ({
  runAllScanners: vi.fn().mockReturnValue({ source: "combined", entries: [] }),
  registerScanner: vi.fn(),
  getRegisteredScanners: vi.fn().mockReturnValue([]),
}))

// Mock @inquirer/prompts to avoid interactive prompts
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  checkbox: vi.fn(),
  select: vi.fn(),
  search: vi.fn(),
}))

import { input, confirm, checkbox, select, search } from "@inquirer/prompts"
import { consola, logMessages, infoMessages, successMessages, errorMessages, failMessages, warnMessages } from "consola"

let testDb: Database
let tmpDir: string

let originalFetch: typeof globalThis.fetch
let exitSpy: ReturnType<typeof vi.spyOn>

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
  testDb.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_generation_id ON llm_usage(generation_id)")
  testDb.run(`CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    price INTEGER,
    currency TEXT,
    cycle TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (date('now'))
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

  originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }),
    )

  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    // prevent process.exit from killing the test runner
  }) as () => never)
})

beforeEach(() => {
  testDb.run("DELETE FROM price_history")
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM llm_usage")

  logMessages.length = 0
  infoMessages.length = 0
  successMessages.length = 0
  errorMessages.length = 0
  failMessages.length = 0
  warnMessages.length = 0

  vi.mocked(input).mockReset().mockResolvedValue("")
  vi.mocked(confirm).mockReset().mockResolvedValue(true)
  vi.mocked(checkbox).mockReset().mockResolvedValue([])
  vi.mocked(select).mockReset()
  vi.mocked(search).mockReset().mockResolvedValue("gpt-4o")
})

afterAll(() => {
  testDb.close()
  globalThis.fetch = originalFetch
  exitSpy.mockRestore()
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

// ── Helpers ──────────────────────────────────────────────

function createTempDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  return tmpDir
}

function writeTempFile(filename: string, content: string): string {
  const dir = tmpDir || createTempDir()
  const filePath = join(dir, filename)
  writeFileSync(filePath, content, "utf-8")
  return filePath
}

// ── parseCsvLine ─────────────────────────────────────────

test("parseCsvLine parses simple fields", async () => {
  const { parseCsvLine } = await import("../import-csv.ts")
  const result = parseCsvLine("a,b,c")
  expect(result).toEqual(["a", "b", "c"])
})

test("parseCsvLine handles quoted fields with commas", async () => {
  const { parseCsvLine } = await import("../import-csv.ts")
  const result = parseCsvLine('"a,b",c')
  expect(result).toEqual(["a,b", "c"])
})

test("parseCsvLine handles escaped quotes", async () => {
  const { parseCsvLine } = await import("../import-csv.ts")
  const result = parseCsvLine('"say ""hello""",end')
  expect(result).toEqual(['say "hello"', "end"])
})

test("parseCsvLine handles empty fields", async () => {
  const { parseCsvLine } = await import("../import-csv.ts")
  const result = parseCsvLine("a,,c,")
  expect(result).toEqual(["a", "", "c", ""])
})

// ── handleTagList ────────────────────────────────────────

test("handleTagList shows info when no tags exist", async () => {
  const { handleTagList } = await import("../commands.ts")
  handleTagList()
  expect(infoMessages).toContain("No tags found")
})

test("handleTagList displays tags with counts", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["video"] })
  db.writeSubscription({ name: "S2", price: 200, currency: "JPY", cycle: "monthly", tags: ["video"] })
  db.writeSubscription({ name: "S3", price: 300, currency: "JPY", cycle: "monthly", tags: ["storage"] })

  const { handleTagList } = await import("../commands.ts")
  handleTagList()
  const combined = logMessages.join("\n")
  expect(combined).toContain("video")
  expect(combined).toContain("2")
  expect(combined).toContain("storage")
  expect(combined).toContain("1")
})

// ── handleTagRename ──────────────────────────────────────

test("handleTagRename shows error when names are empty", async () => {
  const { handleTagRename } = await import("../commands.ts")
  await handleTagRename("", "")
  expect(errorMessages.length).toBeGreaterThan(0)
})

test("handleTagRename shows error for non-existent tag", async () => {
  const { handleTagRename } = await import("../commands.ts")
  await handleTagRename("nonexistent", "new")
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
})

test("handleTagRename renames a tag successfully", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["old"] })

  const { handleTagRename } = await import("../commands.ts")
  await handleTagRename("old", "new")
  expect(successMessages.some((m) => m.includes("old") && m.includes("new"))).toBe(true)

  const tags = db.getTagsWithCount()
  expect(tags.find((t) => t.name === "old")).toBeUndefined()
  expect(tags.find((t) => t.name === "new")).toBeDefined()
})

// ── handleTagDelete ──────────────────────────────────────

test("handleTagDelete shows error when name is empty", async () => {
  const { handleTagDelete } = await import("../commands.ts")
  await handleTagDelete("")
  expect(errorMessages.length).toBeGreaterThan(0)
})

test("handleTagDelete shows error for non-existent tag", async () => {
  const { handleTagDelete } = await import("../commands.ts")
  await handleTagDelete("nonexistent")
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
})

test("handleTagDelete deletes a tag successfully", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["delete-me"] })

  const { handleTagDelete } = await import("../commands.ts")
  await handleTagDelete("delete-me")
  expect(successMessages.some((m) => m.includes("delete-me"))).toBe(true)
  expect(db.getTagsWithCount()).toHaveLength(0)
})

// ── handleTagPrune ───────────────────────────────────────

test("handleTagPrune shows info when no orphaned tags", async () => {
  const { handleTagPrune } = await import("../commands.ts")
  await handleTagPrune()
  expect(infoMessages.some((m) => m.includes("No orphaned"))).toBe(true)
})

test("handleTagPrune removes orphaned tags", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["keep"] })
  const [sub] = db.getSubscriptions()
  db.deleteSubscription(sub.id)
  testDb.run("INSERT INTO tags (name) VALUES ('orphan1'), ('orphan2')")

  const { handleTagPrune } = await import("../commands.ts")
  await handleTagPrune()
  expect(successMessages.some((m) => m.includes("3 orphaned"))).toBe(true)
})

// ── handleExport ─────────────────────────────────────────

test("handleExport shows error for unsupported format", async () => {
  const { handleExport } = await import("../commands.ts")
  await handleExport("pdf", {})
  expect(errorMessages.length).toBeGreaterThan(0)
  expect(errorMessages[0].toLowerCase()).toContain("unsupported")
})

test("handleExport shows info when no subscriptions", async () => {
  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", {})
  expect(infoMessages).toContain("No subscriptions found")
})

test("handleExport outputs JSON for json format", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("json", {})
  const combined = logMessages.join("\n")
  const parsed = JSON.parse(combined)
  expect(parsed).toHaveLength(1)
  expect(parsed[0].name).toBe("Netflix")
})

test("handleExport outputs Markdown for md format", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("md", {})
  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
  expect(combined).toContain("|")
  expect(combined).toContain("¥1,500")
})

test("handleExport filters by tags", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "A", price: 100, currency: "USD", cycle: "monthly", tags: ["video"] })
  db.writeSubscription({ name: "B", price: 200, currency: "USD", cycle: "monthly", tags: ["audio"] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", { tags: "video" })
  const combined = logMessages.join("\n")
  expect(combined).toContain("A")
  expect(combined).not.toContain("B")
})

test("handleExport with currency converts prices", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "JP", price: 1600, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", { currency: "USD" })
  const combined = logMessages.join("\n")
  expect(combined).toContain("10")
  expect(combined).toContain("USD")
})

test("handleExport with currency falls back when fetch fails", async () => {
  globalThis.fetch = async () => { throw new Error("Network error") }
  const db = await import("../db.ts")
  db.writeSubscription({ name: "JP", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", { currency: "USD" })
  expect(failMessages.length).toBeGreaterThan(0)
  expect(failMessages[0]).toContain("Failed to fetch exchange rates")

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ base: "USD", rates: { JPY: 160, USD: 1 } }))
})

// ── CSV injection prevention ─────────────────────────────

test("handleExport escapes CSV injection vectors in name", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "=CMD", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "+SUM(1,1)", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "-DDE", price: 300, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "@RISK", price: 400, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "\tTab", price: 450, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "Normal", price: 500, currency: "USD", cycle: "monthly", tags: [] })

  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", {})
  const combined = logMessages.join("\n")

  // Dangerous prefixes should be prefixed with \t
  expect(combined).toContain("\t=CMD")
  expect(combined).toContain("\t+SUM(1,1)")
  expect(combined).toContain("\t-DDE")
  expect(combined).toContain("\t@RISK")
  // Tab-prefixed name should also be escaped
  expect(combined).toContain("\tTab")
  // Normal name should NOT be prefixed
  expect(combined).toContain("Normal,")
  // Check it's not prefixing normal names
  expect(combined).not.toContain("\tNormal")
})

test("escapeCsv handles empty strings", async () => {
  const { exportCsv } = await import("../export.ts")
  const result = exportCsv([
    { id: 1, name: "", price: 0, currency: "USD", cycle: "monthly", tags: [] },
  ])
  expect(result).toContain(",,")
})

test("handleExport with --output flag writes to file", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] })
  const tmpDir = createTempDir()
  const outPath = join(tmpDir, "export.csv")

  const { handleExport } = await import("../commands.ts")
  await handleExport("csv", { output: outPath })

  const { existsSync, readFileSync } = await import("node:fs")
  expect(existsSync(outPath)).toBe(true)
  const content = readFileSync(outPath, "utf-8")
  expect(content).toContain("Netflix")
  expect(content).toContain("1500")
  expect(successMessages.some((m) => m.includes("Exported"))).toBe(true)
})

// ── handleList ───────────────────────────────────────────

test("handleList delegates to spreadSubscription", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleList } = await import("../commands.ts")
  await handleList({})
  const combined = logMessages.join("\n")
  expect(combined).toContain("Netflix")
  expect(combined).toContain("JPY TOTAL")
})

test("handleList passes sort and desc to getSubscriptions", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "B", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "A", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  const { handleList } = await import("../commands.ts")
  await handleList({ sort: "name", desc: false })
  const combined = logMessages.join("\n")
  const aIdx = combined.indexOf("A")
  const bIdx = combined.indexOf("B")
  expect(aIdx).toBeLessThan(bIdx)
})

// ── handleEdit (non-interactive, with flags) ────────────

test("handleEdit shows info when no subscriptions", async () => {
  const { handleEdit } = await import("../commands.ts")
  await handleEdit(1, { name: "New Name" })
  expect(infoMessages).toContain("No subscriptions found")
})

test("handleEdit shows error for non-existent id", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(999, { name: "New Name" })
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
})

test("handleEdit updates name with --name flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "OldName", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { name: "NewName" })
  expect(successMessages.some((m) => m.includes("NewName"))).toBe(true)

  const updated = db.getSubscription(sub.id)
  expect(updated?.name).toBe("NewName")
})

test("handleEdit updates price with --price flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 500, currency: "JPY", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { price: "999" })
  expect(successMessages.length).toBeGreaterThan(0)

  const updated = db.getSubscription(sub.id)
  expect(updated?.price).toBe(999)
})

test("handleEdit updates tags with --tags flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 500, currency: "JPY", cycle: "monthly", tags: ["old"] })
  const [sub] = db.getSubscriptions()

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { tags: "new1, new2" })
  expect(successMessages.length).toBeGreaterThan(0)

  const updated = db.getSubscription(sub.id)
  expect(updated?.tags).toEqual(["new1", "new2"])
})

test("handleEdit updates status with --status flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Test", price: 1000, currency: "USD", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { status: "paused" })

  const updated = db.getSubscription(sub.id)
  expect(updated?.status).toBe("paused")
})

test("handleEdit updates billingDay with --billingDay flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Test", price: 1000, currency: "USD", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { billingDay: "15" })

  const updated = db.getSubscription(sub.id)
  expect(updated?.billingDay).toBe(15)
})

test("handleEdit clears billingDay with empty --billingDay flag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Test", price: 1000, currency: "USD", cycle: "monthly", tags: [], billingDay: 20 })
  const [sub] = db.getSubscriptions()
  expect(sub.billingDay).toBe(20)

  const { handleEdit } = await import("../commands.ts")
  await handleEdit(sub.id, { billingDay: "" })

  const updated = db.getSubscription(sub.id)
  expect(updated?.billingDay).toBeNull()
})

// ── handleEdit (interactive, with mocked prompts) ───────

test("handleEdit interactive: select picks the subscription", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 1000, currency: "JPY", cycle: "monthly", tags: ["x"] })
  const [sub] = db.getSubscriptions()

  vi.mocked(select).mockResolvedValue(sub)
  vi.mocked(checkbox).mockResolvedValue(["name"])
  vi.mocked(input).mockResolvedValue("Renamed")
  vi.mocked(confirm).mockResolvedValue(true)

  const { handleEdit } = await import("../commands.ts")
  await handleEdit()
  expect(successMessages.some((m) => m.includes("Renamed"))).toBe(true)

  const updated = db.getSubscription(sub.id)
  expect(updated?.name).toBe("Renamed")
})

test("handleEdit interactive: cancels when no fields selected", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  vi.mocked(select).mockResolvedValue(sub)
  vi.mocked(checkbox).mockResolvedValue([])

  const { handleEdit } = await import("../commands.ts")
  await handleEdit()
  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
})

test("handleEdit interactive: cancels when confirm is declined", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })
  const [sub] = db.getSubscriptions()

  vi.mocked(select).mockResolvedValue(sub)
  vi.mocked(checkbox).mockResolvedValue(["name"])
  vi.mocked(input).mockResolvedValue("Renamed")
  vi.mocked(confirm).mockResolvedValue(false)

  const { handleEdit } = await import("../commands.ts")
  await handleEdit()
  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
  const updated = db.getSubscription(sub.id)
  expect(updated?.name).toBe("S1")
})

// ── handleImport ─────────────────────────────────────────

test("handleImport shows error when no file argument", async () => {
  const { handleImport } = await import("../import-csv.ts")
  await handleImport("", {})
  expect(errorMessages.length).toBeGreaterThan(0)
  expect(errorMessages[0].toLowerCase()).toContain("usage")
})

test("handleImport shows error for non-existent file", async () => {
  const { handleImport } = await import("../import-csv.ts")
  await handleImport("/nonexistent/file.csv", {})
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
})

test("handleImport shows error for CSV with no recognizable columns", async () => {
  const filePath = writeTempFile("bad-header.csv", "foo,bar\na,100")
  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})
  expect(errorMessages.length).toBeGreaterThan(0)
  expect(
    errorMessages.some((m) => m.toLowerCase().includes("name")),
  ).toBe(true)
})

test("handleImport succeeds with valid CSV data", async () => {
  const csv = "name,cycle,tags,price,currency\na,monthly,,100,JPY"
  const filePath = writeTempFile("valid.csv", csv)
  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})

  const db = await import("../db.ts")
  const subs = db.getSubscriptions()
  expect(subs.length).toBeGreaterThan(0)
  expect(subs[0].name).toBe("a")
  expect(subs[0].price).toBe(100)
  expect(subs[0].currency).toBe("JPY")
  expect(subs[0].cycle).toBe("monthly")
})

test("handleImport imports valid CSV data", async () => {
  const csv = "\uFEFFname,cycle,tags,price,currency\nNetflix,monthly,video;entertainment,1500,JPY\nDropbox,monthly,storage,10,USD"
  const filePath = writeTempFile("valid.csv", csv)

  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})

  const db = await import("../db.ts")
  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(2)
  expect(subs[0].name).toBe("Netflix")
  expect(subs[0].tags).toEqual(["video", "entertainment"])
  expect(subs[1].name).toBe("Dropbox")
  expect(subs[1].price).toBe(10)
  expect(subs[1].currency).toBe("USD")
  expect(successMessages.some((m) => m.includes("2 imported"))).toBe(true)
})

test("handleImport supports dry-run mode", async () => {
  const csv = "name,cycle,tags,price,currency\nNetflix,monthly,,1500,JPY"
  const filePath = writeTempFile("dryrun.csv", csv)

  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, { dryRun: true })

  const db = await import("../db.ts")
  expect(db.getSubscriptions()).toHaveLength(0)
  expect(successMessages.some((m) => m.includes("Dry-run"))).toBe(true)
})

test("handleImport skips invalid rows", async () => {
  const csv = "name,cycle,tags,price,currency\nValid,monthly,,100,JPY\n,monthly,,abc,JPY\nBadPrice,monthly,,notanumber,JPY\nBadCurrency,monthly,,100,ZZ" // ZZ fails regex /^[A-Z]{3}$/
  const filePath = writeTempFile("partial.csv", csv)

  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})

  const db = await import("../db.ts")
  expect(db.getSubscriptions()).toHaveLength(1)
  expect(db.getSubscriptions()[0].name).toBe("Valid")
  expect(successMessages.some((m) => m.includes("1 imported"))).toBe(true)
  expect(warnMessages.length).toBeGreaterThan(0)
})

test("handleImport accepts the export CSV header (roundtrip)", async () => {
  const header = "name,status,cycle,tags,price,currency,notes,payment_method,contract_start,contract_end,auto_renewal,vendor_name,vendor_url,plan_tier,discount_amount,discount_type"
  const row = 'Netflix,active,monthly,video;entertainment,1490,JPY,"my notes",credit_card,2026-01-01,2027-01-01,true,Netflix Inc,https://netflix.com,Standard,,'
  const filePath = writeTempFile("export-format.csv", `${header}\n${row}`)

  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})

  const db = await import("../db.ts")
  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0]).toMatchObject({
    name: "Netflix",
    status: "active",
    cycle: "monthly",
    tags: ["video", "entertainment"],
    price: 1490,
    currency: "JPY",
    notes: "my notes",
    paymentMethod: "credit_card",
    contractStart: "2026-01-01",
    contractEnd: "2027-01-01",
    autoRenewal: true,
    vendorName: "Netflix Inc",
    vendorUrl: "https://netflix.com",
    planTier: "Standard",
    discountAmount: null,
  })
  expect(successMessages.some((m) => m.includes("1 imported"))).toBe(true)
})

test("handleImport rejects rows with invalid status in export format", async () => {
  const header = "name,status,cycle,tags,price,currency"
  const filePath = writeTempFile("bad-status.csv", `${header}\nBad,bogus,monthly,,100,JPY`)

  const { handleImport } = await import("../import-csv.ts")
  await handleImport(filePath, {})

  const db = await import("../db.ts")
  expect(db.getSubscriptions()).toHaveLength(0)
  expect(warnMessages.some((m) => m.includes('invalid status "bogus"'))).toBe(true)
})

// ── handleSummary ────────────────────────────────────────

test("handleSummary shows info when no subscriptions", async () => {
  const { handleSummary } = await import("../commands.ts")
  await handleSummary()
  expect(infoMessages).toContain("No subscriptions found")
})

test("handleSummary displays summary data", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] })

  const { handleSummary } = await import("../commands.ts")
  await handleSummary()
  const combined = logMessages.join("\n")
  expect(combined).toContain("Total subscriptions:")
  expect(combined).toContain("Netflix")
  expect(combined).toContain("Monthly by currency:")
})

// ── handleTags ────────────────────────────────────────────

test("handleTags delegates to spreadSubscription with tag filter", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "A", price: 100, currency: "USD", cycle: "monthly", tags: ["video"] })
  db.writeSubscription({ name: "B", price: 200, currency: "USD", cycle: "monthly", tags: ["audio"] })

  const { handleTags } = await import("../commands.ts")
  await handleTags(["video"])
  const combined = logMessages.join("\n")
  expect(combined).toContain("A")
  expect(combined).not.toContain("B")
})

// ── handlePayment ─────────────────────────────────────────

test("handlePayment shows monthly total", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [] })

  const { handlePayment } = await import("../commands.ts")
  await handlePayment("monthly", {})
  const combined = logMessages.join("\n")
  expect(combined).toContain("¥1,500")
  expect(combined).toContain("/month")
})

test("handlePayment with --currency converts to target", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })

  const { handlePayment } = await import("../commands.ts")
  await handlePayment("monthly", { currency: "JPY" })
  const combined = logMessages.join("\n")
  expect(combined).toContain("¥1,000")
  expect(combined).toContain("/month")
})

// ── handleCompare ──────────────────────────────────────────

test("handleCompare shows info when no active subscriptions", async () => {
  const { handleCompare } = await import("../commands.ts")
  await handleCompare("monthly", {})
  expect(infoMessages.some((m) => m.includes("No active subscriptions"))).toBe(true)
})

test("handleCompare shows comparison for active subscriptions", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleCompare } = await import("../commands.ts")
  await handleCompare("monthly", {})
  const combined = logMessages.join("\n")
  expect(combined).toContain("JPY")
  expect(combined).toContain("¥")
  expect(combined).toContain("Grand Total")
})

test("handleCompare with --api includes API usage", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Spotify", price: 980, currency: "JPY", cycle: "monthly", tags: [] })
  db.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 100,
    output_tokens: 50,
    cost: 0.5,
    date: "2026-06-19",
    description: null,
  })

  const { handleCompare } = await import("../commands.ts")
  await handleCompare("monthly", { api: true })
  const combined = logMessages.join("\n")
  expect(combined).toContain("API Usage")
  expect(combined).toContain("Grand Total")
  // API cost is stored in cents: 0.5 cents = $0.005 → rounds to $0
  // (regression guard: cents must not be treated as dollars)
  expect(combined).toContain("$0")
  expect(combined).not.toContain("$1")
  expect(combined).toContain("¥980")
})

test("handleCompare with --currency converts prices", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Netflix", price: 1600, currency: "JPY", cycle: "monthly", tags: [] })

  const { handleCompare } = await import("../commands.ts")
  await handleCompare("monthly", { currency: "USD" })
  const combined = logMessages.join("\n")
  expect(combined).toContain("USD")
})

// ── handleAdd ─────────────────────────────────────────────

test("handleAdd shows info when cancelled at confirm", async () => {
  // Mock all prompts in resolveAddOptions order
  vi.mocked(input)
    .mockResolvedValueOnce("New Service")   // name
    .mockResolvedValueOnce("2500")           // price
    .mockResolvedValueOnce("my-tag")         // tags
    .mockResolvedValueOnce("")               // notes (empty)
    .mockResolvedValueOnce("")               // paymentMethod (empty)
    .mockResolvedValueOnce("")               // billingDay (empty)
    .mockResolvedValueOnce("")               // vendorName (empty)
    .mockResolvedValueOnce("")               // vendorUrl (empty)
    .mockResolvedValueOnce("")               // planTier (empty)
    .mockResolvedValueOnce("")               // contractStart (empty)
    .mockResolvedValueOnce("")               // contractEnd (empty)
    .mockResolvedValueOnce("")               // discountAmount (empty)
  vi.mocked(select)
    .mockResolvedValueOnce("JPY")            // currency
    .mockResolvedValueOnce("monthly")        // cycle
    .mockResolvedValueOnce("active")         // status
  vi.mocked(confirm)
    .mockResolvedValueOnce(true)             // autoRenewal
    .mockResolvedValueOnce(false)            // decline save

  const { handleAdd } = await import("../commands.ts")
  await handleAdd({})
  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
})

test("handleAdd creates subscription with prompted fields", async () => {
  vi.mocked(input)
    .mockResolvedValueOnce("Spotify")
    .mockResolvedValueOnce("980")
    .mockResolvedValueOnce("music")
    .mockResolvedValueOnce("")               // notes (empty)
    .mockResolvedValueOnce("")               // paymentMethod (empty)
    .mockResolvedValueOnce("")               // billingDay (empty)
    .mockResolvedValueOnce("")               // contractStart (empty)
    .mockResolvedValueOnce("")               // contractEnd (empty)
    .mockResolvedValueOnce("")               // vendorName (empty)
    .mockResolvedValueOnce("")               // vendorUrl (empty)
    .mockResolvedValueOnce("")               // planTier (empty)
    .mockResolvedValueOnce("")               // discountAmount (empty)
  vi.mocked(select)
    .mockResolvedValueOnce("JPY")
    .mockResolvedValueOnce("monthly")
    .mockResolvedValueOnce("active")         // status
  vi.mocked(confirm)
    .mockResolvedValueOnce(true)             // autoRenewal
    .mockResolvedValueOnce(true)             // save

  const { handleAdd } = await import("../commands.ts")
  await handleAdd({})
  expect(successMessages.some((m) => m.includes("Spotify"))).toBe(true)

  const db = await import("../db.ts")
  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].name).toBe("Spotify")
  expect(subs[0].price).toBe(980)
})

test("handleAdd uses flags when provided (non-interactive)", async () => {
  const { handleAdd } = await import("../commands.ts")
  await handleAdd({
    name: "FlagService",
    price: "500",
    currency: "USD",
    cycle: "yearly",
    tags: "flag-test",
  })
  expect(successMessages.some((m) => m.includes("FlagService"))).toBe(true)

  const db = await import("../db.ts")
  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].name).toBe("FlagService")
  expect(subs[0].price).toBe(500)
  expect(subs[0].currency).toBe("USD")
  expect(subs[0].cycle).toBe("yearly")
  expect(subs[0].tags).toEqual(["flag-test"])
})

// ── handleDelete ──────────────────────────────────────────

test("handleDelete shows info when no subscriptions", async () => {
  const { handleDelete } = await import("../commands.ts")
  await handleDelete()
  expect(infoMessages).toContain("No subscriptions found")
})

test("handleDelete deletes selected subscriptions", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "S2", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  const [s1, s2] = db.getSubscriptions()

  // Mock checkbox to return s1 (the first sub)
  vi.mocked(checkbox).mockResolvedValue([s1])
  vi.mocked(confirm).mockResolvedValue(true)

  const { handleDelete } = await import("../commands.ts")
  await handleDelete()

  const remaining = db.getSubscriptions()
  expect(remaining).toHaveLength(1)
  expect(remaining[0].name).toBe("S2")
  expect(successMessages.some((m) => m.includes("S1"))).toBe(true)
})

test("handleDelete deletes by ID (non-interactive)", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "S2", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  const [s1] = db.getSubscriptions()

  const { handleDelete } = await import("../commands.ts")
  await handleDelete([s1.id])

  const remaining = db.getSubscriptions()
  expect(remaining).toHaveLength(1)
  expect(remaining[0].name).toBe("S2")
  expect(successMessages.some((m) => m.includes("S1"))).toBe(true)
})

test("handleDelete with non-existent ID shows error", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  const { handleDelete } = await import("../commands.ts")
  await handleDelete([999])

  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
  expect(db.getSubscriptions()).toHaveLength(1)
})

test("handleDelete cancels when no selection", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  vi.mocked(checkbox).mockResolvedValue([])

  const { handleDelete } = await import("../commands.ts")
  await handleDelete()

  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
  expect(db.getSubscriptions()).toHaveLength(1) // unchanged
})

test("handleDelete cancels when confirm is declined", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  const [s1] = db.getSubscriptions()

  vi.mocked(checkbox).mockResolvedValue([s1])
  vi.mocked(confirm).mockResolvedValue(false)

  const { handleDelete } = await import("../commands.ts")
  await handleDelete()

  expect(infoMessages.some((m) => m.includes("Cancelled"))).toBe(true)
  expect(db.getSubscriptions()).toHaveLength(1) // unchanged
})

// ── handleUsageAdd (non-interactive) ─────────────────────

test("handleUsageAdd creates entry with all flags", async () => {
  const db = await import("../db.ts")
  const { handleUsageAdd } = await import("../usage.ts")

  await handleUsageAdd({
    provider: "openai",
    model: "gpt-4o",
    inputTokens: "1000",
    outputTokens: "500",
    date: "2026-06-19",
    description: "test run",
  })

  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0].provider).toBe("openai")
  expect(entries[0].model).toBe("gpt-4o")
  expect(entries[0].input_tokens).toBe(1000)
  expect(entries[0].output_tokens).toBe(500)
  expect(entries[0].date).toBe("2026-06-19")
  expect(entries[0].description).toBe("test run")
  expect(entries[0].cost).toBeGreaterThan(0) // auto-calculated
})

test("handleUsageAdd with --cost flag uses manual cost when pricing not found", async () => {
  const db = await import("../db.ts")
  const { handleUsageAdd } = await import("../usage.ts")

  // Use an unknown model so pricing lookup fails, fall back to --cost
  await handleUsageAdd({
    provider: "openai",
    model: "unknown-model-xyz",
    inputTokens: "1000",
    outputTokens: "500",
    date: "2026-06-19",
    cost: "0.75",
  })

  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0].cost).toBe(75) // 0.75 USD = 75 cents
  expect(entries[0].model).toBe("unknown-model-xyz")
})

test("handleUsageAdd with invalid --cost shows error", async () => {
  const { handleUsageAdd } = await import("../usage.ts")
  await handleUsageAdd({
    provider: "openai",
    model: "gpt-4o",
    inputTokens: "100",
    outputTokens: "50",
    cost: "abc",
  })
  expect(errorMessages.length).toBeGreaterThan(0)
  expect(errorMessages[0].toLowerCase()).toContain("invalid cost")
})

test("handleUsageAdd with invalid provider shows error", async () => {
  const { handleUsageAdd } = await import("../usage.ts")
  await handleUsageAdd({
    provider: "nonexistent",
    model: "gpt-4o",
    inputTokens: "100",
    outputTokens: "50",
  })
  expect(errorMessages.length).toBeGreaterThan(0)
  expect(errorMessages[0].toLowerCase()).toContain("invalid provider")
})

test("handleUsageAdd with invalid tokens shows error", async () => {
  const { handleUsageAdd } = await import("../usage.ts")
  await handleUsageAdd({
    provider: "openai",
    model: "gpt-4o",
    inputTokens: "abc",
    outputTokens: "50",
  })
  expect(errorMessages.length).toBeGreaterThan(0)
})

test("handleUsageAdd with invalid date shows error", async () => {
  const { handleUsageAdd } = await import("../usage.ts")
  await handleUsageAdd({
    provider: "openai",
    model: "gpt-4o",
    inputTokens: "100",
    outputTokens: "50",
    date: "not-a-date",
  })
  expect(errorMessages.length).toBeGreaterThan(0)
})

// ── handleUsageList ──────────────────────────────────────

test("handleUsageList shows info when no entries", async () => {
  const { handleUsageList } = await import("../usage.ts")
  await handleUsageList({})
  expect(infoMessages.some((m) => m.includes("No paid usage entries"))).toBe(true)
})

test("handleUsageList displays entries", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 1000,
    output_tokens: 500,
    cost: 0.5,
    date: "2026-06-19",
    description: null,
  })

  const { handleUsageList } = await import("../usage.ts")
  await handleUsageList({})
  const combined = logMessages.join("\n")
  expect(combined).toContain("openai")
  expect(combined).toContain("gpt-4o")
  expect(combined).toContain("Total")
})

// ── handleUsageDelete ─────────────────────────────────────

test("handleUsageDelete deletes by ID (non-interactive)", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 100,
    output_tokens: 50,
    cost: 0.1,
    date: "2026-06-19",
    description: null,
  })
  const entries = db.getLlmUsage()
  const id = entries[0].id

  const { handleUsageDelete } = await import("../usage.ts")
  await handleUsageDelete([id])

  expect(db.getLlmUsage()).toHaveLength(0)
  expect(successMessages.some((m) => m.includes(String(id)))).toBe(true)
})

test("handleUsageDelete with non-existent ID shows error", async () => {
  const { handleUsageDelete } = await import("../usage.ts")
  await handleUsageDelete([999])
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
})

test("handleUsageDelete shows info when no entries", async () => {
  const { handleUsageDelete } = await import("../usage.ts")
  await handleUsageDelete()
  expect(infoMessages.some((m) => m.includes("No usage entries"))).toBe(true)
})

test("handleUsageDelete deletes selected entries", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 100,
    output_tokens: 50,
    cost: 0.1,
    date: "2026-06-19",
    description: null,
  })
  const entries = db.getLlmUsage()

  vi.mocked(checkbox).mockResolvedValue(entries)
  vi.mocked(confirm).mockResolvedValue(true)

  const { handleUsageDelete } = await import("../usage.ts")
  await handleUsageDelete()

  expect(db.getLlmUsage()).toHaveLength(0)
  expect(successMessages.some((m) => m.includes("openai"))).toBe(true)
})

// ── handleUsageImport ─────────────────────────────────────

test("handleUsageImport with OpenRouter JSONL adds entries", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "openrouter.jsonl")

  writeFileSync(filePath, [
    JSON.stringify({ id: "gen-aaa", model: "openai/gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.0375 } }),
    JSON.stringify({ id: "gen-bbb", model: "anthropic/claude-sonnet-4-20250514", usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280, cost: 0.42 } }),
    JSON.stringify({ id: "gen-ccc", model: "openai/gpt-4o-mini", usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80, cost: 0.001 } }),
  ].join("\n"))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  expect(successMessages.some((m) => m.includes("3 entries added"))).toBe(true)

  const db = await import("../db.ts")
  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(3)

  // Ordered by id DESC, so gen-ccc first, then gen-bbb, then gen-aaa
  const byModel = Object.fromEntries(entries.map((e) => [e.model, e]))
  expect(byModel["gpt-4o"].provider).toBe("openai")
  expect(byModel["gpt-4o"].input_tokens).toBe(100)
  expect(byModel["gpt-4o"].output_tokens).toBe(50)
  expect(byModel["gpt-4o"].cost).toBe(0.0375)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport detects duplicates by generation_id", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "dupes.jsonl")

  writeFileSync(filePath, [
    JSON.stringify({ id: "gen-dup1", model: "openai/gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.03 } }),
    JSON.stringify({ id: "gen-dup1", model: "openai/gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.03 } }),
  ].join("\n"))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  expect(successMessages.some((m) => m.includes("1 entries added") && m.includes("1 duplicate skipped"))).toBe(true)

  const db = await import("../db.ts")
  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport with OpenAI JSONL calculates cost via pricing", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "openai.jsonl")

  writeFileSync(filePath, [
    JSON.stringify({ id: "chatcmpl-xxx", model: "gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, created: 1719000000 }),
  ].join("\n"))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  // Pricing mock returns calculateCostCents = 0.75
  expect(successMessages.some((m) => m.includes("1 entries added"))).toBe(true)

  const db = await import("../db.ts")
  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0].provider).toBe("openai")
  expect(entries[0].model).toBe("gpt-4o")
  expect(entries[0].cost).toBe(0.75)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport dry run does not add entries", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "dryrun.jsonl")

  writeFileSync(filePath, [
    JSON.stringify({ id: "gen-dr1", model: "openai/gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.02 } }),
  ].join("\n"))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath, dryRun: true })

  expect(infoMessages.some((m) => m.includes("Dry run") && m.includes("1 entries would be added"))).toBe(true)

  const db = await import("../db.ts")
  expect(db.getLlmUsage()).toHaveLength(0)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport with empty file shows warning", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "empty.jsonl")

  writeFileSync(filePath, "")

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  expect(warnMessages.some((m) => m.includes("empty"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport skips entries with no usage data", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "nousage.jsonl")

  writeFileSync(filePath, [
    JSON.stringify({ id: "gen-ok", model: "openai/gpt-4o", usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.02 } }),
    JSON.stringify({ message: "Hello, world!", role: "assistant" }),
    JSON.stringify({ id: "gen-nocost", model: "unknown/model", usage: { prompt_tokens: 10, completion_tokens: 5 } }),
  ].join("\n"))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  expect(successMessages.some((m) => m.includes("1 entries added") && m.includes("1 unparsable") && m.includes("1 skipped (no cost"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport with JSON array format works", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const filePath = join(tmpDir, "array.json")

  writeFileSync(filePath, JSON.stringify([
    { id: "gen-arr1", model: "openai/gpt-4o", usage: { prompt_tokens: 50, completion_tokens: 25, cost: 0.01 } },
    { id: "gen-arr2", model: "anthropic/claude-sonnet-4-20250514", usage: { prompt_tokens: 100, completion_tokens: 40, cost: 0.08 } },
  ]))

  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: filePath })

  expect(successMessages.some((m) => m.includes("2 entries added"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleUsageImport without file shows usage error", async () => {
  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({})

  expect(errorMessages.some((m) => m.includes("Usage:"))).toBe(true)
})

test("handleUsageImport with non-existent file shows error", async () => {
  const { handleUsageImport } = await import("../usage.ts")
  await handleUsageImport({ file: "/nonexistent/path/log.jsonl" })

  expect(errorMessages.some((m) => m.includes("path not allowed"))).toBe(true)
})

// ── handleUsageRefresh ────────────────────────────────────

test("handleUsageRefresh shows info when no entries found", async () => {
  const { handleUsageRefresh } = await import("../usage.ts")
  await handleUsageRefresh()

  expect(infoMessages.some((m) => m.includes("No new usage"))).toBe(true)
})

test("handleUsageRefresh imports entries from scanner and deduplicates", async () => {
  const { runAllScanners } = await import("../scanner.ts")
  vi.mocked(runAllScanners).mockReturnValue({
    source: "combined",
    entries: [
      {
        provider: "opencode",
        model: "deepseek-v4",
        input_tokens: 100,
        output_tokens: 50,
        cost: 0,
        date: "2026-06-01",
        description: null,
        generation_id: "msg_aaa",
      },
      {
        provider: "opencode",
        model: "deepseek-v4",
        input_tokens: 200,
        output_tokens: 100,
        cost: 0.05,
        date: "2026-06-02",
        description: null,
        generation_id: "msg_bbb",
      },
    ],
  })

  const { handleUsageRefresh } = await import("../usage.ts")
  await handleUsageRefresh()

  expect(successMessages.some((m) => m.includes("entries added"))).toBe(true)

  const db = await import("../db.ts")
  const entries = db.getLlmUsage({ limit: 100, minCost: 0 })
  expect(entries).toHaveLength(2)
})

test("handleUsageRefresh skips already imported entries", async () => {
  // Pre-insert an entry to simulate already-imported data
  const db = await import("../db.ts")
  db.addLlmUsageFromLog({
    provider: "opencode",
    model: "deepseek-v4",
    input_tokens: 100,
    output_tokens: 50,
    cost: 0,
    date: "2026-06-01",
    description: null,
    generation_id: "msg_aaa",
  })

  const { runAllScanners } = await import("../scanner.ts")
  vi.mocked(runAllScanners).mockReturnValue({
    source: "combined",
    entries: [
      {
        provider: "opencode",
        model: "deepseek-v4",
        input_tokens: 100,
        output_tokens: 50,
        cost: 0,
        date: "2026-06-01",
        description: null,
        generation_id: "msg_aaa",
      },
      // new entry
      {
        provider: "openai",
        model: "gpt-4o",
        input_tokens: 300,
        output_tokens: 150,
        cost: 0.75,
        date: "2026-06-03",
        description: null,
        generation_id: "msg_ccc",
      },
    ],
  })

  const { handleUsageRefresh } = await import("../usage.ts")
  await handleUsageRefresh()

  expect(successMessages.some((m) => m.includes("1 entr"))).toBe(true)

  const entries = db.getLlmUsage({ limit: 100, minCost: 0 })
  expect(entries).toHaveLength(2) // 1 pre-existing + 1 new
})

// ── handleBackup ──────────────────────────────────────────

test("handleBackup creates compressed backup in specified directory", async () => {
  const { mkdtempSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))

  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  const { handleBackup } = await import("../commands.ts")
  await handleBackup(tmpDir)

  // Verify .db.gz file was created
  const files = db.getBackupFiles(tmpDir)
  expect(files).toHaveLength(1)
  expect(files[0].name).toMatch(/^subtrack_\d{8}_\d{6}\.db\.gz$/)
  expect(successMessages.some((m) => m.includes("Backup created"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

// ── handleRestore ─────────────────────────────────────────

test("handleRestore restores from valid backup file", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const initSqlJs2 = await import("sql.js")

  // Create a backup database with target data
  const SQL2 = await initSqlJs2.default()
  const backupDb = new SQL2.Database()
  backupDb.run("CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL, cycle TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', billing_day INTEGER, created_at TEXT NOT NULL DEFAULT (date('now')), notes TEXT)")
  backupDb.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)")
  backupDb.run("CREATE TABLE subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id))")
  backupDb.run("CREATE TABLE llm_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL, date TEXT NOT NULL, description TEXT)")
  backupDb.run("INSERT INTO subscriptions (name, price, currency, cycle) VALUES ('Restored', 999, 'EUR', 'yearly')")
  const buf = Buffer.from(backupDb.export())
  backupDb.close()

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const backupPath = join(tmpDir, "test_backup.db")
  writeFileSync(backupPath, buf)

  // Current DB has different data
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Old", price: 500, currency: "JPY", cycle: "monthly", tags: [] })

  vi.mocked(confirm).mockResolvedValue(true)

  const { handleRestore } = await import("../commands.ts")
  await handleRestore(backupPath, { force: true })

  // Verify restored data
  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].name).toBe("Restored")
  expect(subs[0].price).toBe(999)
  expect(successMessages.some((m) => m.includes("Restored"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("handleRestore with non-existent file shows error", async () => {
  const { handleRestore } = await import("../commands.ts")
  await handleRestore("/nonexistent/file.db.gz")
  expect(errorMessages.some((m) => m.includes("Invalid backup file"))).toBe(true)
})

test("handleRestore interactive: shows info when no backups found", async () => {
  const { mkdtempSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-empty"))

  const { handleRestore } = await import("../commands.ts")
  await handleRestore(undefined, { dir: tmpDir })

  expect(infoMessages.some((m) => m.includes("No backup files"))).toBe(true)

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})
