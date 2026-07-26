/**
 * Shared table rendering constants for cli-table3.
 * Extracted to avoid duplication across display, trial, forecast, compare, etc.
 */

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

export const TABLE_STYLE = {
  border: ["\x1b[90m", "\x1b[0m"],
  head: ["\x1b[1m\x1b[38;5;75m", "\x1b[0m"],
  "padding-left": 1,
  "padding-right": 1,
  compact: false,
} satisfies Record<string, unknown>
