import { describe, test, expect, beforeEach } from "vitest"
import { appReducer, type AppState, type AppAction } from "../tui/context/app-context.tsx"

function createState(overrides?: Partial<AppState>): AppState {
  return {
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
    showTagsCol: false,
    showNotesCol: false,
    showMethodCol: false,
    ...overrides,
  }
}

describe("appReducer", () => {
  describe("SET_SCREEN", () => {
    test("switches to the requested screen and preserves history", () => {
      const state = createState({ screen: "list", selectedId: 5 })
      const action: AppAction = { type: "SET_SCREEN", screen: "add" }

      const next = appReducer(state, action)

      expect(next.screen).toBe("add")
      expect(next.history).toEqual(["list"])
      expect(next.mode).toBe("NORMAL")
      expect(next.selectedId).toBe(5) // preserved
    })

    test("does nothing when navigating to the same screen", () => {
      const state = createState({ screen: "list" })
      const action: AppAction = { type: "SET_SCREEN", screen: "list" }

      const next = appReducer(state, action)

      // Reference equality — unchanged
      expect(next).toBe(state)
    })
  })

  describe("GO_BACK", () => {
    test("returns to the previous screen", () => {
      const state = createState({ screen: "detail", history: ["list"] })
      const action: AppAction = { type: "GO_BACK" }

      const next = appReducer(state, action)

      expect(next.screen).toBe("list")
      expect(next.history).toEqual([])
      expect(next.mode).toBe("NORMAL")
    })

    test("does nothing when history is empty", () => {
      const state = createState({ screen: "list", history: [] })
      const action: AppAction = { type: "GO_BACK" }

      const next = appReducer(state, action)

      expect(next).toBe(state)
    })
  })

  describe("SET_MODE / SET_FOCUS", () => {
    test("SET_MODE changes mode", () => {
      const state = createState({ mode: "NORMAL" })
      const next = appReducer(state, { type: "SET_MODE", mode: "COMMAND" })
      expect(next.mode).toBe("COMMAND")
    })

    test("SET_FOCUS changes focus", () => {
      const state = createState({ focus: "content" })
      const next = appReducer(state, { type: "SET_FOCUS", focus: "sidebar" })
      expect(next.focus).toBe("sidebar")
    })
  })

  describe("TOGGLE_FOCUS", () => {
    test("toggles between sidebar and content", () => {
      const state = createState({ focus: "content" })
      const next = appReducer(state, { type: "TOGGLE_FOCUS" })
      expect(next.focus).toBe("sidebar")

      const next2 = appReducer(next, { type: "TOGGLE_FOCUS" })
      expect(next2.focus).toBe("content")
    })
  })

  describe("MULTI_SELECT_TOGGLE", () => {
    test("adds id to multiSelect set", () => {
      const state = createState({ multiSelect: new Set() })
      const next = appReducer(state, { type: "MULTI_SELECT_TOGGLE", id: 3 })
      expect(next.multiSelect.has(3)).toBe(true)
      expect(next.multiSelect.size).toBe(1)
    })

    test("removes id from multiSelect set when already selected", () => {
      const state = createState({ multiSelect: new Set([3, 5]) })
      const next = appReducer(state, { type: "MULTI_SELECT_TOGGLE", id: 3 })
      expect(next.multiSelect.has(3)).toBe(false)
      expect(next.multiSelect.size).toBe(1)
    })

    test("does not mutate the original set", () => {
      const original = new Set([3])
      const state = createState({ multiSelect: original })
      appReducer(state, { type: "MULTI_SELECT_TOGGLE", id: 5 })
      expect(original.has(5)).toBe(false)
      expect(original.size).toBe(1)
    })
  })

  describe("SET_SORT", () => {
    test("cycles through sort fields: name → price → cycle → status → id → name", () => {
      const state = createState({ sortField: "name", sortDesc: false })

      const step1 = appReducer(state, { type: "SET_SORT" })
      expect(step1.sortField).toBe("price")
      expect(step1.sortDesc).toBe(false)

      const step2 = appReducer(step1, { type: "SET_SORT" })
      expect(step2.sortField).toBe("cycle")
      expect(step2.sortDesc).toBe(false)

      const step3 = appReducer(step2, { type: "SET_SORT" })
      expect(step3.sortField).toBe("status")
      expect(step3.sortDesc).toBe(false)

      const step4 = appReducer(step3, { type: "SET_SORT" })
      expect(step4.sortField).toBe("id")
      expect(step4.sortDesc).toBe(false)

      // Wrap around — toggle direction on wrap
      const step5 = appReducer(step4, { type: "SET_SORT" })
      expect(step5.sortField).toBe("name")
      expect(step5.sortDesc).toBe(true)
    })
  })

  describe("TOAST operations", () => {
    test("SET_TOAST sets toast", () => {
      const state = createState({ toast: null })
      const next = appReducer(state, {
        type: "SET_TOAST",
        toast: { message: "Test", type: "success" },
      })
      expect(next.toast).toEqual({ message: "Test", type: "success" })
    })

    test("CLEAR_TOAST clears toast", () => {
      const state = createState({
        toast: { message: "Test", type: "info" },
      })
      const next = appReducer(state, { type: "CLEAR_TOAST" })
      expect(next.toast).toBeNull()
    })
  })

  describe("PALETTE operations", () => {
    test("SET_PALETTE_OPEN resets index and keeps query", () => {
      const state = createState({
        paletteOpen: false,
        paletteQuery: "test",
        paletteIndex: 5,
      })
      const next = appReducer(state, { type: "SET_PALETTE_OPEN", open: true })
      expect(next.paletteOpen).toBe(true)
      // Query is preserved from state on open
      expect(next.paletteQuery).toBe("test")
      expect(next.paletteIndex).toBe(0)
    })

    test("SET_PALETTE_QUERY resets index", () => {
      const state = createState({ paletteQuery: "", paletteIndex: 3 })
      const next = appReducer(state, {
        type: "SET_PALETTE_QUERY",
        query: "new",
      })
      expect(next.paletteQuery).toBe("new")
      expect(next.paletteIndex).toBe(0)
    })
  })

  describe("SPLIT RATIO", () => {
    test("SET_SPLIT_RATIO clamps between 0.3 and 0.8", () => {
      const state = createState({ splitRatio: 0.6 })

      const tooLow = appReducer(state, { type: "SET_SPLIT_RATIO", ratio: 0.1 })
      expect(tooLow.splitRatio).toBe(0.3)

      const tooHigh = appReducer(state, { type: "SET_SPLIT_RATIO", ratio: 0.9 })
      expect(tooHigh.splitRatio).toBe(0.8)

      const valid = appReducer(state, { type: "SET_SPLIT_RATIO", ratio: 0.5 })
      expect(valid.splitRatio).toBe(0.5)
    })

    test("SET_SPLIT_RATIO_STEP adjusts by delta and clamps", () => {
      const state = createState({ splitRatio: 0.5 })

      const inc = appReducer(state, { type: "SET_SPLIT_RATIO_STEP", delta: 0.05 })
      expect(inc.splitRatio).toBe(0.55)

      const dec = appReducer(inc, { type: "SET_SPLIT_RATIO_STEP", delta: -0.05 })
      expect(dec.splitRatio).toBe(0.5)
    })
  })

  describe("TOGGLE_COLUMN", () => {
    test("toggles tags column", () => {
      const state = createState({ showTagsCol: false })
      const next = appReducer(state, { type: "TOGGLE_COLUMN", column: "tags" })
      expect(next.showTagsCol).toBe(true)
    })

    test("toggles notes column", () => {
      const state = createState({ showNotesCol: true })
      const next = appReducer(state, { type: "TOGGLE_COLUMN", column: "notes" })
      expect(next.showNotesCol).toBe(false)
    })

    test("toggles method column", () => {
      const state = createState({ showMethodCol: false })
      const next = appReducer(state, { type: "TOGGLE_COLUMN", column: "method" })
      expect(next.showMethodCol).toBe(true)
    })
  })

  describe("SIDEBAR / LIST INDEX", () => {
    test("SET_SIDEBAR_INDEX updates sidebar index", () => {
      const state = createState({ sidebarIndex: 0 })
      const next = appReducer(state, { type: "SET_SIDEBAR_INDEX", index: 2 })
      expect(next.sidebarIndex).toBe(2)
    })

    test("SET_LIST_INDEX updates list index", () => {
      const state = createState({ listIndex: 0 })
      const next = appReducer(state, { type: "SET_LIST_INDEX", index: 5 })
      expect(next.listIndex).toBe(5)
    })
  })

  describe("SET_REPORTS_TAB / SET_TOOLS_TAB", () => {
    test("SET_REPORTS_TAB resets list index", () => {
      const state = createState({ reportsTab: "summary", listIndex: 3 })
      const next = appReducer(state, { type: "SET_REPORTS_TAB", tab: "payment" })
      expect(next.reportsTab).toBe("payment")
      expect(next.listIndex).toBe(0)
    })

    test("SET_TOOLS_TAB resets list index", () => {
      const state = createState({ toolsTab: "export", listIndex: 3 })
      const next = appReducer(state, { type: "SET_TOOLS_TAB", tab: "import" })
      expect(next.toolsTab).toBe("import")
      expect(next.listIndex).toBe(0)
    })
  })

  describe("TOGGLE_DETAIL / TOGGLE_SIDEBAR", () => {
    test("TOGGLE_DETAIL toggles showDetail", () => {
      const state = createState({ showDetail: false })
      const next = appReducer(state, { type: "TOGGLE_DETAIL" })
      expect(next.showDetail).toBe(true)

      const next2 = appReducer(next, { type: "TOGGLE_DETAIL" })
      expect(next2.showDetail).toBe(false)
    })

    test("TOGGLE_SIDEBAR toggles showSidebar", () => {
      const state = createState({ showSidebar: true })
      const next = appReducer(state, { type: "TOGGLE_SIDEBAR" })
      expect(next.showSidebar).toBe(false)
    })
  })
})
