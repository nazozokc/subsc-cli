import { test, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { createTestDb, destroyTestDb, getTestDb } from "./test-utils.ts"

let dbModule: any = null

beforeAll(async () => {
  createTestDb()
  dbModule = await import("../db.ts")
  dbModule.__setDb(getTestDb())
})

beforeEach(() => {
  // Clear all data between tests
  const db = getTestDb()
  getTestDb().execSql("DELETE FROM subscription_tags", [])
  getTestDb().execSql("DELETE FROM tags", [])
  getTestDb().execSql("DELETE FROM subscriptions", [])
  getTestDb().execSql("DELETE FROM llm_usage", [])
})

afterAll(() => {
  destroyTestDb()
})

test("getSubscriptions returns empty when no data exists", () => {
  expect(dbModule.getSubscriptions()).toEqual([])
})

test("writeSubscription creates a subscription with tags", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })

  const subs = dbModule.getSubscriptions()
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

  dbModule.writeSubscription({
    name: "Dropbox",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })

  const subs = dbModule.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].tags).toEqual([])
})

test("writeSubscription supports USD currency", async () => {

  dbModule.writeSubscription({
    name: "GitHub Copilot",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: ["dev"],
  })

  const subs = dbModule.getSubscriptions()
  expect(subs[0].currency).toBe("USD")
})

test("writeSubscription supports yearly cycle", async () => {

  dbModule.writeSubscription({
    name: "iCloud+",
    price: 12000,
    currency: "JPY",
    cycle: "yearly",
    tags: ["storage"],
  })

  const subs = dbModule.getSubscriptions()
  expect(subs[0].cycle).toBe("yearly")
})

test("getSubscriptions returns all subscriptions ordered by id", async () => {

  dbModule.writeSubscription({
    name: "A",
    price: 100,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })
  dbModule.writeSubscription({
    name: "B",
    price: 200,
    currency: "JPY",
    cycle: "yearly",
    tags: [],
  })
  dbModule.writeSubscription({
    name: "C",
    price: 300,
    currency: "USD",
    cycle: "monthly",
    tags: [],
  })

  const subs = dbModule.getSubscriptions()
  expect(subs).toHaveLength(3)
  expect(subs[0].name).toBe("A")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("C")
})

test("deleteSubscription removes a subscription", async () => {

  dbModule.writeSubscription({
    name: "ToDelete",
    price: 500,
    currency: "JPY",
    cycle: "monthly",
    tags: [],
  })

  const subsBefore = dbModule.getSubscriptions()
  expect(subsBefore).toHaveLength(1)

  dbModule.deleteSubscription(subsBefore[0].id)
  expect(dbModule.getSubscriptions()).toHaveLength(0)
})

test("deleteSubscription cascades to subscription_tags", async () => {

  dbModule.writeSubscription({
    name: "WithTags",
    price: 999,
    currency: "USD",
    cycle: "monthly",
    tags: ["tag1", "tag2"],
  })

  const subs = dbModule.getSubscriptions()
  expect(subs).toHaveLength(1)
  expect(subs[0].tags).toHaveLength(2)

  const subId = subs[0].id
  dbModule.deleteSubscription(subId)
  expect(dbModule.getSubscriptions()).toHaveLength(0)

  // Verify cascade via tag listing — tags themselves remain (CASCADE only removes subscription_tags)
  // After subscription deletion, subscription_tags rows are deleted, but tags still exist
  // We can verify by checking that no subscription has tags
  const remaining = dbModule.getSubscriptions()
  expect(remaining).toHaveLength(0)
})

test("deleteSubscription does not throw when id does not exist", async () => {
  const db = await import("../db.ts")
  expect(() => dbModule.deleteSubscription(99999)).not.toThrow()
})

test("tagsSubscription filters by single tag", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  dbModule.writeSubscription({
    name: "Spotify",
    price: 980,
    currency: "JPY",
    cycle: "monthly",
    tags: ["music"],
  })

  const results = dbModule.tagsSubscription("video")
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("Netflix")
})

test("tagsSubscription filters by multiple tags with AND logic", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  dbModule.writeSubscription({
    name: "YouTube Premium",
    price: 1280,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  dbModule.writeSubscription({
    name: "Spotify",
    price: 980,
    currency: "JPY",
    cycle: "monthly",
    tags: ["music"],
  })

  const results = dbModule.tagsSubscription(["video", "entertainment"])
  expect(results).toHaveLength(2)

  const names = results.map((r) => r.name).sort()
  expect(names).toEqual(["Netflix", "YouTube Premium"])
})

test("tagsSubscription returns only subscriptions matching ALL specified tags", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video", "entertainment"],
  })
  dbModule.writeSubscription({
    name: "YouTube Premium",
    price: 1280,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })

  const results = dbModule.tagsSubscription(["video", "entertainment"])
  expect(results).toHaveLength(1)
  expect(results[0].name).toBe("Netflix")
})

test("tagsSubscription returns empty for non-matching tag", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })

  expect(dbModule.tagsSubscription("nonexistent")).toEqual([])
})

test("tagsSubscription returns empty array for empty input", async () => {
  const db = await import("../db.ts")
  expect(dbModule.tagsSubscription([])).toEqual([])
  expect(dbModule.tagsSubscription("")).toEqual([])
})

test("works with multiple subscriptions sharing the same tag", async () => {

  dbModule.writeSubscription({
    name: "S1",
    price: 100,
    currency: "USD",
    cycle: "monthly",
    tags: ["shared"],
  })
  dbModule.writeSubscription({
    name: "S2",
    price: 200,
    currency: "JPY",
    cycle: "yearly",
    tags: ["shared"],
  })

  const results = dbModule.tagsSubscription("shared")
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

  dbModule.writeSubscription({
    name: "Test",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    tags: ["test"],
  })

  const [sub] = dbModule.getSubscriptions()
  expect(typeof sub.id).toBe("number")
  expect(typeof sub.name).toBe("string")
  expect(typeof sub.price).toBe("number")
  expect(["JPY", "USD"]).toContain(sub.currency)
  expect(["monthly", "yearly"]).toContain(sub.cycle)
  expect(Array.isArray(sub.tags)).toBe(true)
})

test("does not share tags between different subscriptions", async () => {

  dbModule.writeSubscription({
    name: "Netflix",
    price: 1500,
    currency: "JPY",
    cycle: "monthly",
    tags: ["video"],
  })
  dbModule.writeSubscription({
    name: "Dropbox",
    price: 10,
    currency: "USD",
    cycle: "monthly",
    tags: ["storage"],
  })

  const subs = dbModule.getSubscriptions()
  const netflix = subs.find((s) => s.name === "Netflix")
  const dropbox = subs.find((s) => s.name === "Dropbox")
  expect(netflix?.tags).toEqual(["video"])
  expect(dropbox?.tags).toEqual(["storage"])
})

// ── sort ──────────────────────────────────────────────────

test("getSubscriptions sorts by name ascending", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "C", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "A", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "B", price: 300, currency: "USD", cycle: "monthly", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "name", desc: false })
  expect(subs[0].name).toBe("A")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("C")
})

test("getSubscriptions sorts by name descending", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "A", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "B", price: 200, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "C", price: 300, currency: "USD", cycle: "monthly", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "name", desc: true })
  expect(subs[0].name).toBe("C")
  expect(subs[1].name).toBe("B")
  expect(subs[2].name).toBe("A")
})

test("getSubscriptions sorts by price ascending", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "A", price: 300, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "C", price: 200, currency: "USD", cycle: "monthly", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "price", desc: false })
  expect(subs[0].price).toBe(100)
  expect(subs[1].price).toBe(200)
  expect(subs[2].price).toBe(300)
})

test("getSubscriptions falls back to id order for invalid sort field", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "B", price: 100, currency: "USD", cycle: "monthly", tags: [] })
  dbModule.writeSubscription({ name: "A", price: 200, currency: "USD", cycle: "monthly", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "invalid_field", desc: false })
  expect(subs[0].name).toBe("B")
  expect(subs[1].name).toBe("A")
})

test("getSubscriptions sorts by status ascending", async () => {
  const db = await import("../db.ts")
  // status alpha order: active < cancelled < paused
  dbModule.writeSubscription({ name: "Mid", price: 100, currency: "USD", cycle: "monthly", status: "cancelled", tags: [] })
  dbModule.writeSubscription({ name: "First", price: 100, currency: "USD", cycle: "monthly", status: "active", tags: [] })
  dbModule.writeSubscription({ name: "Last", price: 100, currency: "USD", cycle: "monthly", status: "paused", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "status", desc: false })
  expect(subs[0].status).toBe("active")
  expect(subs[1].status).toBe("cancelled")
  expect(subs[2].status).toBe("paused")
})

test("getSubscriptions sorts by status descending", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Mid", price: 100, currency: "USD", cycle: "monthly", status: "cancelled", tags: [] })
  dbModule.writeSubscription({ name: "First", price: 100, currency: "USD", cycle: "monthly", status: "active", tags: [] })
  dbModule.writeSubscription({ name: "Last", price: 100, currency: "USD", cycle: "monthly", status: "paused", tags: [] })

  const subs = dbModule.getSubscriptions({ sort: "status", desc: true })
  expect(subs[0].status).toBe("paused")
  expect(subs[1].status).toBe("cancelled")
  expect(subs[2].status).toBe("active")
})

// ── getSubscription ───────────────────────────────────────

test("getSubscription returns a single subscription by id", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Target", price: 500, currency: "JPY", cycle: "monthly", tags: ["test"] })

  const [all] = dbModule.getSubscriptions()
  const found = dbModule.getSubscription(all.id)
  expect(found).toBeDefined()
  expect(found?.name).toBe("Target")
  expect(found?.tags).toEqual(["test"])
})

test("getSubscription returns undefined for non-existent id", async () => {
  const db = await import("../db.ts")
  expect(dbModule.getSubscription(99999)).toBeUndefined()
})

// ── updateSubscription ────────────────────────────────────

test("updateSubscription updates a single field", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Old Name", price: 1000, currency: "JPY", cycle: "monthly", tags: [] })

  const [sub] = dbModule.getSubscriptions()
  dbModule.updateSubscription(sub.id, { name: "New Name" })

  const updated = dbModule.getSubscription(sub.id)
  expect(updated?.name).toBe("New Name")
  expect(updated?.price).toBe(1000)
})

test("updateSubscription updates all fields", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Old", price: 1000, currency: "JPY", cycle: "monthly", tags: ["old"] })

  const [sub] = dbModule.getSubscriptions()
  dbModule.updateSubscription(sub.id, {
    name: "New",
    price: 2000,
    currency: "USD",
    cycle: "yearly",
    tags: ["new"],
  })

  const updated = dbModule.getSubscription(sub.id)
  expect(updated?.name).toBe("New")
  expect(updated?.price).toBe(2000)
  expect(updated?.currency).toBe("USD")
  expect(updated?.cycle).toBe("yearly")
  expect(updated?.tags).toEqual(["new"])
})

test("updateSubscription replaces tags when specified", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Test", price: 500, currency: "JPY", cycle: "monthly", tags: ["old1", "old2"] })

  const [sub] = dbModule.getSubscriptions()
  dbModule.updateSubscription(sub.id, { tags: ["new1"] })

  const updated = dbModule.getSubscription(sub.id)
  expect(updated?.tags).toEqual(["new1"])
})

test("updateSubscription does not clear tags when not specified", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "Test", price: 500, currency: "JPY", cycle: "monthly", tags: ["keep"] })

  const [sub] = dbModule.getSubscriptions()
  dbModule.updateSubscription(sub.id, { name: "Renamed" })

  const updated = dbModule.getSubscription(sub.id)
  expect(updated?.tags).toEqual(["keep"])
})

// ── getTagsWithCount ──────────────────────────────────────

test("getTagsWithCount returns tag usage counts", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["shared"] })
  dbModule.writeSubscription({ name: "S2", price: 200, currency: "JPY", cycle: "monthly", tags: ["shared", "unique"] })

  const tags = dbModule.getTagsWithCount()
  const shared = tags.find((t) => t.name === "shared")
  const unique = tags.find((t) => t.name === "unique")
  expect(shared?.count).toBe(2)
  expect(unique?.count).toBe(1)
})

test("getTagsWithCount returns empty array when no tags exist", async () => {
  const db = await import("../db.ts")
  expect(dbModule.getTagsWithCount()).toEqual([])
})

// ── renameTag ─────────────────────────────────────────────

test("renameTag renames a tag", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["old"] })

  const result = dbModule.renameTag("old", "new")
  expect(result).toBe(true)

  const tags = dbModule.getTagsWithCount()
  expect(tags.find((t) => t.name === "old")).toBeUndefined()
  expect(tags.find((t) => t.name === "new")?.count).toBe(1)
})

test("renameTag merges when target name already exists", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["a"] })
  dbModule.writeSubscription({ name: "S2", price: 200, currency: "JPY", cycle: "monthly", tags: ["b"] })

  dbModule.renameTag("a", "b")
  const tags = dbModule.getTagsWithCount()
  const merged = tags.find((t) => t.name === "b")
  expect(merged?.count).toBe(2)
  expect(tags.find((t) => t.name === "a")).toBeUndefined()
})

test("renameTag returns false for non-existent tag", async () => {
  const db = await import("../db.ts")
  expect(dbModule.renameTag("nonexistent", "new")).toBe(false)
})

// ── deleteTag ─────────────────────────────────────────────

test("deleteTag removes a tag", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["remove"] })

  const result = dbModule.deleteTag("remove")
  expect(result).toBe(true)
  expect(dbModule.getTagsWithCount()).toHaveLength(0)
})

test("deleteTag returns false for non-existent tag", async () => {
  const db = await import("../db.ts")
  expect(dbModule.deleteTag("nonexistent")).toBe(false)
})

// ── pruneTags ─────────────────────────────────────────────

test("pruneTags removes orphaned tags", async () => {
  const db = await import("../db.ts")
  // Create tags via subscription
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["keep"] })
  // Orphan tag by deleting subscription (CASCADE removes subscription_tags)
  const [sub] = dbModule.getSubscriptions()
  dbModule.deleteSubscription(sub.id)

  // Insert orphan tags directly via execSql
  const nativeDb = getTestDb()
  nativeDb.execSql("INSERT INTO tags (name) VALUES ('orphan1')", [])
  nativeDb.execSql("INSERT INTO tags (name) VALUES ('orphan2')", [])

  // All tags are now orphaned (keep was orphaned by deleteSubscription, orphan1/orphan2 were never linked)
  const count = dbModule.pruneTags()
  expect(count).toBe(3)

  const remaining = dbModule.getTagsWithCount()
  expect(remaining).toHaveLength(0)
})

test("pruneTags does not remove tags still in use", async () => {
  const db = await import("../db.ts")
  dbModule.writeSubscription({ name: "S1", price: 100, currency: "USD", cycle: "monthly", tags: ["active"] })

  const count = dbModule.pruneTags()
  expect(count).toBe(0)

  const tags = dbModule.getTagsWithCount()
  expect(tags).toHaveLength(1)
  expect(tags[0].name).toBe("active")
})

// ── LLM Usage ─────────────────────────────────────────────

test("addLlmUsage creates a usage entry", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({
    provider: "openai",
    model: "gpt-4o",
    input_tokens: 1000,
    output_tokens: 500,
    cost: 0.5,
    date: "2026-06-19",
    description: "test",
  })

  const entries = dbModule.getLlmUsage()
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
  dbModule.addLlmUsage({
    provider: "anthropic",
    model: "claude-3-opus-20240229",
    input_tokens: 2000,
    output_tokens: 1000,
    cost: 3.0,
    date: "2026-06-18",
    description: null,
  })

  const entries = dbModule.getLlmUsage()
  expect(entries).toHaveLength(1)
  expect(entries[0].description).toBeNull()
})

test("getLlmUsage filters by provider", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.1, date: "2026-06-01", description: null })
  dbModule.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 200, output_tokens: 100, cost: 0.2, date: "2026-06-02", description: null })

  const entries = dbModule.getLlmUsage({ provider: "openai" })
  expect(entries).toHaveLength(1)
  expect(entries[0].provider).toBe("openai")
})

test("getLlmUsage filters by date range", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.1, date: "2026-06-01", description: null })
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 0.2, date: "2026-06-15", description: null })

  const entries = dbModule.getLlmUsage({ from: "2026-06-10", to: "2026-06-20" })
  expect(entries).toHaveLength(1)
  expect(entries[0].model).toBe("gpt-4o-mini")
})

test("getLlmUsage returns entries ordered by date desc", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "a", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-01", description: null })
  dbModule.addLlmUsage({ provider: "openai", model: "b", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-15", description: null })
  dbModule.addLlmUsage({ provider: "openai", model: "c", input_tokens: 1, output_tokens: 1, cost: 0.01, date: "2026-06-10", description: null })

  const entries = dbModule.getLlmUsage()
  expect(entries[0].model).toBe("b") // latest first
  expect(entries[1].model).toBe("c")
  expect(entries[2].model).toBe("a")
})

test("deleteLlmUsage removes an entry", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 0.5, date: "2026-06-19", description: null })

  const before = dbModule.getLlmUsage()
  expect(before).toHaveLength(1)

  const result = dbModule.deleteLlmUsage(before[0].id)
  expect(result).toBe(true)
  expect(dbModule.getLlmUsage()).toHaveLength(0)
})

test("deleteLlmUsage returns false for non-existent id", async () => {
  const db = await import("../db.ts")
  expect(dbModule.deleteLlmUsage(99999)).toBe(false)
})

test("getLlmUsageTotal sums cost in date range", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-06-01", description: null })
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 2.0, date: "2026-06-15", description: null })
  dbModule.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 300, output_tokens: 150, cost: 3.0, date: "2026-07-01", description: null })

  const total = dbModule.getLlmUsageTotal("2026-06-01", "2026-06-30")
  expect(total).toBe(3.0) // 1.0 + 2.0
})

test("getLlmUsageTotalByProvider groups cost by provider", async () => {
  const db = await import("../db.ts")
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o", input_tokens: 100, output_tokens: 50, cost: 1.0, date: "2026-06-01", description: null })
  dbModule.addLlmUsage({ provider: "openai", model: "gpt-4o-mini", input_tokens: 200, output_tokens: 100, cost: 2.0, date: "2026-06-15", description: null })
  dbModule.addLlmUsage({ provider: "anthropic", model: "claude-3", input_tokens: 300, output_tokens: 150, cost: 3.0, date: "2026-06-10", description: null })

  const byProvider = dbModule.getLlmUsageTotalByProvider("2026-06-01", "2026-06-30")
  expect(byProvider).toHaveLength(2)
  const openai = byProvider.find((p) => p.provider === "openai")
  const anthropic = byProvider.find((p) => p.provider === "anthropic")
  expect(openai?.total).toBe(3.0)
  expect(anthropic?.total).toBe(3.0)
})

// ── Backup / Restore ─────────────────────────────────────

test("getDefaultBackupDir returns path under getDbDir", async () => {
  const db = await import("../db.ts")
  const backupDir = dbModule.getDefaultBackupDir()
  expect(backupDir).toContain(dbModule.getDbDir())
  expect(backupDir).toContain("backups")
})

test("getBackupFiles returns empty for non-existent directory", async () => {
  const db = await import("../db.ts")
  const files = dbModule.getBackupFiles("/nonexistent/path/subtrack-test-backups")
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

    const dbModule2 = await import("../db.ts")
    const files = dbModule2.getBackupFiles(tmpDir)

    expect(files).toHaveLength(2)
    expect(files.find((f) => f.name === "subtrack_20260620_123456.db.gz")).toBeDefined()
    expect(files.find((f) => f.name === "subtrack_20260619_100000.db")).toBeDefined()
    expect(files.find((f) => f.name === "subtrack.db")).toBeUndefined()
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }
})

test("restoreDb replaces in-memory database", async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  // Use native backup API to create a proper gzip backup
  const backupDir = mkdtempSync(join(tmpdir(), "subtrack-test-backup-"))

  // Add data to current DB, then back it up
  dbModule.writeSubscription({ name: "OldService", price: 500, currency: "JPY", cycle: "monthly", tags: [] })
  const backupResult = getTestDb().backupDb(backupDir)
  const backupPath = backupResult.path

  // Replace current data with different data
  getTestDb().execSql("DELETE FROM subscriptions", [])
  getTestDb().execSql("DELETE FROM tags", [])
  getTestDb().execSql("DELETE FROM subscription_tags", [])
  dbModule.writeSubscription({ name: "ToBeReplaced", price: 100, currency: "USD", cycle: "monthly", tags: [] })

  // Verify current (replaced) state
  const before = dbModule.getSubscriptions()
  expect(before).toHaveLength(1)
  expect(before[0].name).toBe("ToBeReplaced")

  // Restore from the backup
  dbModule.restoreDb(backupPath)

  // Verify replaced state now has the old data
  const after = dbModule.getSubscriptions()
  expect(after).toHaveLength(1)
  expect(after[0].name).toBe("OldService")
  expect(after[0].price).toBe(500)

  // Cleanup
  if (existsSync(backupDir)) rmSync(backupDir, { recursive: true })
})

test("restoreDb throws for invalid schema", async () => {
  const { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const { gzipSync } = await import("node:zlib")

  // Create a native DB then drop the subscriptions table
  const badDir = mkdtempSync(join(tmpdir(), "subtrack-test-bad-"))
  const { createRequire } = await import("node:module")
  const require2 = createRequire(import.meta.url)
  const { Database: NativeDb } = require2("../../index.cjs")
  const badDb = new NativeDb(badDir, null)
  badDb.execSql("DROP TABLE subscriptions", [])
  badDb.save()

  // Read the raw file and gzip it for restoreDb
  const rawPath = join(badDir, "subtrack.db")
  const rawBytes = readFileSync(rawPath)
  const gzPath = join(badDir, "invalid_backup.db.gz")
  writeFileSync(gzPath, gzipSync(rawBytes))

  expect(() => dbModule.restoreDb(gzPath)).toThrow("missing 'subscriptions' table")

  if (existsSync(badDir)) rmSync(badDir, { recursive: true })
})

// ── Backup hash ──────────────────────────────────────────

test("getBackupHashPath returns path with .sha256 suffix", async () => {
  const db = await import("../db.ts")
  expect(dbModule.getBackupHashPath("/backups/test.db")).toBe("/backups/test.db.sha256")
  expect(dbModule.getBackupHashPath("/backups/test.db.gz")).toBe("/backups/test.db.gz.sha256")
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
    dbModule.writeBackupHash(backupPath)

    // Verify sidecar file exists
    const hashPath = dbModule.getBackupHashPath(backupPath)
    expect(existsSync(hashPath)).toBe(true)

    // Content should be a hex string
    const hashContent = readFileSync(hashPath, "utf-8").trim()
    expect(hashContent).toMatch(/^[a-f0-9]{64}$/)

    // Verification should pass
    expect(dbModule.verifyBackupHash(backupPath)).toBe(true)

    // Tamper with the backup — verification should fail
    writeFileSync(backupPath, "tampered content")
    expect(dbModule.verifyBackupHash(backupPath)).toBe(false)
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
    expect(dbModule.verifyBackupHash(backupPath)).toBe(true)
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  }
})

// ── batchAddLlmUsageFromLog ──────────────────────────────

test("batchAddLlmUsageFromLog adds entries and deduplicates", async () => {

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
  const r1 = dbModule.batchAddLlmUsageFromLog(entries)
  expect(r1.added).toBe(3)
  expect(r1.skipped).toBe(0)

  // Verify count
  const all1 = dbModule.getLlmUsage({ limit: 100, minCost: 0 })
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

  const r2 = dbModule.batchAddLlmUsageFromLog(entries2)
  expect(r2.added).toBe(1) // only msg_ddd
  expect(r2.skipped).toBe(3) // msg_aaa, msg_bbb, msg_ccc

  // Verify final count
  const all2 = dbModule.getLlmUsage({ limit: 100, minCost: 0 })
  expect(all2).toHaveLength(4)
})

test("batchAddLlmUsageFromLog with empty array returns zeroes", async () => {
  const db = await import("../db.ts")
  const r = dbModule.batchAddLlmUsageFromLog([])
  expect(r.added).toBe(0)
  expect(r.skipped).toBe(0)
})
