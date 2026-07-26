import type { AppState, AppAction } from "./context/app-context.tsx"

export function executeCommand(
  cmd: string,
  state: AppState,
  dispatch: React.Dispatch<AppAction>,
  exit: (error?: Error | unknown) => void,
) {
  const trimmed = cmd.trim()

  if (trimmed.startsWith("/")) {
    const query = trimmed.slice(1)
    dispatch({ type: "SET_FILTER_TEXT", value: query })
    dispatch({ type: "SET_MODE", mode: "NORMAL" })
    return
  }
  if (trimmed === "q" || trimmed === "q!") {
    exit()
    return
  }
  if (trimmed === "help") {
    dispatch({ type: "SET_SCREEN", screen: "help" })
    dispatch({ type: "SET_MODE", mode: "NORMAL" })
    return
  }
  if (trimmed === "clear") {
    dispatch({ type: "SET_FILTER_TEXT", value: "" })
    dispatch({ type: "SET_MODE", mode: "NORMAL" })
    return
  }
  // Unknown command — clear filter text and return to NORMAL
  dispatch({ type: "SET_FILTER_TEXT", value: "" })
  dispatch({ type: "SET_MODE", mode: "NORMAL" })
}
