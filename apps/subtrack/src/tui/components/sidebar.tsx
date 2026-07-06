import { Box, Text } from "ink"
import {
  SIDEBAR_ITEMS,
  SIDEBAR_WIDTH,
  type SidebarItem,
  type SidebarSection,
  type Screen,
} from "../types.ts"
import { useTui } from "../context/app-context.tsx"
import { colors } from "../theme.ts"

const SECTION_HEADS: Record<SidebarSection, string> = {
  data: "[ ] Data",
  reports: "[~] Reports",
  system: "[*] System",
}

type Row =
  | { kind: "head"; section: SidebarSection; itemIndex: -1 }
  | { kind: "item"; section: SidebarSection; item: SidebarItem; itemIndex: number }

function buildRows(): Row[] {
  const rows: Row[] = []
  let idx = 0
  for (const section of ["data", "reports", "system"] as SidebarSection[]) {
    const items = SIDEBAR_ITEMS.filter((i) => i.section === section)
    if (items.length === 0) continue
    rows.push({ kind: "head", section, itemIndex: -1 })
    for (const item of items) {
      rows.push({ kind: "item", section, item, itemIndex: idx })
      idx++
    }
  }
  return rows
}

/**
 * Sidebar — inside the outer frame (no border of its own).
 * Active/focused items use background-color highlight (not inverse).
 */
export function Sidebar() {
  const { state } = useTui()
  const isFocused = state.focus === "sidebar"
  const rows = buildRows()

  const sidebarScreen: Screen =
    state.screen === "edit" || state.screen === "delete" || state.screen === "detail"
      ? "list"
      : state.screen
  const currentIdx = SIDEBAR_ITEMS.findIndex((i) => i.screen === sidebarScreen)

  return (
    <Box
      width={SIDEBAR_WIDTH}
      flexDirection="column"
      flexShrink={0}
    >
      {rows.map((row, ri) => {
        if (row.kind === "head") {
          const isFirst = ri === 0
          return (
            <Box
              key={`head-${row.section}`}
              marginTop={isFirst ? 0 : 0}
              paddingLeft={1}
              paddingTop={isFirst ? 1 : 1}
            >
              <Text bold color={colors.textDim}>
                {"  "}{SECTION_HEADS[row.section]}
              </Text>
            </Box>
          )
        }

        const { item, itemIndex } = row
        const isCurrent = itemIndex === currentIdx
        const focusedHere = isFocused && itemIndex === state.sidebarIndex

        return (
          <Box key={item.screen} paddingLeft={1}>
            {focusedHere ? (
              <Text bold color={colors.text} backgroundColor={colors.selectedBg}>
                {" "}{item.icon} {item.label.padEnd(14)}{" "}
              </Text>
            ) : isCurrent ? (
              <Text bold color={colors.primary}>
                {" "}{item.icon} {item.label.padEnd(14)}{" "}
              </Text>
            ) : (
              <Text color={colors.text}>
                {" "}{item.icon} {item.label.padEnd(14)}{" "}
              </Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
