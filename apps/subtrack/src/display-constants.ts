/**
 * Shared table rendering constants for cli-table3.
 * Extracted to avoid duplication across display, trial, forecast, compare, etc.
 * Colors are theme-driven: resolved from config with preset fallbacks.
 */

import type { Status } from "./types.ts"
import { loadConfig } from "./config.ts"
import type { ColorName } from "./color.ts"
import { isColorName, fgCode, bgCode } from "./color.ts"

export type { ColorName } from "./color.ts"
export { isColorName, fgCode, bgCode } from "./color.ts"

export const TABLE_CHARS = {
  top: "─",
  "top-mid": "┬",
  "top-left": "┌",
  "top-right": "┐",
  bottom: "─",
  "bottom-mid": "┴",
  "bottom-left": "└",
  "bottom-right": "┘",
  left: "│",
  "left-mid": "├",
  mid: "─",
  "mid-mid": "┼",
  right: "│",
  "right-mid": "┤",
  middle: "│",
} as const

/** Resolved display theme (all colors resolved, ready to emit). */
export type ResolvedTheme = {
  border: ColorName | null
  header: ColorName | null
  zebra: ColorName | null
  accent: ColorName | null
  statusActive: ColorName | null
  statusPaused: ColorName | null
  statusCancelled: ColorName | null
  statusArchived: ColorName | null
}

const PRESET_THEMES: Record<string, ResolvedTheme> = {
  default: {
    border: "gray",
    header: "brightBlue",
    zebra: "gray",
    accent: "cyan",
    statusActive: "green",
    statusPaused: "yellow",
    statusCancelled: "red",
    statusArchived: "gray",
  },
  light: {
    border: "gray",
    header: "blue",
    zebra: "brightWhite",
    accent: "blue",
    statusActive: "green",
    statusPaused: "yellow",
    statusCancelled: "red",
    statusArchived: "gray",
  },
  "high-contrast": {
    border: "white",
    header: "white",
    zebra: null,
    accent: "white",
    statusActive: "green",
    statusPaused: "yellow",
    statusCancelled: "red",
    statusArchived: "white",
  },
  none: {
    border: null,
    header: null,
    zebra: null,
    accent: null,
    statusActive: null,
    statusPaused: null,
    statusCancelled: null,
    statusArchived: null,
  },
}

/**
 * Resolve the display theme from config.
 * Priority: individual color keys > preset (`theme`) > default preset.
 * `tableZebra: "off"` disables zebra striping entirely.
 */
export function getDisplayTheme(): ResolvedTheme {
  const config = loadConfig()
  const preset = PRESET_THEMES[config.theme] ?? PRESET_THEMES.default
  return {
    border: config.tableBorderColor && isColorName(config.tableBorderColor)
      ? config.tableBorderColor
      : preset.border,
    header: config.tableHeaderColor && isColorName(config.tableHeaderColor)
      ? config.tableHeaderColor
      : preset.header,
    zebra: config.tableZebra === "off"
      ? null
      : config.tableZebraColor && isColorName(config.tableZebraColor)
        ? config.tableZebraColor
        : preset.zebra,
    accent: config.accentColor && isColorName(config.accentColor)
      ? config.accentColor
      : preset.accent,
    statusActive: preset.statusActive,
    statusPaused: preset.statusPaused,
    statusCancelled: preset.statusCancelled,
    statusArchived: preset.statusArchived,
  }
}

/** True when the resolved theme emits no colors at all. */
export function isPlainTheme(): boolean {
  const t = getDisplayTheme()
  return !t.border && !t.header && !t.zebra && !t.accent
}

/** cli-table3 style object for the resolved theme. */
export function getTableStyle(): Record<string, unknown> {
  const t = getDisplayTheme()
  return {
    border: t.border ? [fgCode(t.border), "\x1b[0m"] : ["", ""],
    head: t.header ? [`\x1b[1m${fgCode(t.header)}`, "\x1b[0m"] : ["", ""],
    "padding-left": 1,
    "padding-right": 1,
    compact: false,
  }
}

/**
 * Wrap table cells with the zebra background for striping.
 * Apply to every even-indexed row (i % 2 === 0).
 * Returns cells unchanged when zebra is disabled by the theme.
 */
export function zebraRow(cells: string[]): string[] {
  const zebra = getDisplayTheme().zebra
  if (!zebra) return cells
  return cells.map((cell) => `${bgCode(zebra)}${cell}\x1b[0m`)
}

/**
 * Colorize a subscription status consistently across all views.
 * Canonical definition — do not redefine per module.
 */
export function statusColor(status: Status): string {
  const t = getDisplayTheme()
  const name = status === "active" ? t.statusActive
    : status === "paused" ? t.statusPaused
    : status === "cancelled" ? t.statusCancelled
    : status === "archived" ? t.statusArchived
    : null
  if (!name) return status
  return `${fgCode(name)}${status}\x1b[0m`
}

/**
 * Section heading used to separate report sections.
 * e.g. `── Database Statistics ──`
 */
export function sectionTitle(text: string): string {
  const t = getDisplayTheme()
  if (!t.accent) return `── ${text} ──`
  return `\x1b[1m${fgCode(t.accent)}── ${text} ──\x1b[0m`
}

/**
 * Horizontal divider line with a consistent width.
 * Dimmed, except in plain (none) themes where it stays uncolored.
 */
export function divider(length = 40): string {
  if (isPlainTheme()) return "─".repeat(length)
  return `\x1b[2m${"─".repeat(length)}\x1b[0m`
}

export type ColumnConfig = {
  headers: readonly string[]
  minWidths: readonly number[]
  maxWidths: readonly number[]
  /** Minimum available width (default 40) */
  minAvail?: number
}

/** Border + left/right padding overhead of a cli-table3 table. */
export const BORDER_AND_PADDING = 16

/**
 * Calculate column widths that fit the terminal width.
 * Allocates available width proportionally to content weight, clamped to
 * min/max widths per column, then adjusts to exactly fit.
 */
export function calcColumnWidths(rows: string[][], config: ColumnConfig): number[] {
  const termWidth = process.stdout.columns ?? 80
  const avail = Math.max(
    config.minAvail ?? loadConfig().tableMinWidth ?? 40,
    termWidth - BORDER_AND_PADDING,
  )

  const weights = config.headers.map((hdr, i) => {
    let max = hdr.length
    for (const row of rows) {
      const len = row[i].length
      if (len > max) max = len
    }
    return Math.min(max, config.maxWidths[i])
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map((w, i) =>
    Math.max(
      config.minWidths[i],
      Math.min(config.maxWidths[i], Math.round((avail * w) / totalWeight)),
    ),
  )

  // Adjust to exactly fit avail
  let sum = widths.reduce((a, b) => a + b, 0)
  let diff = sum - avail
  let iterations = 0

  while (diff > 0 && iterations < 100) {
    let idx = -1
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] > config.minWidths[i] && (idx === -1 || widths[i] > widths[idx]))
        idx = i
    }
    if (idx === -1) break
    widths[idx]--
    diff--
    iterations++
  }

  iterations = 0
  while (diff < 0 && iterations < 100) {
    let idx = -1
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] < config.maxWidths[i] && (idx === -1 || weights[i] > weights[idx]))
        idx = i
    }
    if (idx === -1) break
    widths[idx]++
    diff++
    iterations++
  }

  return widths
}