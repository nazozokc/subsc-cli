import { Box, Text } from "ink"
import { useEffect, useRef } from "react"
import { useTui } from "../context/app-context.tsx"
import { colors, borderStyle } from "../theme.ts"

const TOAST_COLORS: Record<string, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.info,
}

const TOAST_ICONS: Record<string, string> = {
  success: "✓",
  error: "✗",
  info: "i",
}

/**
 * Toast notification — positioned bottom-center (above command bar).
 * Auto-dismisses after 2 seconds.
 */
export function Toast() {
  const { state, dispatch } = useTui()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear toast on screen change (only if not on list)
  useEffect(() => {
    if (state.toast && state.screen !== "list") {
      dispatch({ type: "CLEAR_TOAST" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, dispatch])

  // Auto-dismiss after 2s
  useEffect(() => {
    if (state.toast) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        dispatch({ type: "CLEAR_TOAST" })
      }, 2000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.toast, dispatch])

  if (!state.toast) return null

  const color = TOAST_COLORS[state.toast.type] ?? colors.text
  const icon = TOAST_ICONS[state.toast.type] ?? "•"

  return (
    <Box position="absolute" bottom={1} width="100%" justifyContent="center">
      <Box
        borderStyle={borderStyle}
        borderColor={color}
        paddingX={1}
      >
        <Text color={color} bold>
          {" "}{icon} {state.toast.message}{" "}
        </Text>
      </Box>
    </Box>
  )
}
