import { test, expect, describe, beforeEach, afterEach } from "vitest"
import { unlinkSync } from "node:fs"
import {
  statusColor,
  sectionTitle,
  divider,
  zebraRow,
  calcColumnWidths,
  getDisplayTheme,
  isPlainTheme,
  getTableStyle,
} from "../display-constants.ts"
import { loadConfig, saveConfig, resetConfig, getConfigPath } from "../config.ts"

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

beforeEach(() => {
  resetConfig()
  try { unlinkSync(getConfigPath()) } catch { /* no config yet */ }
})

afterEach(() => {
  resetConfig()
  try { unlinkSync(getConfigPath()) } catch { /* no config yet */ }
})

describe("statusColor", () => {
  test("colors active green", () => {
    expect(stripAnsi(statusColor("active"))).toBe("active")
    expect(statusColor("active")).toContain("\x1b[32m")
  })

  test("colors paused yellow", () => {
    expect(statusColor("paused")).toContain("\x1b[33m")
  })

  test("colors cancelled red", () => {
    expect(statusColor("cancelled")).toContain("\x1b[31m")
  })

  test("colors archived gray", () => {
    expect(statusColor("archived")).toContain("\x1b[90m")
  })
})

describe("sectionTitle", () => {
  test("wraps text in bold cyan ── markers", () => {
    const t = sectionTitle("Database Statistics")
    expect(stripAnsi(t)).toBe("── Database Statistics ──")
    expect(t).toContain("\x1b[1m") // bold
    expect(t).toContain("\x1b[36m") // cyan
  })
})

describe("divider", () => {
  test("renders a dim line with the given length", () => {
    const d = divider(20)
    expect(stripAnsi(d)).toBe("─".repeat(20))
    expect(d).toContain("\x1b[2m") // dim
  })

  test("defaults to 40 chars", () => {
    expect(stripAnsi(divider())).toBe("─".repeat(40))
  })
})

describe("zebraRow", () => {
  test("wraps every cell with the zebra background", () => {
    const cells = ["a", "b"]
    const out = zebraRow(cells)
    expect(out).toEqual([
      "\x1b[100ma\x1b[0m",
      "\x1b[100mb\x1b[0m",
    ])
  })
})

describe("calcColumnWidths", () => {
  const config = {
    headers: ["name", "status", "cycle", "tags", "price"] as const,
    minWidths: [10, 8, 6, 8, 8] as const,
    maxWidths: [40, 12, 20, 60, 20] as const,
  }

  test("respects min and max widths", () => {
    const widths = calcColumnWidths(
      [["a", "active", "monthly", "-", "$10.00"]],
      config,
    )
    expect(widths.length).toBe(5)
    expect(widths[0]).toBeGreaterThanOrEqual(10)
    expect(widths[0]).toBeLessThanOrEqual(40)
  })

  test("allocates more width to longer content", () => {
    const rows = [
      ["a very long subscription name here", "active", "monthly", "-", "$10.00"],
      ["x", "paused", "yearly", "tag1, tag2, tag3", "$999.99"],
    ]
    const widths = calcColumnWidths(rows, config)
    // name column gets more room than the tiny status column
    expect(widths[0]).toBeGreaterThan(widths[1])
  })

  test("sum of widths stays within the terminal width", () => {
    const rows = [
      ["name", "active", "monthly", "-", "$10.00"],
      ["another subscription", "paused", "yearly", "a, b, c", "$99.00"],
    ]
    const widths = calcColumnWidths(rows, config)
    const sum = widths.reduce((a, b) => a + b, 0)
    const termWidth = process.stdout.columns ?? 80
    expect(sum).toBeLessThanOrEqual(termWidth)
  })

  test("honors tableMinWidth from config", () => {
    saveConfig({ ...loadConfig(), tableMinWidth: 100 })
    const widths = calcColumnWidths(
      [["a", "active", "monthly", "-", "$10.00"]],
      config,
    )
    expect(widths.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(80)
    resetConfig()
  })
})

describe("getDisplayTheme", () => {
  test("uses default preset when no config", () => {
    const t = getDisplayTheme()
    expect(t.border).toBe("gray")
    expect(t.header).toBe("brightBlue")
    expect(t.zebra).toBe("gray")
    expect(t.accent).toBe("cyan")
    expect(t.statusActive).toBe("green")
    expect(t.statusArchived).toBe("gray")
    expect(isPlainTheme()).toBe(false)
  })

  test("none theme resolves to plain output", () => {
    saveConfig({ ...loadConfig(), theme: "none" })
    const t = getDisplayTheme()
    expect(t.border).toBeNull()
    expect(t.header).toBeNull()
    expect(t.zebra).toBeNull()
    expect(t.accent).toBeNull()
    expect(t.statusActive).toBeNull()
    expect(isPlainTheme()).toBe(true)
    // Emitted helpers are uncolored
    expect(zebraRow(["a"])).toEqual(["a"])
    expect(sectionTitle("X")).not.toContain("\x1b[")
    expect(statusColor("active")).toBe("active")
    resetConfig()
  })

  test("individual keys override the preset", () => {
    saveConfig({
      ...loadConfig(),
      theme: "light",
      tableBorderColor: "brightMagenta",
      accentColor: "yellow",
    })
    const t = getDisplayTheme()
    expect(t.border).toBe("brightMagenta")
    expect(t.header).toBe("blue") // from light preset
    expect(t.accent).toBe("yellow")
    resetConfig()
  })

  test("tableZebra off disables striping", () => {
    saveConfig({ ...loadConfig(), tableZebra: "off" })
    expect(getDisplayTheme().zebra).toBeNull()
    expect(zebraRow(["a"])).toEqual(["a"])
    resetConfig()
  })

  test("invalid color names fall back to the preset", () => {
    saveConfig({ ...loadConfig(), tableBorderColor: "notacolor" })
    expect(getDisplayTheme().border).toBe("gray")
    resetConfig()
  })

  test("unknown theme falls back to default preset", () => {
    saveConfig({ ...loadConfig(), theme: "vaporwave" })
    expect(getDisplayTheme().header).toBe("brightBlue")
    resetConfig()
  })
})

describe("getTableStyle", () => {
  test("emits border and head colors for the default theme", () => {
    const style = getTableStyle()
    expect(style.border).toEqual(["\x1b[90m", "\x1b[0m"])
    expect(style.head).toEqual(["\x1b[1m\x1b[94m", "\x1b[0m"])
  })

  test("emits empty codes for the none theme", () => {
    saveConfig({ ...loadConfig(), theme: "none" })
    const style = getTableStyle()
    expect(style.border).toEqual(["", ""])
    expect(style.head).toEqual(["", ""])
    resetConfig()
  })
})
