import { Box, Text } from "ink"
import { colors } from "../theme.ts"
import { Header } from "../components/header.tsx"
import { SIDEBAR_ITEMS } from "../types.ts"

export function HelpScreen() {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header>Help & Keybindings</Header>

      <Box flexDirection="column" flexGrow={1}>
        {/* 2-column layout for keybinding sections */}
        <Box flexGrow={1} flexDirection="row" gap={2}>
          {/* Left column */}
          <Box flexDirection="column" flexGrow={1}>
            <Box marginTop={1} flexDirection="column">
              <Text bold underline color={colors.primary}>Global Navigation</Text>
              <Kbd keys="j/k" desc="Move selection in list/sidebar" />
              <Kbd keys="h/l" desc="Focus: sidebar / content" />
              <Kbd keys="Tab" desc="Toggle focus" />
              <Kbd keys="Enter" desc="Select sidebar item" />
              <Kbd keys="Esc" desc="Go back to previous screen" />
              <Kbd keys="q" desc="Quit (on list) or go back" />
              <Kbd keys="?" desc="This help screen" />
              <Kbd keys=":command" desc="Execute command (:q, :help, /filter)" />
              <Kbd keys="Ctrl+P" desc="Command palette" />
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text bold underline color={colors.success}>List Screen</Text>
              <Kbd keys="a" desc="Add new subscription" />
              <Kbd keys="e" desc="Edit selected subscription" />
              <Kbd keys="d" desc="Delete selected subscription" />
              <Kbd keys="Enter / |" desc="Toggle detail preview pane" />
              <Kbd keys="/" desc="Filter subscriptions" />
              <Kbd keys="v" desc="Toggle multi-select" />
              <Kbd keys="r" desc="Open Reports" />
              <Kbd keys="c" desc="Open Config" />
              <Kbd keys="g/G" desc="Go to top/bottom" />
              <Kbd keys="s" desc="Cycle sort" />
              <Kbd keys="Ctrl+d/u" desc="Page down/up" />
              <Kbd keys="S" desc="Toggle status" />
              <Kbd keys="R" desc="Refresh data" />
            </Box>
          </Box>

          {/* Right column */}
          <Box flexDirection="column" flexGrow={1}>
            <Box marginTop={1} flexDirection="column">
              <Text bold underline color={colors.warning}>Available Screens</Text>
              {SIDEBAR_ITEMS.map((item) => (
                <Box key={item.screen}>
                  <Box width={4}>
                    <Text color={colors.textDim}>{item.icon}</Text>
                  </Box>
                  <Box width={18}>
                    <Text bold wrap="truncate-end">
                      {item.label}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text bold underline color={colors.primary}>3-Pane Mode</Text>
              <Kbd keys="|" desc="Toggle detail preview pane" />
              <Kbd keys="+ / -" desc="Adjust split ratio" />
              <Kbd keys="Enter" desc="Open full detail" />
              <Kbd keys="Esc" desc="Close detail pane" />
            </Box>
          </Box>
        </Box>
      </Box>

      <Box>
        <Text color={colors.textDim}>Press Esc or q to go back</Text>
      </Box>
    </Box>
  )
}

function Kbd({ keys, desc }: { keys: string; desc: string }) {
  return (
    <Box>
      <Box width={18}>
        <Text bold color={colors.primary}>{keys}</Text>
      </Box>
      <Text color={colors.text}>{desc}</Text>
    </Box>
  )
}
