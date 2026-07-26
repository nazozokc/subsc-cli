import { useInput, useApp } from "ink"
import { useTui } from "./context/app-context.tsx"
import { executeCommand } from "./commands.ts"
import { SIDEBAR_ITEMS } from "./types.ts"

export function KeyboardHandler() {
  const { state, dispatch } = useTui()
  const { exit } = useApp()

  useInput(
    (input: string, key) => {
      // ── COMMAND mode ──
      if (state.mode === "COMMAND") {
        if (key.escape) {
          dispatch({
            type: "SET_FILTER_TEXT",
            value: state.filterText.startsWith("/") ? "" : state.filterText,
          })
          dispatch({ type: "SET_MODE", mode: "NORMAL" })
          return
        }
        if (key.return) {
          executeCommand(state.filterText, state, dispatch, exit)
          return
        }
        if (key.backspace) {
          dispatch({
            type: "SET_FILTER_TEXT",
            value: state.filterText.slice(0, -1),
          })
          return
        }
        if (input.length === 1) {
          dispatch({
            type: "SET_FILTER_TEXT",
            value: state.filterText + input,
          })
        }
        return
      }

      // ── NORMAL mode ──

      // Ctrl+P — command palette
      if (key.ctrl && input === "p") {
        dispatch({ type: "SET_PALETTE_OPEN", open: true })
        return
      }

      // : — enter command mode
      if (input === ":") {
        dispatch({ type: "SET_MODE", mode: "COMMAND" })
        dispatch({ type: "SET_FILTER_TEXT", value: "" })
        return
      }

      // q — quit on list, go back on other screens
      if (input === "q") {
        if (state.screen === "list") {
          exit()
          return
        }
        if (state.history.length > 0) {
          dispatch({ type: "GO_BACK" })
          return
        }
        exit()
        return
      }

      // Esc — go back
      if (key.escape) {
        if (state.focus === "sidebar") {
          dispatch({ type: "SET_FOCUS", focus: "content" })
        } else if (state.history.length > 0) {
          dispatch({ type: "GO_BACK" })
        } else if (state.screen !== "list") {
          dispatch({ type: "SET_SCREEN", screen: "list" })
          dispatch({ type: "SET_LIST_INDEX", index: 0 })
        }
        return
      }

      // Tab — toggle focus
      if (key.tab) {
        dispatch({ type: "TOGGLE_FOCUS" })
        return
      }

      // Ctrl+l — clear filter (vim-like)
      if (key.ctrl && input === "l") {
        if (state.filterText) {
          dispatch({ type: "SET_FILTER_TEXT", value: "" })
        }
        return
      }

      // Sidebar navigation
      if (key.upArrow || input === "k") {
        if (state.focus === "sidebar") {
          dispatch({ type: "SET_SIDEBAR_INDEX", index: Math.max(0, state.sidebarIndex - 1) })
          return
        }
      }
      if (key.downArrow || input === "j") {
        if (state.focus === "sidebar") {
          dispatch({
            type: "SET_SIDEBAR_INDEX",
            index: Math.min(SIDEBAR_ITEMS.length - 1, state.sidebarIndex + 1),
          })
          return
        }
      }

      // 1-6 — sidebar shortcuts (not on config, which uses numbers for editing)
      if (/^[1-6]$/.test(input) && state.screen !== "config") {
        const idx = Number(input) - 1
        const item = SIDEBAR_ITEMS[idx]
        if (item) {
          dispatch({ type: "SET_SCREEN", screen: item.screen })
          dispatch({ type: "SET_LIST_INDEX", index: 0 })
        }
        return
      }

      // + / - — adjust split ratio (3-pane mode)
      if (input === "=" || input === "+") {
        dispatch({ type: "SET_SPLIT_RATIO_STEP", delta: 0.05 })
        return
      }
      if (input === "-") {
        dispatch({ type: "SET_SPLIT_RATIO_STEP", delta: -0.05 })
        return
      }

      // ? — help screen (global, any screen)
      if (input === "?") {
        dispatch({ type: "SET_SCREEN", screen: "help" })
        return
      }

      // h/l — focus navigation (not on tabbed screens)
      if (input === "h" && state.screen !== "reports" && state.screen !== "tools") {
        dispatch({ type: "SET_FOCUS", focus: "sidebar" })
        return
      }
      if (input === "l" && state.screen !== "reports" && state.screen !== "tools") {
        dispatch({ type: "SET_FOCUS", focus: "content" })
        return
      }

      // Enter — select sidebar item
      if (key.return && state.focus === "sidebar") {
        const item = SIDEBAR_ITEMS[state.sidebarIndex]
        if (item) {
          dispatch({ type: "SET_SCREEN", screen: item.screen })
          dispatch({ type: "SET_LIST_INDEX", index: 0 })
        }
        return
      }

    },
    { isActive: !state.formActive && !state.paletteOpen },
  )

  return null
}
