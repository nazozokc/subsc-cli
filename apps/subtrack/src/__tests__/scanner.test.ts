import { describe, test, expect, afterEach } from "vitest"
import type { Scanner } from "../scanner-types.ts"

// Import the functions we want to test
// We import from a clean mock to avoid actually loading scanner implementations
import { registerScanner, getRegisteredScanners, runAllScanners, clearScanners } from "../scanner.ts"

describe("scanner registry", () => {
  test("getRegisteredScanners returns registered scanners", () => {
    const scanners = getRegisteredScanners()
    // By default, the built-in scanners are registered at import time
    expect(scanners.length).toBeGreaterThanOrEqual(1)
    const names = scanners.map((s) => s.name)
    expect(names).toContain("opencode")
  })

  test("duplicate registration is skipped", () => {
    const countBefore = getRegisteredScanners().length
    // Try registering a duplicate
    const dupScanner: Scanner = {
      name: "opencode",
      scan: () => ({ source: "opencode", entries: [] }),
    }
    registerScanner(dupScanner)
    expect(getRegisteredScanners().length).toBe(countBefore)
  })
})

describe("runAllScanners", () => {
  afterEach(() => {
    clearScanners()
  })

  test("returns combined entries from multiple scanners", () => {
    const result = runAllScanners()
    // Should always return a result object
    expect(result).toHaveProperty("source", "combined")
    expect(result).toHaveProperty("entries")
    expect(Array.isArray(result.entries)).toBe(true)
  })

  test("deduplicates entries by generation_id (first wins)", () => {
    const scannerA: Scanner = {
      name: "test-a",
      scan: () => ({
        source: "test-a",
        entries: [
          {
            provider: "test",
            model: "model-a",
            input_tokens: 10,
            output_tokens: 5,
            cost: 0,
            date: "2026-06-01",
            description: null,
            generation_id: "dup-1",
          },
          {
            provider: "test",
            model: "model-b",
            input_tokens: 20,
            output_tokens: 10,
            cost: 0.01,
            date: "2026-06-02",
            description: null,
            generation_id: "unique-a",
          },
        ],
      }),
    }

    const scannerB: Scanner = {
      name: "test-b",
      scan: () => ({
        source: "test-b",
        entries: [
          {
            provider: "test",
            model: "model-a",
            input_tokens: 10,
            output_tokens: 5,
            cost: 0,
            date: "2026-06-01",
            description: null,
            generation_id: "dup-1",
          },
          {
            provider: "test",
            model: "model-c",
            input_tokens: 30,
            output_tokens: 15,
            cost: 0.02,
            date: "2026-06-03",
            description: null,
            generation_id: "unique-b",
          },
        ],
      }),
    }

    registerScanner(scannerA)
    registerScanner(scannerB)

    const result = runAllScanners()

    const hasDup = result.entries.filter((e) => e.generation_id === "dup-1")
    expect(hasDup.length).toBe(1)

    const uniqueEntries = result.entries.filter(
      (e) => e.generation_id === "unique-a" || e.generation_id === "unique-b",
    )
    expect(uniqueEntries.length).toBe(2)
  })

  test("entries without generation_id are not deduplicated", () => {
    const scanner: Scanner = {
      name: "test-no-genid",
      scan: () => ({
        source: "test-no-genid",
        entries: [
          {
            provider: "test",
            model: "model-a",
            input_tokens: 10,
            output_tokens: 5,
            cost: 0,
            date: "2026-06-01",
            description: null,
            generation_id: "",
          },
          {
            provider: "test",
            model: "model-a",
            input_tokens: 10,
            output_tokens: 5,
            cost: 0,
            date: "2026-06-01",
            description: null,
            generation_id: "",
          },
        ],
      }),
    }

    registerScanner(scanner)
    const result = runAllScanners()

    const emptyGenId = result.entries.filter((e) => e.generation_id === "")
    expect(emptyGenId.length).toBeGreaterThanOrEqual(2)
  })
})

describe("date-utils", () => {
  test("dateToStartOfDayMs returns correct timestamp", async () => {
    const { dateToStartOfDayMs } = await import("../date-utils.ts")
    const ts = dateToStartOfDayMs("2026-06-01")
    expect(ts).toBe(new Date("2026-06-01T00:00:00.000Z").getTime())
  })

  test("dateToEndOfDayMs returns correct timestamp", async () => {
    const { dateToEndOfDayMs } = await import("../date-utils.ts")
    const ts = dateToEndOfDayMs("2026-06-01")
    expect(ts).toBe(new Date("2026-06-01T23:59:59.999Z").getTime())
  })

  test("currentMonthStart returns first day of current month", async () => {
    const { currentMonthStart } = await import("../date-utils.ts")
    const result = currentMonthStart()
    const now = new Date()
    expect(result).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    )
  })

  test("today returns current date", async () => {
    const { today } = await import("../date-utils.ts")
    const result = today()
    const now = new Date().toISOString().split("T")[0]
    expect(result).toBe(now)
  })

  test("isInDateRange filters correctly", async () => {
    const { isInDateRange } = await import("../date-utils.ts")
    // Timestamp for 2026-06-15T12:00:00.000Z
    const ts = new Date("2026-06-15T12:00:00.000Z").getTime()

    expect(isInDateRange(ts, "2026-06-01", "2026-06-30")).toBe(true)
    expect(isInDateRange(ts, "2026-06-01", "2026-06-10")).toBe(false)
    expect(isInDateRange(ts, "2026-06-20", "2026-06-30")).toBe(false)
    expect(isInDateRange(ts, "2026-06-01")).toBe(true) // no to
    expect(isInDateRange(ts, undefined, "2026-06-30")).toBe(true) // no from
    expect(isInDateRange(ts)).toBe(true) // no range
  })
})
