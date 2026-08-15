import { describe, test, expect, afterEach } from "vitest"
import { clearScanners, registerScanner, runAllScanners, getRegisteredScanners } from "../scanner.ts"
import type { Scanner } from "../scanner-types.ts"

afterEach(() => {
  clearScanners()
})

describe("built-in scanners", () => {
  test("createOpenCodeScanner is a Scanner object", async () => {
    const mod = await import("../opencode-scanner.ts")
    const scanner: Scanner = mod.createOpenCodeScanner
    expect(scanner.name).toBe("opencode")

    const result = scanner.scan()
    expect(result.source).toBe("opencode")
    expect(Array.isArray(result.entries)).toBe(true)
    for (const entry of result.entries) {
      expect(entry).toHaveProperty("provider")
      expect(typeof entry.input_tokens).toBe("number")
      expect(typeof entry.cost).toBe("number")
    }
  })

  test("createClaudeScanner is a Scanner object", async () => {
    const mod = await import("../claude-scanner.ts")
    const scanner: Scanner = mod.createClaudeScanner
    expect(scanner.name).toBe("claude")

    const result = scanner.scan()
    expect(result.source).toBe("claude")
    expect(Array.isArray(result.entries)).toBe(true)
    for (const entry of result.entries) {
      expect(entry).toHaveProperty("provider")
      expect(typeof entry.cost).toBe("number")
    }
  })
})

describe("scanner registration and execution", () => {
  test("custom scanner can be registered and executed", () => {
    const custom: Scanner = {
      name: "custom-test",
      scan: () => ({
        source: "custom-test",
        entries: [
          {
            provider: "test",
            model: "test-model",
            input_tokens: 100,
            output_tokens: 50,
            cost: 0.05,
            date: "2026-06-01",
            description: "test entry",
            generation_id: "custom-1",
          },
        ],
      }),
    }

    registerScanner(custom)
    const result = runAllScanners()
    const customEntries = result.entries.filter((e) => e.generation_id === "custom-1")
    expect(customEntries.length).toBe(1)
    expect(customEntries[0].provider).toBe("test")
  })

  test("scanner with no entries returns empty array", () => {
    const empty: Scanner = {
      name: "empty-scanner",
      scan: () => ({ source: "empty-scanner", entries: [] }),
    }
    registerScanner(empty)
    const result = runAllScanners()
    expect(result.source).toBe("combined")
    expect(Array.isArray(result.entries)).toBe(true)
  })

  test("duplicate scanner name is skipped", () => {
    const s1: Scanner = {
      name: "test-scanner",
      scan: () => ({ source: "test-scanner", entries: [] }),
    }
    registerScanner(s1)
    const countBefore = getRegisteredScanners().length

    const s2: Scanner = {
      name: "test-scanner",
      scan: () => ({ source: "test-scanner-dup", entries: [] }),
    }
    registerScanner(s2)
    expect(getRegisteredScanners().length).toBe(countBefore)
  })

  test("clearScanners removes all scanners", () => {
    const s: Scanner = {
      name: "temp-scanner",
      scan: () => ({ source: "temp", entries: [] }),
    }
    registerScanner(s)
    expect(getRegisteredScanners().length).toBeGreaterThan(0)

    clearScanners()
    expect(getRegisteredScanners().length).toBe(0)
  })
})
