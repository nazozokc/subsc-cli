import { test, expect, beforeAll, afterAll, beforeEach, afterEach, describe } from "vitest"
import { consola } from "consola"
import initSqlJs from "sql.js"
import type { Database } from "sql.js"
import { spreadSubscription } from "../display"
import type { SharedArgs } from "../types.ts"

const logMessages: string[] = []
const infoMessages: string[] = []
const failMessages: string[] = []
const errorMessages: string[] = []

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  logMessages.length = 0
  infoMessages.length = 0
  failMessages.length = 0
  errorMessages.length = 0

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

  consola.mockTypes((_type: string, _defaults: object) => {
    return (...args: unknown[]) => {
      const str = args.map((a) => String(a)).join(" ")
      const clean = stripAnsi(str)
      if (_type === "log") logMessages.push(clean)
      if (_type === "info") infoMessages.push(clean)
      if (_type === "fail") failMessages.push(clean)
      if (_type === "error") errorMessages.push(clean)
    }
  })

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
})

function makeSub(overrides: Partial<SharedArgs> = {}): SharedArgs {
  return {
    id: 1,
    name: "Test Service",
    price: 1000,
    currency: "JPY",
    cycle: "monthly",
    tags: [],
    status: "active",
    billingDay: null,
    createdAt: "2026-01-01",
    notes: null,
    paymentMethod: null,
    ...overrides,
  }
}

test("shows info message when no subscriptions", async () => {
  await spreadSubscription([])
  expect(infoMessages).toContain("No subscriptions found")
  expect(logMessages).toHaveLength(0)
})

test("displays table with single subscription", async () => {
  await spreadSubscription([makeSub({ name: "Netflix", price: 1500 })])

  expect(logMessages).toHaveLength(1)
  const table = logMessages[0]
  expect(table).toContain("Netflix")
  expect(table).toContain("¥1,500")
  expect(table).toContain("monthly")
  expect(table).toContain("JPY TOTAL")
})

test("displays table with JPY currency symbol", async () => {
  await spreadSubscription([
    makeSub({ name: "iCloud+", price: 400, currency: "JPY" }),
  ])

  const table = logMessages[0]
  expect(table).toContain("¥400")
  expect(table).toContain("JPY TOTAL")
})

test("displays table with USD currency symbol", async () => {
  await spreadSubscription([
    makeSub({ name: "GitHub", price: 10, currency: "USD" }),
  ])

  const table = logMessages[0]
  expect(table).toContain("$10")
})

test("displays tags column", async () => {
  await spreadSubscription([
    makeSub({ name: "Netflix", tags: ["video", "entertainment"] }),
  ])

  const table = logMessages[0]
  expect(table).toContain("video, entertainment")
})

test("displays dash when no tags", async () => {
  await spreadSubscription([makeSub({ name: "Dropbox", tags: [] })])

  const table = logMessages[0]
  expect(table).toContain("Dropbox")
  expect(table).toContain("-")
})

test("shows correct JPY total", async () => {
  await spreadSubscription([
    makeSub({ name: "A", price: 500, currency: "JPY" }),
    makeSub({ name: "B", price: 1500, currency: "JPY" }),
  ])

  const table = logMessages[0]
  expect(table).toContain("¥2,000")
  expect(table).toContain("JPY TOTAL")
})

test("shows correct USD total", async () => {
  await spreadSubscription([
    makeSub({ name: "A", price: 10, currency: "USD" }),
    makeSub({ name: "B", price: 20, currency: "USD" }),
  ])

  const table = logMessages[0]
  expect(table).toContain("$30")
  expect(table).toContain("USD TOTAL")
})

test("shows mixed currency totals correctly", async () => {
  await spreadSubscription([
    makeSub({ name: "JP", price: 1000, currency: "JPY" }),
    makeSub({ name: "US", price: 15, currency: "USD" }),
  ])

  const table = logMessages.filter(Boolean).join("\n")
  expect(table).toContain("¥1,000")
  expect(table).toContain("JPY TOTAL")
  expect(table).toContain("$15")
  expect(table).toContain("USD TOTAL")
})

test("shows yearly cycle", async () => {
  await spreadSubscription([makeSub({ name: "Annual", cycle: "yearly" })])

  const table = logMessages[0]
  expect(table).toContain("yearly")
})

test("displays multiple subscriptions", async () => {
  const subs = [
    makeSub({ id: 1, name: "A", price: 10, currency: "USD", tags: ["x"] }),
    makeSub({ id: 2, name: "B", price: 20, currency: "USD", tags: ["y"] }),
    makeSub({ id: 3, name: "C", price: 30, currency: "USD", tags: ["z"] }),
  ]

  await spreadSubscription(subs)

  const table = logMessages[0]
  expect(table).toContain("A")
  expect(table).toContain("B")
  expect(table).toContain("C")
  expect(table).toContain("$60")
  expect(table).toContain("USD TOTAL")
})

// --- --currency filter tests ---

test("currency JPY converts USD prices and shows single total", async () => {
  await spreadSubscription(
    [
      makeSub({ name: "Local", price: 1000, currency: "JPY" }),
      makeSub({ name: "Foreign", price: 10, currency: "USD" }),
    ],
    "JPY",
  )

  const table = logMessages[0]
  // JPY 1000 stays 1000
  expect(table).toContain("¥1,000")
  // USD 10 × 160 = 1600
  expect(table).toContain("¥1,600")
  // Single JPY TOTAL
  expect(table).toContain("JPY TOTAL")
  expect(table).toContain("¥2,600")
  // No USD TOTAL
  expect(table).not.toContain("USD TOTAL")
})

test("currency USD converts JPY prices and shows single total", async () => {
  await spreadSubscription(
    [
      makeSub({ name: "Local", price: 10, currency: "USD" }),
      makeSub({ name: "Foreign", price: 1600, currency: "JPY" }),
    ],
    "USD",
  )

  const table = logMessages[0]
  // USD 10 stays 10
  expect(table).toContain("$10")
  // JPY 1600 → 1600 / 160 = 10
  expect(table).toContain("$10")
  // Single USD TOTAL
  expect(table).toContain("USD TOTAL")
  // No JPY TOTAL
  expect(table).not.toContain("JPY TOTAL")
})

test("currency JPY with all JPY items shows correctly", async () => {
  await spreadSubscription(
    [
      makeSub({ name: "A", price: 500, currency: "JPY" }),
      makeSub({ name: "B", price: 1500, currency: "JPY" }),
    ],
    "JPY",
  )

  const table = logMessages[0]
  expect(table).toContain("¥500")
  expect(table).toContain("¥1,500")
  expect(table).toContain("¥2,000")
  expect(table).not.toContain("USD TOTAL")
})

test("currency falls back when fetch fails", async () => {
  globalThis.fetch = async () => {
    throw new Error("Network error")
  }

  await spreadSubscription(
    [
      makeSub({ name: "JP", price: 1000, currency: "JPY" }),
      makeSub({ name: "US", price: 15, currency: "USD" }),
    ],
    "JPY",
  )

  // Should log fail message
  expect(failMessages.length).toBeGreaterThan(0)
  expect(failMessages[0]).toContain("Failed to fetch exchange rates")

  // Should fall back to grouped-by-currency display
  const table = logMessages.filter(Boolean).join("\n")
  expect(table).toContain("¥1,000")
  expect(table).toContain("$15")
  expect(table).toContain("JPY TOTAL")
  expect(table).toContain("USD TOTAL")
})

test("currency with empty list shows info", async () => {
  await spreadSubscription([], "JPY")
  expect(infoMessages).toContain("No subscriptions found")
})

// ── exportCsv tests ──────────────────────────────────────

function expectedCsvHeader(): string {
  return "\uFEFFname,status,cycle,tags,price,currency,notes,payment_method,contract_start,contract_end,auto_renewal,vendor_name,vendor_url,plan_tier,discount_amount,discount_type"
}

function expectedCsvRow(name: string, cycle = "monthly", tags = "", price = "1000", currency = "JPY", status = "active"): string {
  return `${name},${status},${cycle},${tags},${price},${currency},,,,,false,,,,,`
}

test("exportCsv returns header-only when no subscriptions", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([])
  expect(csv).toBe(expectedCsvHeader())
})

test("exportCsv produces correct csv for single subscription", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([makeSub({ name: "Netflix", price: 1500, currency: "JPY" })])
  const lines = csv.split("\n")
  expect(lines).toHaveLength(2)
  expect(lines[0]).toBe(expectedCsvHeader())
  expect(lines[1]).toBe(expectedCsvRow("Netflix", "monthly", "", "1500", "JPY"))
})

test("exportCsv handles tags correctly", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([
    makeSub({ name: "Netflix", tags: ["video", "entertainment"] }),
  ])
  const lines = csv.split("\n")
  expect(lines[1]).toBe(expectedCsvRow("Netflix", "monthly", "video;entertainment", "1000", "JPY"))
})

test("exportCsv escapes commas in name", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([
    makeSub({ name: "Service, Inc.", price: 100 }),
  ])
  const lines = csv.split("\n")
  expect(lines[1]).toBe(expectedCsvRow('"Service, Inc."', "monthly", "", "100", "JPY"))
})

test("exportCsv handles multiple subscriptions", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([
    makeSub({ id: 1, name: "A", price: 10, currency: "USD", tags: ["x"] }),
    makeSub({ id: 2, name: "B", price: 20, currency: "USD", tags: ["y"] }),
  ])
  const lines = csv.split("\n")
  expect(lines).toHaveLength(3)
  expect(lines[1]).toBe(expectedCsvRow("A", "monthly", "x", "10", "USD"))
  expect(lines[2]).toBe(expectedCsvRow("B", "monthly", "y", "20", "USD"))
})

test("exportCsv begins with BOM", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([makeSub()])
  expect(csv.charCodeAt(0)).toBe(0xfeff)
})

test("exportCsv escapes formula injection chars in ALL fields (status, cycle, price, currency)", async () => {
  const { exportCsv } = await import("../export.ts")
  const csv = exportCsv([
    makeSub({
      name: "safe",
      status: "=SUM(A1)" as SharedArgs["status"],
      cycle: "+SUM(B1)" as SharedArgs["cycle"],
      currency: "@SUM(C1)" as SharedArgs["currency"],
      price: -42,
    }),
  ])
  const row = csv.split("\n")[1]!
  // Formula-prefixed values must be neutralized with a tab prefix
  expect(row).toContain("\t=SUM(A1)")
  expect(row).toContain("\t+SUM(B1)")
  expect(row).toContain("\t@SUM(C1)")
  // The formula prefix must not appear raw
  expect(row).not.toMatch(/,=SUM/)
  expect(row).not.toMatch(/,@SUM/)
})

test("exportIcs strips bare CR characters (line injection) from fields", async () => {
  const { exportIcs } = await import("../export.ts")
  const ics = exportIcs([
    makeSub({ name: "Injected\rBEGIN:VEVENT", notes: "evil\rEND:VCALENDAR" }),
  ])
  // Line-level injection impossible: exactly one real BEGIN:VEVENT / END:VCALENDAR
  const lines = ics.split(/\r?\n/)
  expect(lines.filter((l) => l.trim() === "BEGIN:VEVENT")).toHaveLength(1)
  expect(lines.filter((l) => l.trim() === "END:VCALENDAR")).toHaveLength(1)
  // Injected content is escaped as \\n text on a single line, not a new line
  expect(ics).toContain("SUMMARY:Injected\\nBEGIN:VEVENT")
  expect(ics).toContain("DESCRIPTION:Notes: evil\\nEND:VCALENDAR")
})

// ── exportMd tests ───────────────────────────────────────

test("exportMd returns header and separator when no subscriptions", async () => {
  const { exportMd } = await import("../export.ts")
  const md = exportMd([])
  expect(md).toBe("| name | status | cycle | tags | price | currency | notes | payment_method | contract | vendor | plan | discount |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
})

test("exportMd produces correct markdown for single subscription", async () => {
  const { exportMd } = await import("../export.ts")
  const md = exportMd([makeSub({ name: "Netflix", price: 1500, currency: "JPY" })])
  const lines = md.split("\n")
  expect(lines).toHaveLength(3)
  expect(lines[2]).toBe("| Netflix | active | monthly | - | ¥1,500 | JPY | - | - | - | - | - | - |")
})

test("exportMd handles tags correctly", async () => {
  const { exportMd } = await import("../export.ts")
  const md = exportMd([
    makeSub({ name: "Netflix", tags: ["video", "entertainment"] }),
  ])
  const lines = md.split("\n")
  expect(lines[2]).toBe("| Netflix | active | monthly | video, entertainment | ¥1,000 | JPY | - | - | - | - | - | - |")
})

test("exportMd handles multiple subscriptions", async () => {
  const { exportMd } = await import("../export.ts")
  const md = exportMd([
    makeSub({ id: 1, name: "A", price: 10, currency: "USD", tags: ["x"] }),
    makeSub({ id: 2, name: "B", price: 20, currency: "USD", tags: [] }),
  ])
  const lines = md.split("\n")
  expect(lines).toHaveLength(4)
  expect(lines[2]).toBe("| A | active | monthly | x | $10 | USD | - | - | - | - | - | - |")
  expect(lines[3]).toBe("| B | active | monthly | - | $20 | USD | - | - | - | - | - | - |")
})

// ── showPayment tests ────────────────────────────────────

test("showPayment shows info when no subscriptions", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("monthly", undefined, [])
  expect(infoMessages).toContain("No subscriptions found")
})

test("showPayment shows monthly total for single currency", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("monthly", undefined, [
    makeSub({ name: "Netflix", price: 1500, currency: "JPY" }),
  ])
  expect(logMessages).toHaveLength(1)
  expect(logMessages[0]).toContain("¥1,500")
  expect(logMessages[0]).toContain("/month")
})

test("showPayment shows yearly total for single currency", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("yearly", undefined, [
    makeSub({ name: "Netflix", price: 1500, currency: "JPY" }),
  ])
  expect(logMessages).toHaveLength(1)
  expect(logMessages[0]).toContain("¥18,000")
  expect(logMessages[0]).toContain("/year")
})

test("showPayment shows per-currency totals for mixed currencies", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("monthly", undefined, [
    makeSub({ name: "Netflix", price: 1500, currency: "JPY" }),
    makeSub({ name: "GitHub", price: 10, currency: "USD" }),
  ])
  expect(logMessages).toHaveLength(2)
  const combined = logMessages.join("\n")
  expect(combined).toContain("JPY")
  expect(combined).toContain("¥1,500")
  expect(combined).toContain("USD")
  expect(combined).toContain("$10")
})

test("showPayment yearly converts all cycles correctly", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("yearly", undefined, [
    makeSub({ name: "Monthly", price: 1000, currency: "JPY", cycle: "monthly" }),
    makeSub({ name: "Yearly", price: 12000, currency: "JPY", cycle: "yearly" }),
  ])
  expect(logMessages).toHaveLength(1)
  // monthly 1000 => yearly 12000, yearly 12000 => yearly 12000 => total 24000
  expect(logMessages[0]).toContain("¥24,000")
})

test("showPayment weekly converts correctly", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("weekly", undefined, [
    makeSub({ name: "WeeklySub", price: 100, currency: "USD", cycle: "weekly" }),
  ])
  expect(logMessages[0]).toContain("$100")
  expect(logMessages[0]).toContain("/week")
})

test("showPayment with --currency converts all to target currency", async () => {
  const { showPayment } = await import("../payment.ts")
  await showPayment("monthly", "JPY", [
    makeSub({ name: "Local", price: 1000, currency: "JPY" }),
    makeSub({ name: "Foreign", price: 10, currency: "USD" }),
  ])
  // JPY 1000 stays 1000, USD 10 * 160 = 1600 => total 2600
  expect(logMessages).toHaveLength(1)
  expect(logMessages[0]).toContain("¥2,600")
})

test("showPayment --currency falls back when fetch fails", async () => {
  globalThis.fetch = async () => {
    throw new Error("Network error")
  }

  const { showPayment } = await import("../payment.ts")
  await showPayment("monthly", "JPY", [
    makeSub({ name: "JP", price: 1000, currency: "JPY" }),
    makeSub({ name: "US", price: 10, currency: "USD" }),
  ])

  // Should log fail message
  expect(failMessages.length).toBeGreaterThan(0)
  expect(failMessages[0]).toContain("Failed to fetch exchange rates")

  // Should fall back to per-currency display
  const combined = logMessages.join("\n")
  expect(combined).toContain("JPY")
  expect(combined).toContain("¥1,000")
  expect(combined).toContain("USD")
  expect(combined).toContain("$10")
})

// ── exportJson tests ──────────────────────────────────────

test("exportJson returns empty array for no subscriptions", async () => {
  const { exportJson } = await import("../export.ts")
  const json = exportJson([])
  expect(json).toBe("[]\n")
})

test("exportJson produces valid JSON for single subscription", async () => {
  const { exportJson } = await import("../export.ts")
  const json = exportJson([makeSub({ name: "Netflix", price: 1500 })])
  const parsed = JSON.parse(json)
  expect(parsed).toHaveLength(1)
  expect(parsed[0].name).toBe("Netflix")
  expect(parsed[0].price).toBe(1500)
})

test("exportJson includes tags array", async () => {
  const { exportJson } = await import("../export.ts")
  const json = exportJson([makeSub({ name: "Netflix", tags: ["video", "entertainment"] })])
  const parsed = JSON.parse(json)
  expect(parsed[0].tags).toEqual(["video", "entertainment"])
})

test("exportJson handles multiple subscriptions", async () => {
  const { exportJson } = await import("../export.ts")
  const json = exportJson([
    makeSub({ id: 1, name: "A", price: 10, currency: "USD", tags: [] }),
    makeSub({ id: 2, name: "B", price: 20, currency: "JPY", tags: ["x"] }),
  ])
  const parsed = JSON.parse(json)
  expect(parsed).toHaveLength(2)
  expect(parsed[0].name).toBe("A")
  expect(parsed[1].name).toBe("B")
})

// ── calcSummary tests ─────────────────────────────────────

test("calcSummary returns zero values for empty list", async () => {
  const { calcSummary } = await import("../payment.ts")
  const result = calcSummary([])
  expect(result.totalCount).toBe(0)
  expect(result.monthlyByCurrency).toEqual({})
  expect(result.monthlyByTag).toEqual({})
  expect(result.mostExpensive).toBeUndefined()
})

test("calcSummary totals by currency", async () => {
  const { calcSummary } = await import("../payment.ts")
  const result = calcSummary([
    makeSub({ name: "A", price: 1000, currency: "JPY" }),
    makeSub({ name: "B", price: 2000, currency: "JPY" }),
    makeSub({ name: "C", price: 10, currency: "USD" }),
  ])
  expect(result.totalCount).toBe(3)
  expect(result.monthlyByCurrency).toEqual({
    JPY: 3000,
    USD: 10,
  })
})

test("calcSummary converts cycles to monthly", async () => {
  const { calcSummary } = await import("../payment.ts")
  const result = calcSummary([
    makeSub({ name: "A", price: 12000, currency: "JPY", cycle: "yearly" }),
  ])
  // yearly 12000 => monthly 1000
  expect(result.monthlyByCurrency).toEqual({ JPY: 1000 })
})

test("calcSummary totals by tag", async () => {
  const { calcSummary } = await import("../payment.ts")
  const result = calcSummary([
    makeSub({ name: "A", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] }),
    makeSub({ name: "B", price: 500, currency: "JPY", cycle: "monthly", tags: ["video"] }),
    makeSub({ name: "C", price: 10, currency: "USD", cycle: "monthly", tags: ["storage"] }),
  ])
  expect(result.monthlyByTag.video).toEqual({ count: 2, monthly: { JPY: 2000 } })
  expect(result.monthlyByTag.storage).toEqual({ count: 1, monthly: { USD: 10 } })
})

test("calcSummary identifies most expensive subscription", async () => {
  const { calcSummary } = await import("../payment.ts")
  const result = calcSummary([
    makeSub({ name: "A", price: 500, currency: "JPY" }),
    makeSub({ name: "B", price: 3000, currency: "JPY" }),
    makeSub({ name: "C", price: 1000, currency: "JPY" }),
  ])
  expect(result.mostExpensive?.name).toBe("B")
  expect(result.mostExpensive?.price).toBe(3000)
})

// ── showSummary tests ─────────────────────────────────────

test("showSummary shows info when no subscriptions", async () => {
  const { showSummary } = await import("../payment.ts")
  showSummary([])
  expect(infoMessages).toContain("No subscriptions found")
})

test("showSummary displays count and most expensive", async () => {
  const { showSummary } = await import("../payment.ts")
  showSummary([
    makeSub({ name: "Premium", price: 3000, currency: "JPY", cycle: "monthly" }),
    makeSub({ name: "Basic", price: 500, currency: "JPY", cycle: "monthly" }),
  ])
  const combined = logMessages.join("\n")
  expect(combined).toContain("Total subscriptions:  2")
  expect(combined).toContain("Most expensive:")
  expect(combined).toContain("Premium")
  expect(combined).toContain("¥3,000/monthly")
  expect(combined).toContain("Monthly by currency:")
  expect(combined).toContain("JPY    ¥3,500")
})

test("showSummary displays breakdown by tag", async () => {
  const { showSummary } = await import("../payment.ts")
  showSummary([
    makeSub({ name: "A", price: 1500, currency: "JPY", cycle: "monthly", tags: ["video"] }),
    makeSub({ name: "B", price: 1000, currency: "JPY", cycle: "monthly", tags: ["video"] }),
    makeSub({ name: "C", price: 500, currency: "JPY", cycle: "monthly", tags: ["audio"] }),
  ])
  const combined = logMessages.join("\n")
  // Monthly by tag: video [highest monthly first]
  expect(combined).toContain("video")
  expect(combined).toContain("audio")
  expect(combined).toContain("2 subs")
  expect(combined).toContain("1 sub")
})

test("showSummary does not show tag section when no tags exist", async () => {
  const { showSummary } = await import("../payment.ts")
  showSummary([
    makeSub({ name: "Alone", price: 1000, currency: "JPY", cycle: "monthly", tags: [] }),
  ])
  const combined = logMessages.join("\n")
  expect(combined).toContain("Total subscriptions:  1")
  expect(combined).not.toContain("Monthly by tag:")
})

// ── showPayment with --api ────────────────────────────────

describe("showPayment with --api", () => {
  let testDb: Database

  beforeAll(async () => {
    const SQL = await initSqlJs()
    testDb = new SQL.Database()
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
    const db = await import("../db.ts")
    db.__setDb(testDb)
  })

  afterAll(() => {
    testDb?.close()
  })

  beforeEach(() => {
    testDb!.run("DELETE FROM llm_usage")
  })

  test("shows API usage note when no data", async () => {
    const { showPayment } = await import("../payment.ts")
    // Pass one subscription so we get past the empty-list check
    await showPayment("monthly", undefined, [makeSub({ name: "Sub", price: 1000, currency: "JPY" })], true)
    expect(infoMessages.some((m) => m.toLowerCase().includes("no api usage"))).toBe(true)
  })

  test("shows API usage in USD without --currency", async () => {
    const db = await import("../db.ts")
    db.addLlmUsage({
      provider: "openai",
      model: "gpt-4o",
      input_tokens: 1000,
      output_tokens: 500,
      cost: 50, // 50 cents = $0.50
      date: new Date().toISOString().split("T")[0],
      description: null,
    })

    const { showPayment } = await import("../payment.ts")
    await showPayment("monthly", undefined, [makeSub({ name: "Sub", price: 1000, currency: "JPY" })], true)
    const combined = logMessages.join("\n")
    expect(combined).toContain("API usage:")
    expect(combined).toContain("$0.50")
    expect(combined).toContain("openai")
  })

  test("shows API usage in target currency with --currency", async () => {
    const db = await import("../db.ts")
    db.addLlmUsage({
      provider: "anthropic",
      model: "claude-3",
      input_tokens: 2000,
      output_tokens: 1000,
      cost: 100, // 100 cents = $1.00
      date: new Date().toISOString().split("T")[0],
      description: null,
    })

    const { showPayment } = await import("../payment.ts")
    await showPayment("monthly", "JPY", [makeSub({ name: "Sub", price: 1000, currency: "JPY" })], true)
    const combined = logMessages.join("\n")
    // --currency path shows "+ API ¥..." inline instead of separate "API usage:" line
    // API cost is stored in cents: 100 cents = $1.00 → ¥160 at rate 160 JPY/USD
    expect(combined).toContain("+ API")
    expect(combined).toContain("¥160")
  })
})
