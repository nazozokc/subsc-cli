import { test, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { consola } from "consola"

const logMessages: string[] = []
const infoMessages: string[] = []
const errorMessages: string[] = []
const successMessages: string[] = []

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

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "info") infoMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
      if (_type === "success") successMessages.push(clean)
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
    "CREATE TABLE IF NOT EXISTS subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id), FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE)",
  )
  testDb.run(
    "CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER NOT NULL, old_price INTEGER, new_price INTEGER NOT NULL, old_currency TEXT, new_currency TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE)",
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
    vendorUrl: null,
    ...overrides,
  }
  testDb.run(
    "INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at, vendor_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [fields.name, fields.price, fields.currency, fields.cycle, fields.status, fields.billingDay, fields.createdAt, fields.vendorUrl],
  )
  const row = testDb.exec("SELECT last_insert_rowid() AS id")
  const id = Number(row[0].values[0][0])

  const tags = (overrides.tags as string[] | undefined) ?? []
  for (const t of tags) {
    testDb.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t])
    const tagRow = testDb.exec("SELECT id FROM tags WHERE name = ?", [t])
    const tagId = Number(tagRow[0].values[0][0])
    testDb.run("INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?, ?)", [id, tagId])
  }
  return id
}

// ── normalizeName ──────────────────────────────────────

test("normalizeName lowercases and strips punctuation/space", async () => {
  const { normalizeName } = await import("../dedupe.ts")
  expect(normalizeName("Netflix")).toBe("netflix")
  expect(normalizeName("Net-flix Premium+")).toBe("netflixpremium")
  expect(normalizeName("Crunchy Roll (JP)")).toBe("crunchyrolljp")
  expect(normalizeName("ネット フリックス")).toBe("ネットフリックス")
})

test("similarity is 1 for identical names after normalization", async () => {
  const { similarity } = await import("../dedupe.ts")
  expect(similarity("Netflix", "netflix")).toBe(1)
  expect(similarity("Netflix", "Net-flix")).toBe(1)
  expect(similarity("Crunchyroll", "Crunchy Roll")).toBe(1)
})

test("similarity handles completely different names", async () => {
  const { similarity } = await import("../dedupe.ts")
  expect(similarity("Netflix", "AWS")).toBeLessThan(0.5)
})

test("similarity detects near-duplicates above threshold", async () => {
  const { similarity } = await import("../dedupe.ts")
  // "netflix" vs "netflx" (typo) — 1 edit in 7 chars
  expect(similarity("Netflix", "Netflx")).toBeGreaterThan(0.8)
})

test("similarity handles Japanese names", async () => {
  const { similarity } = await import("../dedupe.ts")
  expect(similarity("ネットフリックス", "ネットフリックス")).toBe(1)
  expect(similarity("ネットフリックス", "Netflix")).toBe(0)
})

// ── levenshtein ────────────────────────────────────────

test("levenshtein distance basics", async () => {
  const { levenshtein } = await import("../dedupe.ts")
  expect(levenshtein("", "")).toBe(0)
  expect(levenshtein("abc", "abc")).toBe(0)
  expect(levenshtein("abc", "")).toBe(3)
  expect(levenshtein("kitten", "sitting")).toBe(3)
  expect(levenshtein("flaw", "lawn")).toBe(2)
})

// ── findDuplicates ─────────────────────────────────────

test("findDuplicates returns pairs above threshold sorted by score", async () => {
  const { findDuplicates } = await import("../dedupe.ts")
  const subs = [
    { id: 1, name: "Netflix", price: 1000, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
    { id: 2, name: "Netflix", price: 1500, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
    { id: 3, name: "AWS", price: 500, currency: "JPY", cycle: "monthly", tags: [], status: "active", billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null, contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null, vendorUrl: null, planTier: null, discountAmount: null, discountType: null },
  ] as never[]
  const pairs = findDuplicates(subs)
  expect(pairs.length).toBe(1)
  expect(pairs[0]!.score).toBe(1)
})

test("findDuplicates flags matching vendor URLs even with different names", async () => {
  const { findDuplicates } = await import("../dedupe.ts")
  const mk = (id: number, name: string, vendorUrl: string | null) => ({
    id, name, price: 1000, currency: "JPY", cycle: "monthly", tags: [], status: "active",
    billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null,
    contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null,
    vendorUrl, planTier: null, discountAmount: null, discountType: null,
  })
  const pairs = findDuplicates(
    [mk(1, "GitHub Pro", "https://github.com"), mk(2, "GitHub Copilot", "https://github.com"), mk(3, "AWS", null)],
    0.9,
  )
  expect(pairs.length).toBe(1)
  expect(pairs[0]!.vendorUrlMatch).toBe(true)
})

test("findDuplicates respects threshold", async () => {
  const { findDuplicates } = await import("../dedupe.ts")
  const mk = (id: number, name: string) => ({
    id, name, price: 1000, currency: "JPY", cycle: "monthly", tags: [], status: "active",
    billingDay: 1, createdAt: "2026-01-01", notes: null, paymentMethod: null,
    contractStart: null, contractEnd: null, autoRenewal: true, vendorName: null,
    vendorUrl: null, planTier: null, discountAmount: null, discountType: null,
  })
  // "netflix" vs "netflx": 1/7 edits = 0.857 similarity
  const loose = findDuplicates([mk(1, "Netflix"), mk(2, "Netflx")], 0.8)
  expect(loose.length).toBe(1)
  const strict = findDuplicates([mk(1, "Netflix"), mk(2, "Netflx")], 0.9)
  expect(strict.length).toBe(0)
})

// ── handleDedupe ───────────────────────────────────────

test("handleDedupe shows info when no duplicates", async () => {
  insertSub({ name: "Netflix", price: 1000 })
  insertSub({ name: "AWS", price: 500 })

  const { handleDedupe } = await import("../dedupe.ts")
  handleDedupe({})
  expect(infoMessages.some((m) => m.includes("No duplicate subscriptions found"))).toBe(true)
})

test("handleDedupe lists duplicate pairs", async () => {
  insertSub({ name: "Netflix", price: 1000 })
  insertSub({ name: "Netflix", price: 1500 })

  const { handleDedupe } = await import("../dedupe.ts")
  handleDedupe({})
  expect(logMessages.some((m) => m.includes("Potential duplicates"))).toBe(true)
  expect(logMessages.some((m) => m.includes("#1 Netflix"))).toBe(true)
  expect(logMessages.some((m) => m.includes("#2 Netflix"))).toBe(true)
  expect(infoMessages.some((m) => m.includes("dedupe merge"))).toBe(true)
})

test("handleDedupe JSON output", async () => {
  insertSub({ name: "Netflix", price: 1000 })
  insertSub({ name: "Netflix", price: 1500 })

  const writes: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  const { handleDedupe } = await import("../dedupe.ts")
  handleDedupe({ json: true })

  process.stdout.write = origWrite
  const parsed = JSON.parse(writes.join(""))
  expect(parsed.length).toBe(1)
  expect(parsed[0]).toMatchObject({ score: 1, vendorUrlMatch: false })
  expect(parsed[0].a.id).toBe(1)
  expect(parsed[0].b.id).toBe(2)
})

test("handleDedupe rejects invalid threshold", async () => {
  const { handleDedupe } = await import("../dedupe.ts")
  handleDedupe({ threshold: 1.5 })
  expect(errorMessages.some((m) => m.includes("threshold"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = 0
})

// ── handleDedupeMerge ──────────────────────────────────

test("mergeSubscriptions transfers tags and deletes the removed one", async () => {
  const keepId = insertSub({ name: "Netflix", price: 1000, tags: ["video"] })
  const removeId = insertSub({ name: "Netflix", price: 1500, tags: ["family", "video"] })

  const { mergeSubscriptions } = await import("../db.ts")
  expect(mergeSubscriptions(keepId, removeId)).toBe(true)

  const { getSubscription } = await import("../db.ts")
  const kept = getSubscription(keepId)!
  expect(kept.tags.sort()).toEqual(["family", "video"])
  expect(getSubscription(removeId)).toBeUndefined()
})

test("handleDedupeMerge merges and logs success", async () => {
  const keepId = insertSub({ name: "Netflix", price: 1000 })
  const removeId = insertSub({ name: "Netflix", price: 1500 })

  const { handleDedupeMerge } = await import("../dedupe.ts")
  handleDedupeMerge(keepId, removeId)
  expect(successMessages.some((m) => m.includes("Merged"))).toBe(true)

  const { getSubscription } = await import("../db.ts")
  expect(getSubscription(removeId)).toBeUndefined()
})

test("handleDedupeMerge fails when subscription not found", async () => {
  const { handleDedupeMerge } = await import("../dedupe.ts")
  handleDedupeMerge(999, 1)
  expect(errorMessages.some((m) => m.includes("not found"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = 0
})

test("handleDedupeMerge rejects identical IDs", async () => {
  const id = insertSub({ name: "Netflix" })
  const { handleDedupeMerge } = await import("../dedupe.ts")
  handleDedupeMerge(id, id)
  expect(errorMessages.some((m) => m.includes("must differ"))).toBe(true)
  expect(process.exitCode).toBe(1)
  process.exitCode = 0
})