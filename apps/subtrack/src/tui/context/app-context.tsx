import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react"
import type { Screen, Mode, Focus, ReportsTab, ToolsTab } from "../types.ts"
import { loadTuiColumns, saveTuiColumns, type TuiColumnSettings } from "../config.ts"

export type SortField = "name" | "price" | "cycle" | "status" | "id"

export type ToastInfo = {
  message: string
  type: "success" | "error" | "info"
}

export type AppState = {
  screen: Screen
  mode: Mode
  focus: Focus
  sidebarIndex: number
  listIndex: number
  filterText: string
  /** Single selected subscription ID — replaces old editId+selectedSubId */
  selectedId: number | null
  /** Navigation history stack (most recent at end) */
  history: Screen[]
  /** True when a form screen is active — disables global keyboard handler */
  formActive: boolean
  /** Sub-tab for reports screen */
  reportsTab: ReportsTab
  /** Sub-tab for tools screen */
  toolsTab: ToolsTab
  /** Multi-select mode: set of selected subscription IDs */
  multiSelect: Set<number>
  /** Incremented to force data refresh */
  refreshKey: number
  /** Sort field for list */
  sortField: SortField
  /** Sort direction */
  sortDesc: boolean
  /** Toast notification (auto-clears after timeout) */
  toast: ToastInfo | null
  /** Command palette open */
  paletteOpen: boolean
  /** Command palette search query */
  paletteQuery: string
  /** Command palette selection index */
  paletteIndex: number
  /** 3-pane: show detail preview alongside list */
  showDetail: boolean
  /** Toggle sidebar visibility (auto-hide on narrow terminals) */
  showSidebar: boolean
  /** Split ratio between list and detail (0.5 = 50/50) */
  splitRatio: number
  /** Column visibility in list screen */
  showTagsCol: boolean
  showNotesCol: boolean
  showMethodCol: boolean
}

export type AppAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "GO_BACK" }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_FOCUS"; focus: Focus }
  | { type: "SET_SIDEBAR_INDEX"; index: number }
  | { type: "SET_LIST_INDEX"; index: number }
  | { type: "SET_FILTER_TEXT"; value: string }
  | { type: "SET_SELECTED_ID"; id: number | null }
  | { type: "SET_FORM_ACTIVE"; active: boolean }
  | { type: "SET_REPORTS_TAB"; tab: ReportsTab }
  | { type: "SET_TOOLS_TAB"; tab: ToolsTab }
  | { type: "TOGGLE_FOCUS" }
  | { type: "MULTI_SELECT_TOGGLE"; id: number }
  | { type: "MULTI_SELECT_CLEAR" }
  | { type: "INCREMENT_REFRESH_KEY" }
  | { type: "SET_SORT" }
  | { type: "SET_TOAST"; toast: ToastInfo | null }
  | { type: "CLEAR_TOAST" }
  | { type: "SET_PALETTE_OPEN"; open: boolean }
  | { type: "SET_PALETTE_QUERY"; query: string }
  | { type: "SET_PALETTE_INDEX"; index: number }
  | { type: "TOGGLE_DETAIL" }
  | { type: "SET_DETAIL_VISIBLE"; visible: boolean }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SPLIT_RATIO"; ratio: number }
  | { type: "SET_SPLIT_RATIO_STEP"; delta: number }
  | { type: "TOGGLE_COLUMN"; column: "tags" | "notes" | "method" }

const columnDefaults = loadTuiColumns()

export const initialState: AppState = {
  screen: "list",
  mode: "NORMAL",
  focus: "content",
  sidebarIndex: 0,
  listIndex: 0,
  filterText: "",
  selectedId: null,
  history: [],
  formActive: false,
  reportsTab: "summary",
  toolsTab: "export",
  multiSelect: new Set(),
  refreshKey: 0,
  sortField: "name",
  sortDesc: false,
  toast: null,
  paletteOpen: false,
  paletteQuery: "",
  paletteIndex: 0,
  showDetail: false,
  showSidebar: true,
  splitRatio: 0.6,
  showTagsCol: columnDefaults.showTagsCol,
  showNotesCol: columnDefaults.showNotesCol,
  showMethodCol: columnDefaults.showMethodCol,
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SCREEN": {
      // Skip history push when navigating to the same screen
      if (action.screen === state.screen) return state
      const history = [...state.history, state.screen]
      return {
        ...state,
        screen: action.screen,
        history,
        mode: "NORMAL",
        focus: "content",
        filterText: "",
        formActive: false,
      }
    }
    case "GO_BACK": {
      if (state.history.length === 0) return state
      const history = [...state.history]
      const prevScreen = history.pop()!
      return {
        ...state,
        screen: prevScreen,
        history,
        mode: "NORMAL",
        focus: "content",
        filterText: "",
        formActive: false,
      }
    }
    case "SET_MODE":
      return { ...state, mode: action.mode }
    case "SET_FOCUS":
      return { ...state, focus: action.focus }
    case "SET_SIDEBAR_INDEX":
      return { ...state, sidebarIndex: action.index }
    case "SET_LIST_INDEX":
      return { ...state, listIndex: action.index }
    case "SET_FILTER_TEXT":
      return { ...state, filterText: action.value }
    case "SET_SELECTED_ID":
      return { ...state, selectedId: action.id }
    case "SET_FORM_ACTIVE":
      return { ...state, formActive: action.active }
    case "SET_REPORTS_TAB":
      return { ...state, reportsTab: action.tab, listIndex: 0 }
    case "SET_TOOLS_TAB":
      return { ...state, toolsTab: action.tab, listIndex: 0 }
    case "TOGGLE_FOCUS":
      return {
        ...state,
        focus: state.focus === "sidebar" ? "content" : "sidebar",
      }
    case "MULTI_SELECT_TOGGLE": {
      const next = new Set(state.multiSelect)
      if (next.has(action.id)) {
        next.delete(action.id)
      } else {
        next.add(action.id)
      }
      return { ...state, multiSelect: next }
    }
    case "MULTI_SELECT_CLEAR":
      return { ...state, multiSelect: new Set() }
    case "INCREMENT_REFRESH_KEY":
      return { ...state, refreshKey: state.refreshKey + 1 }
    case "SET_SORT": {
      const SORT_CYCLE: SortField[] = ["name", "price", "cycle", "status", "id"]
      const idx = SORT_CYCLE.indexOf(state.sortField)
      const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
      // When wrapping back to first field, toggle sort direction
      const wrapped = idx === SORT_CYCLE.length - 1
      const sortDesc = wrapped ? !state.sortDesc : state.sortDesc
      return { ...state, sortField: next, sortDesc }
    }
    case "SET_TOAST":
      return { ...state, toast: action.toast }
    case "CLEAR_TOAST":
      return { ...state, toast: null }
    case "SET_PALETTE_OPEN":
      return {
        ...state,
        paletteOpen: action.open,
        paletteQuery: action.open ? state.paletteQuery : "",
        paletteIndex: 0,
      }
    case "SET_PALETTE_QUERY":
      return { ...state, paletteQuery: action.query, paletteIndex: 0 }
    case "SET_PALETTE_INDEX":
      return { ...state, paletteIndex: action.index }
    case "TOGGLE_DETAIL":
      return { ...state, showDetail: !state.showDetail }
    case "SET_DETAIL_VISIBLE":
      return { ...state, showDetail: action.visible }
    case "TOGGLE_SIDEBAR":
      return { ...state, showSidebar: !state.showSidebar }
    case "SET_SPLIT_RATIO":
      return { ...state, splitRatio: Math.max(0.3, Math.min(0.8, action.ratio)) }
    case "SET_SPLIT_RATIO_STEP": {
      const next = state.splitRatio + action.delta
      return { ...state, splitRatio: Math.max(0.3, Math.min(0.8, next)) }
    }
    case "TOGGLE_COLUMN": {
      let next: AppState
      switch (action.column) {
        case "tags":
          next = { ...state, showTagsCol: !state.showTagsCol }
          break
        case "notes":
          next = { ...state, showNotesCol: !state.showNotesCol }
          break
        case "method":
          next = { ...state, showMethodCol: !state.showMethodCol }
          break
        default:
          return state
      }
      // Persist to config
      const settings: TuiColumnSettings = {
        showTagsCol: next.showTagsCol,
        showNotesCol: next.showNotesCol,
        showMethodCol: next.showMethodCol,
      }
      try { saveTuiColumns(settings) } catch { /* best-effort */ }
      return next
    }
    default:
      return state
  }
}

type AppContextValue = {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useTui(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useTui must be used within <AppProvider>")
  return ctx
}

// ── Convenience dispatchers ──────────────────────────

export function useSetScreen() {
  const { dispatch } = useTui()
  return useCallback(
    (screen: Screen) => dispatch({ type: "SET_SCREEN", screen }),
    [dispatch],
  )
}

export function useGoBack() {
  const { dispatch } = useTui()
  return useCallback(() => dispatch({ type: "GO_BACK" }), [dispatch])
}

export function useSetMode() {
  const { dispatch } = useTui()
  return useCallback(
    (mode: Mode) => dispatch({ type: "SET_MODE", mode }),
    [dispatch],
  )
}

export function useSetFilterText() {
  const { dispatch } = useTui()
  return useCallback(
    (value: string) => dispatch({ type: "SET_FILTER_TEXT", value }),
    [dispatch],
  )
}

export function useSetFormActive() {
  const { dispatch } = useTui()
  return useCallback(
    (active: boolean) => dispatch({ type: "SET_FORM_ACTIVE", active }),
    [dispatch],
  )
}
