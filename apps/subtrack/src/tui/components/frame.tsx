import { Box, Text, useWindowSize } from "ink"
import type { ReactNode } from "react"
import { colors } from "../theme.ts"

type FrameProps = {
  children: ReactNode
  /**
   * 0-indexed positions within the content area (between left and right border)
   * where vertical separators appear. Junction characters (┬/┴) are placed
   * at these positions in the top/bottom border lines.
   */
  separatorPositions: number[]
  /** Border color (default: colors.border) */
  borderColor?: string
}

/**
 * Custom frame that replaces Ink's built-in `borderStyle`.
 *
 * Renders a box-drawing frame around children with proper junction characters
 * at separator positions so internal `│` separators visually connect to the
 * top and bottom borders.
 *
 * Layout:
 * ```
 * ╭───┬──────────╮   ← top border with ┬ at each separator
 * │   │          │   ← left border + children + right border
 * ╰───┴──────────╯   ← bottom border with ┴ at each separator
 * ```
 *
 * Use instead of `<Box borderStyle="round">` when the frame contains
 * internal vertical separators between panes.
 */
export function Frame({
  children,
  separatorPositions,
  borderColor = colors.border,
}: FrameProps) {
  const { columns: termCols } = useWindowSize()

  // Content area width = total width minus left/right border characters
  const innerWidth = Math.max(0, termCols - 2)

  function buildLine(
    cornerLeft: string,
    cornerRight: string,
    junction: string,
  ): string {
    const chars = new Array<string>(innerWidth).fill("─")
    for (const pos of separatorPositions) {
      if (pos >= 0 && pos < innerWidth) {
        chars[pos] = junction
      }
    }
    return cornerLeft + chars.join("") + cornerRight
  }

  // No visible frame on ultra-narrow terminals
  if (termCols < 2) {
    return <Box flexDirection="column" flexGrow={1} minHeight={0}>{children}</Box>
  }

  const topLine = buildLine("╭", "╮", "┬")
  const bottomLine = buildLine("╰", "╯", "┴")

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {/* ── Top border ── */}
      <Box flexShrink={0}>
        <Text color={borderColor}>{topLine}</Text>
      </Box>

      {/* ── Content area ── */}
      <Box flexGrow={1} minHeight={0}>
        {/* Left border */}
        <Box flexShrink={0}>
          <Text color={borderColor}>│</Text>
        </Box>

        {/* Children (flex row, same as before) */}
        <Box flexGrow={1} minWidth={0}>
          {children}
        </Box>

        {/* Right border */}
        <Box flexShrink={0}>
          <Text color={borderColor}>│</Text>
        </Box>
      </Box>

      {/* ── Bottom border ── */}
      <Box flexShrink={0}>
        <Text color={borderColor}>{bottomLine}</Text>
      </Box>
    </Box>
  )
}
