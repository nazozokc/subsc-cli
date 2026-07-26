import { Box } from "ink"
import type { ReactNode } from "react"
import { colors, borderStyle, spacing } from "../theme.ts"

type PanelProps = {
  children: ReactNode
  /** Visual variant */
  variant?: "default" | "danger" | "accent"
  /** Fixed width (optional) */
  width?: number
  /** Extra padding */
  paddingX?: number
  paddingY?: number
  /** Fill remaining space */
  flexGrow?: boolean
  /** Minimum height */
  minHeight?: number
}

/**
 * Unified bordered panel.
 *
 * - Default: `round` + `gray`
 * - `danger`: `round` + `red`
 * - `accent`: `round` + `cyan`
 *
 * All panels use `"round"` border — never `"single"` or `"double"`.
 */
export function Panel({
  children,
  variant = "default",
  width,
  paddingX = spacing.panelPaddingX,
  paddingY = spacing.panelPaddingY,
  flexGrow = false,
  minHeight,
}: PanelProps) {
  const borderColor =
    variant === "danger"
      ? colors.borderDanger
      : variant === "accent"
        ? colors.borderFocus
        : colors.border

  return (
    <Box
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={paddingX}
      paddingY={paddingY}
      width={width}
      flexGrow={flexGrow ? 1 : 0}
      minHeight={minHeight}
      flexDirection="column"
    >
      {children}
    </Box>
  )
}
