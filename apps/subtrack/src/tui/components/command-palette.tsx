import { Box, Text, useInput } from "ink"
import { useMemo } from "react"
import { useTui, useSetScreen, useGoBack } from "../context/app-context.tsx"
import {
  SIDEBAR_ITEMS,
  REPORT_TABS,
  REPORT_TAB_LABELS,
  TOOLS_TABS,
  TOOLS_TAB_LABELS,
} from "../types.ts"
import { colors, borderStyle } from "../theme.ts"
import { Divider } from "./divider.tsx"


type PaletteEntry = {
  id: string
  label: string
  category: string
  execute: () => void
}

export function CommandPalette() {
  const { state, dispatch } = useTui()
  const setScreen = useSetScreen()
  const goBack = useGoBack()

  const entries = useMemo<PaletteEntry[]>(() => {
    const list: PaletteEntry[] = []

    // Sidebar screens
    for (const item of SIDEBAR_ITEMS) {
      list.push({
        id: `screen:${item.screen}`,
        label: `${item.label}`,
        category: "Navigate",
        execute: () => {
          setScreen(item.screen)
        },
      })
    }

    // Reports tabs
    for (const tab of REPORT_TABS) {
      list.push({
        id: `reports:${tab}`,
        label: `Reports > ${REPORT_TAB_LABELS[tab]}`,
        category: "Navigate",
        execute: () => {
          dispatch({ type: "SET_REPORTS_TAB", tab })
          setScreen("reports")
        },
      })
    }

    // Tools tabs
    for (const tab of TOOLS_TABS) {
      list.push({
        id: `tools:${tab}`,
        label: `Tools > ${TOOLS_TAB_LABELS[tab]}`,
        category: "Navigate",
        execute: () => {
          dispatch({ type: "SET_TOOLS_TAB", tab })
          setScreen("tools")
        },
      })
    }

    // Actions
    const hasSelection = state.selectedId !== null

    list.push({
      id: "action:refresh",
      label: "Refresh Data",
      category: "Actions",
      execute: () => dispatch({ type: "INCREMENT_REFRESH_KEY" }),
    })

    if (state.screen === "list" && hasSelection) {
      list.push({
        id: "action:edit",
        label: "Edit Subscription",
        category: "Actions",
        execute: () => setScreen("edit"),
      })
      list.push({
        id: "action:delete",
        label: "Delete Subscription",
        category: "Actions",
        execute: () => setScreen("delete"),
      })
      list.push({
        id: "action:detail",
        label: "View Details",
        category: "Actions",
        execute: () => setScreen("detail"),
      })
    }

    if (state.screen === "list" && state.filterText) {
      list.push({
        id: "action:clear-filter",
        label: "Clear Filter",
        category: "Actions",
        execute: () => dispatch({ type: "SET_FILTER_TEXT", value: "" }),
      })
    }

    if (state.history.length > 0) {
      list.push({
        id: "action:back",
        label: "Go Back",
        category: "Actions",
        execute: () => goBack(),
      })
    }

    list.push({
      id: "action:quit",
      label: "Quit",
      category: "Actions",
      execute: () => process.exit(0),
    })

    // Sort
    if (state.screen === "list") {
      list.push({
        id: "action:sort",
        label: "Cycle Sort",
        category: "Actions",
        execute: () => dispatch({ type: "SET_SORT" }),
      })
    }

    // Filter
    list.push({
      id: "action:filter",
      label: "Filter Subscriptions",
      category: "Actions",
      execute: () => {
        dispatch({ type: "SET_MODE", mode: "COMMAND" })
        dispatch({ type: "SET_FILTER_TEXT", value: "/" })
      },
    })

    return list
  }, [state.selectedId, state.screen, state.history.length, state.filterText, setScreen, goBack, dispatch])

  const filtered = useMemo(() => {
    if (!state.paletteQuery.trim()) return entries
    const q = state.paletteQuery.toLowerCase()
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q),
    )
  }, [entries, state.paletteQuery])

  const clampedIndex = Math.min(state.paletteIndex, Math.max(0, filtered.length - 1))

  useInput(
    (input, key) => {
      if (key.escape) {
        dispatch({ type: "SET_PALETTE_OPEN", open: false })
        return
      }

      if (key.return) {
        if (filtered.length > 0 && filtered[clampedIndex]) {
          dispatch({ type: "SET_PALETTE_OPEN", open: false })
          filtered[clampedIndex].execute()
        }
        return
      }

      if (key.backspace) {
        dispatch({
          type: "SET_PALETTE_QUERY",
          query: state.paletteQuery.slice(0, -1),
        })
        return
      }

      if (key.upArrow || input === "k") {
        dispatch({
          type: "SET_PALETTE_INDEX",
          index: Math.max(0, clampedIndex - 1),
        })
        return
      }

      if (key.downArrow || input === "j") {
        dispatch({
          type: "SET_PALETTE_INDEX",
          index: Math.min(filtered.length - 1, clampedIndex + 1),
        })
        return
      }

      if (input.length === 1 && !key.ctrl && !key.meta) {
        dispatch({
          type: "SET_PALETTE_QUERY",
          query: state.paletteQuery + input,
        })
      }
    },
    { isActive: true },
  )

  const maxVisible = Math.min(12, Math.max(3, filtered.length))
  const scrollOffset = Math.max(
    0,
    Math.min(clampedIndex - Math.floor(maxVisible / 2), Math.max(0, filtered.length - maxVisible)),
  )
  const visibleEntries = filtered.slice(scrollOffset, scrollOffset + maxVisible)

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexDirection="column"
    >
      {/* Overlay background */}
      <Box flexGrow={1} />

      {/* Palette container */}
      <Box flexDirection="column" width="100%" alignItems="center">
        <Box
          borderStyle={borderStyle}
          borderColor={colors.primary}
          width={60}
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          {/* Input */}
          <Box>
            <Text bold color={colors.primary}>
              &gt;{" "}
            </Text>
            <Text>{state.paletteQuery || <Text color={colors.textDim}>Type to search…</Text>}</Text>
          </Box>

          <Divider width={56} />

          {/* Results */}
          {visibleEntries.length === 0 ? (
            <Box paddingY={1}>
              <Text color={colors.textDim}>No matching commands</Text>
            </Box>
          ) : (
            <Box flexDirection="column" minHeight={3}>
              {visibleEntries.map((entry, i) => {
                const globalIdx = scrollOffset + i
                const isSelected = globalIdx === clampedIndex
                return (
                  <Box key={entry.id}>
                    <Box width={2}>
                      {isSelected ? (
                        <Text color={colors.primary}>▸</Text>
                      ) : (
                        <Text> </Text>
                      )}
                    </Box>
                    <Box width={56}>
                      {isSelected ? (
                        <Text bold backgroundColor={colors.selectedBg} color={colors.selectedFg} wrap="truncate-end">
                          {" "}{entry.label.padEnd(40)}{" "}
                          <Text color={colors.textDim}>{entry.category}</Text>{" "}
                        </Text>
                      ) : (
                        <Text wrap="truncate-end">
                          {" "}{entry.label.padEnd(40)}{" "}
                          <Text color={colors.textDim}>{entry.category}</Text>{" "}
                        </Text>
                      )}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}

          <Divider width={56} />

          {/* Footer */}
          <Box>
            <Text color={colors.textDim}>
              {filtered.length > 0
                ? `${clampedIndex + 1} / ${filtered.length}`
                : ""}{" "}
            </Text>
            <Text color={colors.textDim}>
              ↑↓ navigate · Enter select · Esc close
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Spacer below */}
      <Box flexGrow={1} />
    </Box>
  )
}
