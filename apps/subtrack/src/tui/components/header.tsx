import { Box, Text } from "ink"
import Gradient from "ink-gradient"
import type { ReactNode } from "react"
import { colors } from "../theme.ts"

type HeaderProps = {
  children: ReactNode
  /** Use ink-gradient pastel style (only for list / reports) */
  gradient?: boolean
  /** Danger variant (delete screen) */
  danger?: boolean
}

/**
 * Unified screen header.
 *
 * - Default: `bold + inverse + primary color`
 * - `gradient`: pastel gradient (list / reports header)
 * - `danger`: red inverse (delete confirmation)
 */
export function Header({ children, gradient, danger }: HeaderProps) {
  const bg = danger ? colors.danger : colors.primary
  const label = typeof children === "string" ? children : undefined

  // Gradient mode
  if (gradient && label) {
    return (
      <Box marginBottom={0}>
        <Gradient name="pastel">
          <Text bold inverse>
            {" "}{label}{" "}
          </Text>
        </Gradient>
      </Box>
    )
  }

  return (
    <Box marginBottom={0}>
      <Text bold inverse color={bg}>
        {" "}{children}{" "}
      </Text>
    </Box>
  )
}
