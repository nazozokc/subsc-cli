import { Box, Text, useWindowSize, useInput, useApp } from "ink"
import Gradient from "ink-gradient"
import { getSubscriptions, getSubscription, updateSubscription, deleteSubscription } from "../../db.ts"
import { useTui, type SortField } from "../context/app-context.tsx"
import type { Status } from "../../types.ts"
import { getActiveFilter, buildFilterParams, getActiveProfileName } from "../../profile.ts"
import { SIDEBAR_WIDTH } from "../types.ts"
import { useMemo, useEffect, useState } from "react"
import { formatPrice } from "../../price.ts"
import { colors, statusColor, statusLabel } from "../theme.ts"

// ── Column layout ────────────────────────────────────

type Column = {
  key: string
  label: string
  minWidth: number
  flex: number
  align: "left" | "right"
  sortField?: SortField
}

function getColumns(state: { showTagsCol: boolean; showNotesCol: boolean; showMethodCol: boolean }): Column[] {
  const cols: Column[] = [
    { key: "name", label: "Name", minWidth: 8, flex: 4, align: "left", sortField: "name" },
    { key: "status", label: "Status", minWidth: 8, flex: 2, align: "left", sortField: "status" },
    { key: "cycle", label: "Cycle", minWidth: 6, flex: 2, align: "left", sortField: "cycle" },
  ]
  if (state.showMethodCol) {
    cols.push({ key: "method", label: "Method", minWidth: 6, flex: 2, align: "left" })
  }
  cols.push({ key: "billingDay", label: "Bill", minWidth: 4, flex: 1, align: "right" })
  if (state.showTagsCol) {
    cols.push({ key: "tags", label: "Tags", minWidth: 4, flex: 3, align: "left" })
  }
  if (state.showNotesCol) {
    cols.push({ key: "notes", label: "Notes", minWidth: 6, flex: 3, align: "left" })
  }
  cols.push({ key: "price", label: "Price", minWidth: 10, flex: 3, align: "right", sortField: "price" })
  return cols
}

function calcWidths(columns: Column[], availableWidth: number): number[] {
  const totalFlex = columns.reduce((s, c) => s + c.flex, 0)
  const widths = columns.map((c) => c.minWidth)
  const remaining = availableWidth - widths.reduce((s, w) => s + w, 0)

  if (remaining > 0) {
    let allocated = 0
    for (let i = 0; i < columns.length - 1; i++) {
      const extra = Math.floor((remaining * columns[i].flex) / totalFlex)
      widths[i] += extra
      allocated += extra
    }
    widths[columns.length - 1] += remaining - allocated
  }

  return widths
}

// ── Sort indicator ────────────────────────────────────

function sortArrow(field: SortField | undefined, sortField: SortField, desc: boolean): string {
  if (field !== sortField) return ""
  return desc ? " ▼" : " ▲"
}

// ── Component ────────────────────────────────────────

export function ListScreen() {
  const { state, dispatch } = useTui()
  const { columns: termCols, rows: termRows } = useWindowSize()

  const { sortField, sortDesc } = state

  // Available width: full terminal minus sidebar (if shown) minus border(2)
  const sidebarW = state.showSidebar ? SIDEBAR_WIDTH + 1 : 0 // +1 for │ separator
  const availableWidth = Math.max(40, termCols - sidebarW - 3)
  const LAYOUT_OVERHEAD = 3 // StatusBar + CommandBar + border top/bottom
  const availableHeight = Math.max(5, termRows - LAYOUT_OVERHEAD - 1) // -1 for header

  const columns = useMemo(() => getColumns(state), [state.showTagsCol, state.showNotesCol, state.showMethodCol])
  const widths = useMemo(() => calcWidths(columns, availableWidth), [columns, availableWidth])

  // ── Data ──

  const subs = useMemo(() => {
    let list = getSubscriptions({ sort: sortField, desc: sortDesc })

    // Apply profile filter (if active)
    const activeFilter = getActiveFilter()
    if (activeFilter) {
      const params = buildFilterParams(activeFilter)
      if (params.tags && params.tags.length > 0) {
        list = list.filter((s) =>
          params.tags!.some((t) => s.tags.includes(t)),
        )
      }
      if (params.status) {
        list = list.filter((s) => s.status === params.status)
      }
      if (params.paymentMethod) {
        list = list.filter(
          (s) => s.paymentMethod === params.paymentMethod,
        )
      }
    }

    // Apply text filter
    if (state.filterText) {
      const q = state.filterText.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          (s.notes ?? "").toLowerCase().includes(q),
      )
    }
    return list
  }, [state.filterText, sortField, sortDesc, state.refreshKey])

  // Clamp listIndex
  const clampedListIndex = useMemo(() => {
    if (subs.length === 0) return 0
    return Math.min(state.listIndex, subs.length - 1)
  }, [state.listIndex, subs.length])

  useEffect(() => {
    if (subs.length === 0) {
      dispatch({ type: "SET_SELECTED_ID", id: null })
    } else {
      dispatch({ type: "SET_SELECTED_ID", id: subs[clampedListIndex].id })
    }
  }, [clampedListIndex, subs, dispatch])

  // ── Scroll ──

  const maxVisible = Math.max(1, availableHeight - 1) // -1 for totals row
  const scrollPosition = subs.length > 0
    ? `${clampedListIndex + 1}/${subs.length}`
    : ""
  const scrollOffset = Math.max(
    0,
    Math.min(clampedListIndex - Math.floor(maxVisible / 2), Math.max(0, subs.length - maxVisible)),
  )
  const visibleSubs = subs.slice(scrollOffset, scrollOffset + maxVisible)

  // Visual scrollbar (thin, right side)
  const scrollBarWidth = 6
  const scrollBar = useMemo(() => {
    if (subs.length <= maxVisible) return ""
    const pos = clampedListIndex / (subs.length - 1)
    const filled = Math.round(pos * scrollBarWidth)
    return "▓".repeat(filled) + "░".repeat(scrollBarWidth - filled)
  }, [clampedListIndex, subs.length, maxVisible])

  // ── Totals ──

  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of subs) {
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + sub.price)
    }
    return map
  }, [subs])

  const activeCount = useMemo(() => subs.filter((s) => s.status === "active").length, [subs])
  const { exit } = useApp()

  // ── Bulk confirm state ──
  const [bulkConfirm, setBulkConfirm] = useState<"delete" | null>(null)

  useEffect(() => {
    dispatch({ type: "SET_FORM_ACTIVE", active: bulkConfirm !== null })
  }, [bulkConfirm, dispatch])

  // ── Keyboard ──

  useInput(
    (input: string, key) => {
      if (state.focus !== "content" || state.mode !== "NORMAL") return

      // Handle bulk confirm prompt
      if (bulkConfirm === "delete") {
        if (input === "y" || input === "Y") {
          const ids = Array.from(state.multiSelect)
          if (ids.length > 0) {
            let count = 0
            for (const id of ids) {
              try {
                deleteSubscription(id)
                count++
              } catch { /* skip failed */ }
            }
            dispatch({ type: "MULTI_SELECT_CLEAR" })
            dispatch({ type: "INCREMENT_REFRESH_KEY" })
            dispatch({
              type: "SET_TOAST",
              toast: { message: `Deleted ${count} subscription${count !== 1 ? "s" : ""}`, type: "success" },
            })
          }
          setBulkConfirm(null)
          return
        }
        if (input === "n" || input === "N" || key.escape) {
          setBulkConfirm(null)
          return
        }
        return // block other keys during confirm
      }

      // Navigation
      if (key.upArrow || input === "k") {
        dispatch({ type: "SET_LIST_INDEX", index: Math.max(0, state.listIndex - 1) })
        return
      }
      if (key.downArrow || input === "j") {
        dispatch({ type: "SET_LIST_INDEX", index: state.listIndex + 1 })
        return
      }
      if (key.pageUp || (key.ctrl && input === "u")) {
        const jump = Math.max(1, Math.floor(termRows / 2))
        dispatch({ type: "SET_LIST_INDEX", index: Math.max(0, state.listIndex - jump) })
        return
      }
      if (key.pageDown || (key.ctrl && input === "d")) {
        const jump = Math.max(1, Math.floor(termRows / 2))
        dispatch({ type: "SET_LIST_INDEX", index: state.listIndex + jump })
        return
      }
      if (key.home || input === "g") {
        dispatch({ type: "SET_LIST_INDEX", index: 0 })
        return
      }
      if (key.end || input === "G") {
        dispatch({ type: "SET_LIST_INDEX", index: Number.MAX_SAFE_INTEGER })
        return
      }

      // 3-pane: toggle detail preview
      if (input === "|") {
        if (state.selectedId !== null) {
          dispatch({ type: "TOGGLE_DETAIL" })
        }
        return
      }

      // Actions
      if (input === "a") {
        dispatch({ type: "SET_SCREEN", screen: "add" })
        return
      }
      // Enter in 3-pane mode: toggle detail; without 3-pane: go to detail screen
      if (key.return && state.selectedId !== null) {
        if (state.showDetail) {
          dispatch({ type: "SET_SCREEN", screen: "detail" })
        } else {
          dispatch({ type: "TOGGLE_DETAIL" })
        }
        return
      }
      if (input === "e" && state.selectedId !== null) {
        dispatch({ type: "SET_SCREEN", screen: "edit" })
        return
      }
      if (input === "d") {
        // Multi-select: bulk delete
        if (state.multiSelect.size > 0) {
          setBulkConfirm("delete")
          return
        }
        if (state.selectedId !== null) {
          dispatch({ type: "SET_SCREEN", screen: "delete" })
          return
        }
        return
      }
      if (input === "/") {
        dispatch({ type: "SET_MODE", mode: "COMMAND" })
        dispatch({ type: "SET_FILTER_TEXT", value: "/" })
        return
      }
      // 3-pane: show history for the selected subscription
      if (input === "h" && state.showDetail && state.selectedId !== null) {
        dispatch({ type: "SET_SCREEN", screen: "history" })
        return
      }
      if (input === "v") {
        if (state.selectedId !== null) {
          dispatch({ type: "MULTI_SELECT_TOGGLE", id: state.selectedId })
        }
        return
      }
      if (input === "r") {
        dispatch({ type: "SET_SCREEN", screen: "reports" })
        return
      }
      if (input === "c") {
        dispatch({ type: "SET_SCREEN", screen: "config" })
        return
      }
      if (input === "R") {
        dispatch({ type: "INCREMENT_REFRESH_KEY" })
        return
      }
      if (input === "s") {
        dispatch({ type: "SET_SORT" })
        return
      }
      if (input === "_") {
        dispatch({ type: "TOGGLE_COLUMN", column: "tags" })
        return
      }
      if (input === "<") {
        dispatch({ type: "TOGGLE_COLUMN", column: "notes" })
        return
      }
      if (input === ">") {
        dispatch({ type: "TOGGLE_COLUMN", column: "method" })
        return
      }
      if (input === "S") {
        // Multi-select: bulk status toggle
        if (state.multiSelect.size > 0) {
          const ids = Array.from(state.multiSelect)
          const cycle: Record<Status, Status> = {
            active: "paused",
            paused: "cancelled",
            cancelled: "archived",
            archived: "active",
          }
          const label: Record<Status, string> = {
            active: "Active",
            paused: "Paused",
            cancelled: "Cancelled",
            archived: "Archived",
          }
          let updated = 0
          for (const id of ids) {
            const sub = getSubscription(id)
            if (!sub) continue
            try {
              updateSubscription(sub.id, { status: cycle[sub.status] })
              updated++
            } catch { /* skip */ }
          }
          dispatch({ type: "INCREMENT_REFRESH_KEY" })
          dispatch({
            type: "SET_TOAST",
            toast: {
              message: `Toggled status for ${updated} subscription${updated !== 1 ? "s" : ""}`,
              type: "info",
            },
          })
          return
        }
        // Single item: cycle status
        if (state.selectedId !== null) {
          const sub = getSubscription(state.selectedId)
          if (sub) {
            const cycle: Record<Status, Status> = {
              active: "paused",
              paused: "cancelled",
              cancelled: "archived",
              archived: "active",
            }
            const label: Record<Status, string> = {
              active: "Active",
              paused: "Paused",
              cancelled: "Cancelled",
              archived: "Archived",
            }
            const newStatus = cycle[sub.status]
            try {
              updateSubscription(sub.id, { status: newStatus })
              dispatch({ type: "INCREMENT_REFRESH_KEY" })
              dispatch({
                type: "SET_TOAST",
                toast: {
                  message: `${sub.name} → ${label[newStatus]}`,
                  type: "info",
                },
              })
            } catch (e: unknown) {
              dispatch({
                type: "SET_TOAST",
                toast: {
                  message: `Failed to update ${sub.name}: ${e instanceof Error ? e.message : String(e)}`,
                  type: "error",
                },
              })
            }
          }
        }
        return
      }
    },
    { isActive: state.focus === "content" && !state.formActive && !state.paletteOpen },
  )

  // ── Render ──

  const barshow = scrollBar && scrollPosition ? `${scrollBar} ${scrollPosition}` : ""

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* ── Row 1: Title + stats ── */}
      <Box>
        <Box flexGrow={1}>
          <Gradient name="pastel">
            <Text bold>
              Subscriptions{" "}
            </Text>
          </Gradient>
          <Text color={colors.textDim}>
            {subs.length} total · {activeCount} active
          </Text>
          {getActiveProfileName() && (
            <Text color={colors.info}>
              {"  "}● {getActiveProfileName()}
            </Text>
          )}
          {state.filterText && (
            <Text color={colors.info}>
              {"  ▶ "}
              {state.filterText.length > 20
                ? state.filterText.slice(0, 20) + "…"
                : state.filterText}
            </Text>
          )}
          {state.multiSelect.size > 0 && (
            <Text bold color={colors.warning}>
              {"  ["}{state.multiSelect.size}{"]"}
            </Text>
          )}
          {state.filterText && subs.length > 0 && (
            <Text dimColor>
              {" — "}{state.filterText.length > 15
                ? state.filterText.slice(0, 15) + "…"
                : state.filterText}{" "}({subs.length})
            </Text>
          )}
        </Box>
        {barshow && (
          <Box flexShrink={0}>
            <Text color={colors.textDim}>{barshow}</Text>
          </Box>
        )}
      </Box>

      {/* ── Column toggle indicators ── */}
      <Box>
        <Text dimColor>
          {"  "}
          {state.showTagsCol ? "[T]" : "[·]"}
          {state.showNotesCol ? "[N]" : "[·]"}
          {state.showMethodCol ? "[M]" : "[·]"}
        </Text>
        {state.multiSelect.size > 0 && (
          <Text bold color={colors.warning}>
            {"  "}● {state.multiSelect.size} selected · d:delete S:toggle
          </Text>
        )}
      </Box>

      {/* ── Row 3: Column headers ── */}
      <Box>
        {/* Multi-select spacer */}
        <Box width={2} />
        {columns.map((col, i) => (
          <Box key={col.key} width={widths[i]}>
            <Text
              bold
              underline
              color={col.sortField === sortField ? colors.primary : colors.textDim}
            >
              {col.align === "right"
                ? (col.label + sortArrow(col.sortField, sortField, sortDesc)).padStart(widths[i])
                : (col.label + sortArrow(col.sortField, sortField, sortDesc)).padEnd(widths[i])}
            </Text>
          </Box>
        ))}
      </Box>

      {/* ── Data rows ── */}
      <Box flexGrow={1} flexDirection="column" minHeight={0}>
        {visibleSubs.length === 0 ? (
          <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
            {state.filterText ? (
              <>
                <Text color={colors.textDim}>No subscriptions match filter</Text>
                <Box marginTop={1}>
                  <Text color={colors.info}>  Esc or Ctrl+L</Text>
                  <Text color={colors.textDim}>  Clear filter</Text>
                </Box>
              </>
            ) : (
              <Box
                borderStyle="round"
                borderColor={colors.primary}
                paddingX={2}
                paddingY={1}
                flexDirection="column"
                alignItems="center"
              >
                <Text bold color={colors.primary}>No subscriptions yet</Text>
                <Box marginTop={1}>
                  <Text color={colors.textDim}>
                    Press  <Text bold color={colors.success}>a</Text>  to add your first subscription
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text color={colors.textDim}>
                    Or use  <Text bold color={colors.success}>Ctrl+P</Text>  to open command palette
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          visibleSubs.map((sub, idx) => {
            const globalIdx = scrollOffset + idx
            const isSelected = globalIdx === clampedListIndex
            const isActiveFocus = state.focus === "content"
            const isMultiSelected = state.multiSelect.has(sub.id)
            const isEven = globalIdx % 2 === 0

            // Selection: use background-color highlight (not inverse)
            const selStyle = isSelected && isActiveFocus

            const isCancelled = sub.status === "cancelled"
            const rowTextColor = isCancelled
              ? colors.textDim
              : (isEven && !selStyle ? colors.textDim : colors.text)

            function renderCell(col: Column, ci: number) {
              const w = widths[ci]
              const align = col.align === "right" ? "flex-end" as const : "flex-start" as const
              const bgColor = selStyle ? colors.selectedBg : undefined

              switch (col.key) {
                case "name":
                  return (
                    <Box key={col.key} width={w}>
                      <Text
                        bold={selStyle}
                        color={selStyle ? colors.selectedFg : (isCancelled ? colors.textDim : colors.text)}
                        backgroundColor={bgColor}
                        wrap="truncate-end"
                      >
                        {sub.name.padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "status":
                  return (
                    <Box key={col.key} width={w}>
                      <Text color={statusColor(sub.status)} backgroundColor={bgColor}>
                        {statusLabel(sub.status).padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "cycle":
                  return (
                    <Box key={col.key} width={w}>
                      <Text color={rowTextColor} backgroundColor={bgColor}>
                        {sub.cycle.padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "method":
                  return (
                    <Box key={col.key} width={w}>
                      <Text color={rowTextColor} backgroundColor={bgColor} wrap="truncate-end">
                        {(sub.paymentMethod ?? "—").padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "billingDay":
                  return (
                    <Box key={col.key} width={w} justifyContent="flex-end">
                      <Text color={rowTextColor} backgroundColor={bgColor}>
                        {sub.billingDay
                          ? String(sub.billingDay).padStart(w).slice(0, w)
                          : "—".padStart(w)}
                      </Text>
                    </Box>
                  )
                case "tags":
                  return (
                    <Box key={col.key} width={w}>
                      <Text color={rowTextColor} backgroundColor={bgColor} wrap="truncate-end">
                        {(sub.tags.length > 0 ? sub.tags.join(", ") : "—").padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "notes":
                  return (
                    <Box key={col.key} width={w}>
                      <Text color={rowTextColor} backgroundColor={bgColor} wrap="truncate-end">
                        {(sub.notes ?? "—").padEnd(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                case "price":
                  return (
                    <Box key={col.key} width={w} justifyContent="flex-end">
                      <Text
                        bold
                        color={selStyle ? colors.selectedFg : (isCancelled ? colors.textDim : colors.warning)}
                        backgroundColor={bgColor}
                      >
                        {formatPrice(sub.price, sub.currency).padStart(w).slice(0, w)}
                      </Text>
                    </Box>
                  )
                default:
                  return null
              }
            }

            return (
              <Box key={sub.id} minHeight={1}>
                {/* Multi-select / selection marker */}
                <Box width={2} flexShrink={0}>
                  {isMultiSelected ? (
                    <Text bold color={colors.warning}>●</Text>
                  ) : selStyle ? (
                    <Text color={colors.primary}>▸</Text>
                  ) : (
                    <Text color={colors.textDim}> </Text>
                  )}
                </Box>
                {columns.map((col, ci) => renderCell(col, ci))}
              </Box>
            )
          })
        )}
      </Box>

      {/* ── Totals footer ── */}
      {totals.size > 0 && (
        <Box>
          <Box width={2} />
          <Text bold color={colors.textDim} underline>
            Total{"  "}
          </Text>
          {Array.from(totals.entries()).map(([currency, total]) => (
            <Text key={currency} bold color={colors.warning}>
              {formatPrice(total, currency)}{"  "}
            </Text>
          ))}
        </Box>
      )}

      {/* ── Bulk confirm prompt ── */}
      {bulkConfirm === "delete" && (
        <Box marginTop={1} paddingX={1} paddingY={1} borderStyle="round" borderColor={colors.danger}>
          <Box flexDirection="column">
            <Text bold color={colors.danger}>
              Delete {state.multiSelect.size} selected subscription{state.multiSelect.size !== 1 ? "s" : ""}?
            </Text>
            <Text dimColor>
              This cannot be undone.{"  "}
              <Text bold color="green" inverse> y </Text>
              {"  to confirm  "}
              <Text bold color="red" inverse> n </Text>
              {"  to cancel"}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
