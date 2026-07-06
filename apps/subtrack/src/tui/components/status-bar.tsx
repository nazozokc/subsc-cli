import { Box, Text } from "ink"
import { useTui } from "../context/app-context.tsx"
import { colors } from "../theme.ts"
import { getActiveProfileName } from "../../profile.ts"

const SCREEN_LABEL: Record<string, string> = {
  list: "List",
  add: "Add",
  edit: "Edit",
  delete: "Del",
  detail: "Detail",
  reports: "Reports",
  calendar: "Calendar",
  config: "Config",
  tools: "Tools",
  help: "Help",
}

/**
 * Flat 1-row status bar (no border — lazygit-style).
 *
 *   left:  subtrack  ● NORMAL  │  ScreenName    filter info
 *   right: multi-select count / context
 */
export function StatusBar() {
  const { state } = useTui()
  const modeColor = state.mode === "NORMAL" ? colors.statusActive : colors.warning
  const modeLabel = state.mode === "NORMAL" ? "NORMAL" : "CMD"
  const screenLabel = SCREEN_LABEL[state.screen] ?? state.screen

  return (
    <Box width="100%" minHeight={1}>
      <Box flexGrow={1} paddingLeft={1}>
        {/* Brand */}
        <Text bold color={colors.primary}>
          subtrack
        </Text>

        {/* Mode indicator */}
        <Text color={modeColor} bold>
          {"  "}●{" "}
        </Text>
        <Text color={modeColor} bold>
          {modeLabel}
        </Text>

        {/* Separator + screen */}
        <Text dimColor color={colors.textDim}>
          {"  │  "}
        </Text>
        <Text bold>
          {screenLabel}
        </Text>

        {/* Active profile indicator */}
        {getActiveProfileName() && (
          <Text color={colors.info}>
            {"  │  "}● {getActiveProfileName()}
          </Text>
        )}

        {/* Filter indicator */}
        {state.filterText && (
          <Text color={colors.info}>
            {"  │  "}?{" "}
            {state.filterText.length > 20
              ? state.filterText.slice(0, 20) + "…"
              : state.filterText}
          </Text>
        )}
      </Box>

      {/* Right side */}
      <Box paddingRight={1}>
        {state.multiSelect.size > 0 && (
          <Text bold color={colors.warning}>
            [{state.multiSelect.size} selected]
          </Text>
        )}
      </Box>
    </Box>
  )
}
