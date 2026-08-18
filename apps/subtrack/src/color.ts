/**
 * Named ANSI color system for display theming.
 * Shared by display-constants (theme resolution) and config (validation).
 */

/** Named ANSI colors configurable by the user. */
export type ColorName =
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white"
  | "gray" | "brightRed" | "brightGreen" | "brightYellow" | "brightBlue"
  | "brightMagenta" | "brightCyan" | "brightWhite"

const FG_CODES: Record<ColorName, number> = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  gray: 90, brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94,
  brightMagenta: 95, brightCyan: 96, brightWhite: 97,
}

const BG_CODES: Record<ColorName, number> = Object.fromEntries(
  Object.entries(FG_CODES).map(([name, code]) => [name, code + 10]),
) as Record<ColorName, number>

export function isColorName(value: string): value is ColorName {
  return value in FG_CODES
}

/** Foreground ANSI prefix for a color name, or "" when null. */
export function fgCode(name: ColorName | null): string {
  return name ? `\x1b[${FG_CODES[name]}m` : ""
}

/** Background ANSI prefix for a color name, or "" when null. */
export function bgCode(name: ColorName | null): string {
  return name ? `\x1b[${BG_CODES[name]}m` : ""
}