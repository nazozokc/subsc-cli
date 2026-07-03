import { test, expect, beforeAll, afterAll, beforeEach } from "vitest"
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

  const db = await import("../db.ts")
  db.__setDb(testDb)
})

beforeEach(() => {
  testDb.run("DELETE FROM subscription_tags")
  testDb.run("DELETE FROM tags")
  testDb.run("DELETE FROM subscriptions")
  testDb.run("DELETE FROM llm_usage")
})

afterAll(() => {
  testDb.close()
})

test("getSubscriptions returns empty when no data exists", async () => {
  const db = await import("../db.ts")
  expect(db.getSubscriptions()).toEqual([])
})

test("writeSubscription creates a subscription with tags", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })

  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0]).toMatchObject({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
})

test("writeSubscription handles empty tags gracefully", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Dropbox",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })

  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].tags).toEqual([])
})

test("writeSubscription supports USD currency", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "GitHub Copilot",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: ["dev"],
  })

  const subs = db.getSubscriptions()
  expect(subs[0].currency).toBe("USD")
})

test("writeSubscription supports yearly cycle", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "iCloud+",
    price: 12000,
    currency: "JPY",
    cycle: "yearly",
    tags: ["storage"],
  })

  const subs = db.getSubscriptions()
  expect(subs[0].cycle).toBe("yearly")
})

test("getSubscriptions returns all subscriptions ordered by id", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "A",
    price: 100,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })
  db.writeSubscription({
    name: "B",
    price: 200,
    currency: "JPY",
    cycle: "yearly",
    tags: [],
  })
  db.writeSubscription({
    name: "C",
    price: 300,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })

  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(3)
  expect(subs[0].name).toBe("A")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("C")
})

test("deleteSubscription removes a subscription", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "ToDelete",
    price: 500,
    currency: "JPY",
    cycle: "monthly",
    tags: [],
  })

  const subsBefore = db.getSubscriptions()
  expect(subsBefore).toHaveLength(1)

  db.deleteSubscription(subsBefore[0].id)
  expect(db.getSubscriptions()).toHaveLength(0)
})

test("deleteSubscription cascades to subscription_tags", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "WithTags",
    price: 999,
    currency: "USD",
    cycle: "monthly",
    tags: ["tag1", "tag2"],
  })

  const subs = db.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].tags).toHaveLength(2)

  const subId = subs[0].id
  const rows = testDb.exec(
    "SELECT COUNT(*) as cnt FROM subscription_tags WHERE subscription_id = ?",
    [subId],
  )
  const relCountBefore = Number(rows[0].values[0][0])
  expect(relCountBefore).toBe(2)

  db.deleteSubscription(subId)
  expect(db.getSubscriptions()).toHaveLength(0)

  const rowsAfter = testDb.exec(
    "SELECT COUNT(*) as cnt FROM subscription_tags WHERE subscription_id = ?",
    [subId],
  )
  const relCountAfter = Number(rowsAfter[0].values[0][0])
  expect(relCountAfter).toBe(0)
})

test("deleteSubscription does not throw when id does not exist", async () => {
  const db = await import("../db.ts")
  expect(() => db.deleteSubscription(99999)).not.toThrow()
})

test("tagsSubscription filters by single tag", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  db.writeSubscription({
    name: "Spotify",
    price: 980,
    currency: "JPY",
    cycle: "monthly",
    tags: ["music"],
  })

  const results = db.tagsSubscription("video")
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("Netflix")
})

test("tagsSubscription filters by multiple tags with AND logic", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  db.writeSubscription({
    name: "YouTube Premium",
    price: 1280,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  db.writeSubscription({
    name: "Spotify",
    price: 980,
    currency: "JPY",
    cycle: "monthly",
    tags: ["music"],
  })

  const results = db.tagsSubscription(["video", "entertainment"])
  expect(results).toHaveLength(2)

  const names = results.map((r) => r.name).sort()
  expect(names).toEqual(["Netflix", "YouTube Premium"])
})

test("tagsSubscription returns only subscriptions matching ALL specified tags", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  db.writeSubscription({
    name: "YouTube Premium",
    price: 1280,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })

  const results = db.tagsSubscription(["video", "entertainment"])
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("Netflix")
})

test("tagsSubscription returns empty for non-matching tag", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })

  expect(db.tagsSubscription("nonexistent")).toEqual([])
})

test("tagsSubscription returns empty array for empty input", async () => {
  const db = await import("../db.ts")
  expect(db.tagsSubscription([])).toEqual([])
  expect(db.tagsSubscription("")).toEqual([])
})

test("works with multiple subscriptions sharing the same tag", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "S1",
    price: 100,
    currency: "USD",
    cycle: "monthly",
    tags: ["shared"],
  })
  db.writeSubscription({
    name: "S2",
    price: 200,
    currency: "JPY",
    cycle: "yearly",
    tags: ["shared"],
  })

  const results = db.tagsSubscription("shared")
  expect(results).toHaveLength(2)
})

test("periodFactor returns correct factor for monthly to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("monthly", "monthly")).toBe(1)
})

test("periodFactor returns correct factor for yearly to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("yearly", "monthly")).toBe(1 / 12)
})

test("periodFactor returns correct factor for monthly to yearly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("monthly", "yearly")).toBe(12)
})

test("periodFactor returns correct factor for weekly to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("weekly", "monthly")).toBe(52 / 12)
})

test("periodFactor returns correct factor for bi-weekly to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("bi-weekly", "monthly")).toBe(26 / 12)
})

test("periodFactor returns correct factor for quarterly to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("quarterly", "monthly")).toBe(4 / 12)
})

test("periodFactor returns correct factor for semi-annual to monthly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("semi-annual", "monthly")).toBe(2 / 12)
})

test("periodFactor defaults to monthly when to is omitted", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("yearly")).toBe(1 / 12)
  expect(periodFactor("monthly")).toBe(1)
})

test("periodFactor returns correct factor for quarterly to yearly", async () => {
  const { periodFactor } = await import("../date-utils.ts")
  expect(periodFactor("quarterly", "yearly")).toBe(4)
})

test("periodFactor handles all cycle-to-cycle combinations without throwing", async () => {
  const { periodFactor, OCCURRENCES_PER_YEAR } = await import("../date-utils.ts")
  const cycles = Object.keys(OCCURRENCES_PER_YEAR) as Array<keyof typeof OCCURRENCES_PER_YEAR>
  for (const from of cycles) {
    for (const to of cycles) {
      const factor = periodFactor(from, to)
      expect(typeof factor).toBe("number")
      expect(factor).not.toBeNaN()
      expect(factor).toBeGreaterThan(0)
    }
  }
})

test("getSubscriptions returns correct data types", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Test",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    tags: ["test"],
  })

  const [sub] = db.getSubscriptions()
  expect(typeof sub.id).toBe("number")
  expect(typeof sub.name).toBe("string")
  expect(typeof sub.price).toBe("number")
  expect(["JPY", "USD"]).toContain(sub.currency)
  expect(["monthly", "yearly"]).toContain(sub.cycle)
  expect(Array.isArray(sub.tags)).toBe(true)
})

test("does not share tags between different subscriptions", async () => {
  const db = await import("../db.ts")

  db.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })
  db.writeSubscription({
    name: "Dropbox",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: ["storage"],
  })

  const subs = db.getSubscriptions()
  const netflix = subs.find((s) => s.name === "Netflix")
  const dropbox = subs.find((s) => s.name === "Dropbox")
  expect(netflix?.tags).toEqual(["video"])
  expect(dropbox?.tags).toEqual(["storage"])
})

// ── sort ──────────────────────────────────────────────────

test("getSubscriptions sorts by name ascending", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "C", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "A", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "B", price: 300, currency: "USD", cycle: "monthly", tags: [] })

  const subs = db.getSubscriptions("name", false)
  expect(subs[0].name).toBe("A")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("C")
})

test("getSubscriptions sorts by name descending", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "A", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "B", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "C", price: 300, currency: "USD", cycle: "monthly", tags: [] })

  const subs = db.getSubscriptions("name", true)
  expect(subs[0].name).toBe("C")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("A")
})

test("getSubscriptions sorts by price ascending", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "A", price: 300, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "C", price: 200, currency: "USD", cycle: "monthly", tags: [] })

  const subs = db.getSubscriptions("price", false)
  expect(subs[0].price).toBe(100)
  expect(subs[1].price).toBe(200)
  expect(subs[2].price).toBe(300)
})

test("getSubscriptions falls back to id order for invalid sort field", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  db.writeSubscription({ name: "A", price: 200, currency: "USD", cycle: "monthly", tags: [] })

  const subs = db.getSubscriptions("invalid_field", false)
  expect(subs[0].name).toBe("B")
  expect(subs[1].name).toBe("A")
})

test("getSubscriptions sorts by status ascending", async () => {
  const db = await import("../db.ts")
  // status alpha order: active < cancelled < paused
  db.writeSubscription({ name: "Mid", price: 100, currency: "USD", cycle: "monthly", status: "cancelled", tags: [] })
  db.writeSubscription({ name: "First", price: 100, currency: "USD", cycle: "monthly", status: "active", tags: [] })
  db.writeSubscription({ name: "Last", price: 100, currency: "USD", cycle: "monthly", status: "paused", tags: [] })

  const subs = db.getSubscriptions("status", false)
  expect(subs[0].status).toBe("active")
  expect(subs[1].status).toBe("cancelled")
  expect(subs[2].status).toBe("paused")
})

test("getSubscriptions sorts by status descending", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Mid", price: 100, currency: "USD", cycle: "monthly", status: "cancelled", tags: [] })
  db.writeSubscription({ name: "First", price: 100, currency: "USD", cycle: "monthly", status: "active", tags: [] })
  db.writeSubscription({ name: "Last", price: 100, currency: "USD", cycle: "monthly", status: "paused", tags: [] })

  const subs = db.getSubscriptions("status", true)
  expect(subs[0].status).toBe("paused")
  expect(subs[1].status).toBe("cancelled")
  expect(subs[2].status).toBe("active")
})

// ── getSubscription ───────────────────────────────────────

test("getSubscription returns a single subscription by id", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Target", price: 500, currency: "JPY", cycle: "monthly", tags: ["test"] })

  const [all] = db.getSubscriptions()
  const found = db.getSubscription(all.id)
  expect(found).toBeDefined()
  expect(found?.name).toBe("Target")
  expect(found?.tags).toEqual(["test"])
})

test("getSubscription returns undefined for non-existent id", async () => {
  const db = await import("../db.ts")
  expect(db.getSubscription(99999)).toBeUndefined()
})

// ── updateSubscription ────────────────────────────────────

test("updateSubscription updates a single field", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Old Name", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })

  const [sub] = db.getSubscriptions()
  db.updateSubscription(sub.id, { name: "New Name" })

  const updated = db.getSubscription(sub.id)
  expect(updated?.name).toBe("New Name")
  expect(updated?.price).toBe(1000)
})

test("updateSubscription updates all fields", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Old", price: 1000, currency: "JPY", cycle: "monthly", tags: ["old"] })

  const [sub] = db.getSubscriptions()
  db.updateSubscription(sub.id, {
    name: "New",
    price: 2000,
    currency: "USD",
    cycle: "yearly",
    tags: ["new"],
  })

  const updated = db.getSubscription(sub.id)
  expect(updated?.name).toBe("New")
  expect(updated?.price).toBe(2000)
  expect(updated?.currency).toBe("USD")
  expect(updated?.cycle).toBe("yearly")
  expect(updated?.tags).toEqual(["new"])
})

test("updateSubscription replaces tags when specified", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Test", price: 500, currency: "JPY", cycle: "monthly", tags: ["old1", "old2"] })

  const [sub] = db.getSubscriptions()
  db.updateSubscription(sub.id, { tags: ["new1"] })

  const updated = db.getSubscription(sub.id)
  expect(updated?.tags).toEqual(["new1"])
})

test("updateSubscription does not clear tags when not specified", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "Test", price: 500, currency: "JPY", cycle: "monthly", tags: ["keep"] })

  const [sub] = db.getSubscriptions()
  db.updateSubscription(sub.id, { name: "Renamed" })

  const updated = db.getSubscription(sub.id)
  expect(updated?.tags).toEqual(["keep"])
})

// ── getTagsWithCount ──────────────────────────────────────

test("getTagsWithCount returns tag usage counts", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["shared"] })
  db.writeSubscription({ name: "S2", price: 200, currency: "JPY", cycle: "monthly", tags: ["shared", "unique"] })

  const tags = db.getTagsWithCount()
  const shared = tags.find((t) => t.name === "shared")
  const unique = tags.find((t) => t.name === "unique")
  expect(shared?.count).toBe(2)
  expect(unique?.count).toBe(1)
})

test("getTagsWithCount returns empty array when no tags exist", async () => {
  const db = await import("../db.ts")
  expect(db.getTagsWithCount()).toEqual([])
})

// ── renameTag ─────────────────────────────────────────────

test("renameTag renames a tag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["old"] })

  const result = db.renameTag("old", "new")
  expect(result).toBe(true)

  const tags = db.getTagsWithCount()
  expect(tags.find((t) => t.name === "old")).toBeUndefined()
  expect(tags.find((t) => t.name === "new")?.count).toBe(1)
})

test("renameTag merges when target name already exists", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["a"] })
  db.writeSubscription({ name: "S2", price: 200, currency: "JPY", cycle: "monthly", tags: ["b"] })

  db.renameTag("a", "b")
  const tags = db.getTagsWithCount()
  const merged = tags.find((t) => t.name === "b")
  expect(merged?.count).toBe(2)
  expect(tags.find((t) => t.name === "a")).toBeUndefined()
})

test("renameTag returns false for non-existent tag", async () => {
  const db = await import("../db.ts")
  expect(db.renameTag("nonexistent", "new")).toBe(false)
})

// ── deleteTag ─────────────────────────────────────────────

test("deleteTag removes a tag", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["remove"] })

  const result = db.deleteTag("remove")
  expect(result).toBe(true)
  expect(db.getTagsWithCount()).toHaveLength(0)
})

test("deleteTag returns false for non-existent tag", async () => {
  const db = await import("../db.ts")
  expect(db.deleteTag("nonexistent")).toBe(false)
})

// ── pruneTags ─────────────────────────────────────────────

test("pruneTags removes orphaned tags", async () => {
  const db = await import("../db.ts")
  // Create tags via subscription
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["keep"] })
  // Orphan tag by deleting subscription (CASCADE removes subscription_tags)
  const [sub] = db.getSubscriptions()
  db.deleteSubscription(sub.id)

  // Re-create the orphan tags directly
  testDb.run("INSERT INTO tags (name) VALUES ('orphan1'), ('orphan2')")

  // keep + orphan1 + orphan2 = 3 orphaned tags
  const count = db.pruneTags()
  expect(count).toBe(3)

  const remaining = db.getTagsWithCount()
  expect(remaining).toHaveLength(0)
})

test("pruneTags does not remove tags still in use", async () => {
  const db = await import("../db.ts")
  db.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["active"] })

  const count = db.pruneTags()
  expect(count).toBe(0)

  const tags = db.getTagsWithCount()
  expect(tags).toHaveLength(1)
  expect(tags[0].name).toBe("active")
})

// ── LLM Usage ─────────────────────────────────────────────

test("addLlmUsage creates a usage entry", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 1000,
    output_tokens: 500,
    cost: 0.5,
    date: "2026-06-19",
    description: "test",
  })

  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 1000,
    output_tokens: 500,
    cost: 0.5,
    date: "2026-06-19",
    description: "test",
  })
})

test("addLlmUsage allows null description", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({
    provider: "anthropic",
    model: "claude-3-opus-20240229",
    input_tokens: 2000,
    output_tokens: 1000,
    cost: 3.0,
    date: "2026-06-18",
    description: null,
  })

  const entries = db.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0].description).toBeNull()
})

test("getLlmUsage filters by provider", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.1, date: "2026-06-01", description: null })
  db.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 200, output_tokens: 100, cost: 0.2, date: "2026-06-02", description: null })

  const entries = db.getLlmUsage({ provider: "openai" })
  expect(entries).toHaveLength(1)
  expect(entries[0].provider).toBe("openai")
})

test("getLlmUsage filters by date range", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.1, date: "2026-06-01", description: null })
  db.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 0.2, date: "2026-06-15", description: null })

  const entries = db.getLlmUsage({ from: "2026-06-10", to: "2026-06-20" })
  expect(entries).toHaveLength(1)
  expect(entries[0].model).toBe("gpt-4o-mini")
})

test("getLlmUsage returns entries ordered by date desc", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "a", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-01", description: null })
  db.addLlmUsage({ provider: "openai", model: "b", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-15", description: null })
  db.addLlmUsage({ provider: "openai", model: "c", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-10", description: null })

  const entries = db.getLlmUsage()
  expect(entries[0].model).toBe("b") // latest first
  expect(entries[1].model).toBe("c")
  expect(entries[2].model).toBe("a")
})

test("deleteLlmUsage removes an entry", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.5, date: "2026-06-19", description: null })

  const before = db.getLlmUsage()
  expect(before).toHaveLength(1)

  const result = db.deleteLlmUsage(before[0].id)
  expect(result).toBe(true)
  expect(db.getLlmUsage()).toHaveLength(0)
})

test("deleteLlmUsage returns false for non-existent id", async () => {
  const db = await import("../db.ts")
  expect(db.deleteLlmUsage(99999)).toBe(false)
})

test("getLlmUsageTotal sums cost in date range", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-06-01", description: null })
  db.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 2.0, date: "2026-06-15", description: null })
  db.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 300, output_tokens: 150, cost: 3.0, date: "2026-07-01", description: null })

  const total = db.getLlmUsageTotal("2026-06-01", "2026-06-30")
  expect(total).toBe(3.0) // 1.0 + 2.0
})

test("getLlmUsageTotalByProvider groups cost by provider", async () => {
  const db = await import("../db.ts")
  db.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-06-01", description: null })
  db.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 2.0, date: "2026-06-15", description: null })
  db.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 300, output_tokens: 150, cost: 3.0, date: "2026-06-10", description: null })

  const byProvider = db.getLlmUsageTotalByProvider("2026-06-01", "2026-06-30")
  expect(byProvider).toHaveLength(2)
  const openai = byProvider.find((p) => p.provider === "openai")
  const anthropic = byProvider.find((p) => p.provider === "anthropic")
  expect(openai?.total).toBe(3.0)
  expect(anthropic?.total).toBe(3.0)
})

// ── Backup / Restore ─────────────────────────────────────

test("getDefaultBackupDir returns path under getDbDir", async () => {
  const db = await import("../db.ts")
  const backupDir = db.getDefaultBackupDir()
  expect(backupDir).toContain(db.getDbDir())
  expect(backupDir).toContain("backups")
})

test("getBackupFiles returns empty for non-existent directory", async () => {
  const db = await import("../db.ts")
  const files = db.getBackupFiles("/nonexistent/path/subtrack-test-backups")
  expect(files).toEqual([])
})

test("getBackupFiles finds .db.gz files", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  try {
    writeFileSync(join(tmpDir, "subtrack_20260620_123456.db.gz"), "fake-gz-content")
    writeFileSync(join(tmpDir, "subtrack_20260619_100000.db"), "fake-db-content")
    writeFileSync(join(tmpDir, "subtrack.db"), "should-be-excluded")

    const db = await import("../db.ts")
    const files = db.getBackupFiles(tmpDir)

    expect(files).toHaveLength(2)
    expect(files.find((f) => f.name === "subtrack_20260620_123456.db.gz")).toBeDefined()
    expect(files.find((f) => f.name === "subtrack_20260619_100000.db")).toBeDefined()
    expect(files.find((f) => f.name === "subtrack.db")).toBeUndefined()
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }
})

test("restoreDb replaces in-memory database", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const initSqlJs2 = await import("sql.js")

  // Create a backup database with different data
  const SQL2 = await initSqlJs2.default()
  const backupDb = new SQL2.Database()
  backupDb.run("CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL, cycle TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', billing_day INTEGER, created_at TEXT NOT NULL DEFAULT (date('now')), notes TEXT)")
  backupDb.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)")
  backupDb.run("CREATE TABLE subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id))")
  backupDb.run("INSERT INTO subscriptions (name, price, currency, cycle) VALUES ('RestoredService', 999, 'USD', 'monthly')")

  const buf = Buffer.from(backupDb.export())
  backupDb.close()

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const backupPath = join(tmpDir, "test_backup.db")
  writeFileSync(backupPath, buf)

  // Current DB has different data
  testDb.run("INSERT INTO subscriptions (name, price, currency, cycle) VALUES ('OldService', 500, 'JPY', 'monthly')")

  const db = await import("../db.ts")

  // Verify current state
  const before = db.getSubscriptions()
  expect(before).toHaveLength(1)
  expect(before[0].name).toBe("OldService")

  // Restore
  db.restoreDb(backupPath)

  // Verify replaced state
  const after = db.getSubscriptions()
  expect(after).toHaveLength(1)
  expect(after[0].name).toBe("RestoredService")
  expect(after[0].price).toBe(999)

  // Cleanup
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("restoreDb throws for invalid schema", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const initSqlJs2 = await import("sql.js")

  // Create a valid SQLite DB but without subscriptions table
  const SQL2 = await initSqlJs2.default()
  const badDb = new SQL2.Database()
  badDb.run("CREATE TABLE random_stuff (id INTEGER PRIMARY KEY)")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  const badPath = join(tmpDir, "bad_backup.db")
  writeFileSync(badPath, Buffer.from(badDb.export()))
  badDb.close()

  const db = await import("../db.ts")
  expect(() => db.restoreDb(badPath)).toThrow("missing 'subscriptions' table")

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

// ── Backup hash ──────────────────────────────────────────

test("getBackupHashPath returns path with .sha256 suffix", async () => {
  const db = await import("../db.ts")
  expect(db.getBackupHashPath("/backups/test.db")).toBe("/backups/test.db.sha256")
  expect(db.getBackupHashPath("/backups/test.db.gz")).toBe("/backups/test.db.gz.sha256")
})

test("writeBackupHash and verifyBackupHash round-trip", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  try {
    const backupPath = join(tmpDir, "test_backup.db")
    writeFileSync(backupPath, "fake database content")

    const db = await import("../db.ts")
    db.writeBackupHash(backupPath)

    // Verify sidecar file exists
    const hashPath = db.getBackupHashPath(backupPath)
    expect(existsSync(hashPath)).toBe(true)

    // Content should be a hex string
    const hashContent = readFileSync(hashPath, "utf-8").trim()
    expect(hashContent).toMatch(/^[a-f0-9]{64}$/)

    // Verification should pass
    expect(db.verifyBackupHash(backupPath)).toBe(true)

    // Tamper with the backup — verification should fail
    writeFileSync(backupPath, "tampered content")
    expect(db.verifyBackupHash(backupPath)).toBe(false)
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }
})

test("verifyBackupHash returns true when no sidecar file (backward compat)", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tmpDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  try {
    const backupPath = join(tmpDir, "legacy_backup.db")
    writeFileSync(backupPath, "some content")

    const db = await import("../db.ts")
    // No .sha256 file — should return true (skip verification)
    expect(db.verifyBackupHash(backupPath)).toBe(true)
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }
})

// ── batchAddLlmUsageFromLog ──────────────────────────────

test("batchAddLlmUsageFromLog adds entries and deduplicates", async () => {
  const db = await import("../db.ts")
  // Re-set in-memory DB (restoreDb tests may have replaced _db)
  db.__setDb(testDb)

  const entries = [
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
  ]

  // First batch: all new
  const r1 = db.batchAddLlmUsageFromLog(entries)
  expect(r1.added).toBe(3)
  expect(r1.skipped).toBe(0)

  // Verify count
  const all1 = db.getLlmUsage({ limit: 100, minCost: 0 })
  expect(all1).toHaveLength(3)

  // Second batch with same entries + 1 new
  const entries2 = [
    ...entries,
    {
      provider: "anthropic",
      model: "claude-4",
      input_tokens: 400,
      output_tokens: 200,
      cost: 1.5,
      date: "2026-06-04",
      description: null,
      generation_id: "msg_ddd",
    },
  ]

  const r2 = db.batchAddLlmUsageFromLog(entries2)
  expect(r2.added).toBe(1) // only msg_ddd
  expect(r2.skipped).toBe(3) // msg_aaa, msg_bbb, msg_ccc

  // Verify final count
  const all2 = db.getLlmUsage({ limit: 100, minCost: 0 })
  expect(all2).toHaveLength(4)
})

test("batchAddLlmUsageFromLog with empty array returns zeroes", async () => {
  const db = await import("../db.ts")
  const r = db.batchAddLlmUsageFromLog([])
  expect(r.added).toBe(0)
  expect(r.skipped).toBe(0)
})
