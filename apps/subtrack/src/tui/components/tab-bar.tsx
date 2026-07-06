import { Box, Text } from "ink"
import { colors } from "../theme.ts"

type Props = {
  tabs: readonly string[]
  activeTab: string
  tabLabels: Record<string, string>
}

/**
 * Compact 1-line tab bar.
 * Active tab highlighted with bold + primary color.
 */
export function TabBar({ tabs, activeTab, tabLabels }: Props) {
  return (
    <Box flexDirection="column">
      <Box>
        {tabs.map((tab) => {
          const isActive = tab === activeTab
          const label = tabLabels[tab] ?? tab

          return (
            <Box key={tab} marginRight={1}>
              {isActive ? (
                <Text bold inverse color={colors.primary}>
                  {" "}{label}{" "}
                </Text>
              ) : (
                <Text color={colors.textDim}>
                  {" "}{label}{" "}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
