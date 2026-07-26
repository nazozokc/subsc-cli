import { Box, Text } from "ink"
import { useTui } from "../context/app-context.tsx"
import { colors } from "../theme.ts"
import type { Screen } from "../types.ts"

type Hint = {
  label: string
  color: string
  keys: string
}

const HINTS: Record<Screen, Hint[]> = {
  list: [
    { label: "Nav", color: colors.primary, keys: "j/k g/G /" },
    { label: "Action", color: colors.success, keys: "a e d Enter" },
    { label: "Data", color: colors.warning, keys: "s S v" },
    { label: "View", color: colors.info, keys: "| detail · Esc close" },
    { label: "System", color: colors.textDim, keys: "r c R ? q" },
  ],
  add: [
    { label: "Form", color: colors.success, keys: "Enter next · Esc cancel" },
  ],
  edit: [
    { label: "Form", color: colors.success, keys: "Enter next · Esc cancel" },
  ],
  delete: [
    { label: "Confirm", color: colors.danger, keys: "y delete · n cancel" },
  ],
  detail: [
    { label: "Edit", color: colors.success, keys: "e edit" },
    { label: "History", color: colors.info, keys: "h view" },
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  history: [
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  reports: [
    { label: "Tab", color: colors.primary, keys: "← → · h/l" },
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  calendar: [
    { label: "Nav", color: colors.primary, keys: "← → month" },
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  config: [
    { label: "Edit", color: colors.success, keys: "1-9 edit · Enter save" },
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  tools: [
    { label: "Tab", color: colors.primary, keys: "← → · h/l" },
    { label: "Back", color: colors.textDim, keys: "Esc back" },
  ],
  help: [
    { label: "Back", color: colors.textDim, keys: "Esc/q back" },
  ],
}

/**
 * Flat 1-row command bar (no border — lazygit-style).
 *
 * Normal mode:  contextual keybinding hints separated by │
 * Command mode: `:input▎` prompt
 */
export function CommandBar() {
  const { state } = useTui()

  if (state.mode === "COMMAND") {
    const cmdText = state.filterText || ""
    return (
      <Box width="100%" minHeight={1}>
        <Box paddingLeft={1}>
          <Text bold color={colors.warning}>
            :{cmdText}
          </Text>
          <Text bold color={colors.warning}>
            ▎
          </Text>
        </Box>
      </Box>
    )
  }

  const hints = HINTS[state.screen] ?? []

  return (
    <Box width="100%" minHeight={1}>
      <Box paddingLeft={1} gap={0}>
        {hints.map((h, i) => (
          <Box key={h.label}>
            {i > 0 && (
              <Text dimColor color={colors.textDim}>
                {"  │  "}
              </Text>
            )}
            <Text color={h.color} bold>
              {h.label}
            </Text>
            <Text dimColor>
              :{" "}{h.keys}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
