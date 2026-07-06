import { Box, Text } from "ink"
import { useWindowSize } from "ink"
import { colors, sidebar } from "../theme.ts"

type DividerProps = {
  /** Full width override (defaults to terminal width minus sidebar) */
  width?: number
  /** Line color */
  color?: string
  /** Label in the middle (optional) */
  label?: string
}

/**
 * Horizontal divider that spans the full content width.
 *
 * Uses `─` (U+2500) — matches the horizontal line used by Ink's
 * `"round"` border style so they visually connect.
 *
 * Replaces all `"─".repeat(n)` hand-drawn separators.
 */
export function Divider({ width, color = colors.textDim, label }: DividerProps) {
  const { columns: termCols } = useWindowSize()
  const w = width ?? Math.max(10, termCols - sidebar.width - 4)

  if (label) {
    const labelStr = ` ${label} `
    const sideLen = Math.max(0, Math.floor((w - labelStr.length) / 2))
    const left = "─".repeat(sideLen)
    const right = "─".repeat(w - sideLen - labelStr.length)
    return (
      <Box minHeight={1}>
        <Text dimColor color={color}>
          {left}{labelStr}{right}
        </Text>
      </Box>
    )
  }

  return (
    <Box minHeight={1}>
      <Text dimColor color={color}>
        {"─".repeat(w)}
      </Text>
    </Box>
  )
}
