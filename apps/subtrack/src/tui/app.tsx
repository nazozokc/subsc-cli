import { Box, useWindowSize, Text } from "ink"
import { AppProvider, useTui } from "./context/app-context.tsx"
import { KeyboardHandler } from "./keyboard.tsx"
import { CurrentScreen } from "./screen-router.tsx"
import { Sidebar } from "./components/sidebar.tsx"
import { StatusBar } from "./components/status-bar.tsx"
import { CommandBar } from "./components/command-bar.tsx"
import { Toast } from "./components/toast.tsx"
import { CommandPalette } from "./components/command-palette.tsx"
import { DetailPreview } from "./screens/detail.tsx"
import { Frame } from "./components/frame.tsx"
import { colors } from "./theme.ts"
import { SIDEBAR_WIDTH } from "./types.ts"

// ── Root App ─────────────────────────────────────────

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}

/**
 * Layout (top to bottom):
 *
 *  StatusLine            ← 1 row, no border
 * ┌─ Sidebar │ Content ─┐ ← single outer frame, flexGrow=1
 * │ [nav]    │ [data]   │
 * │ ...      │ ...      │
 * └──────────┴──────────┘
 *  CommandBar            ← 1 row, no border
 *
 * The entire content area (sidebar + screen + detail preview)
 * is wrapped in ONE border — no interior borders to clash.
 *
 * Overlays (absolute, on top):
 *   - Toast:  bottom-center
 *   - Palette: full-screen
 */
function AppInner() {
  const { state } = useTui()
  const { columns: termCols } = useWindowSize()

  const tooSmall = termCols < 60

  // Detail preview dimensions
  const showDetail = state.screen === "list" && state.showDetail && state.selectedId !== null
  // Content area width = termCols - 2 (left/right border characters)
  const contentWidth = Math.max(10, termCols - 2)
  const detailWidth = showDetail
    ? Math.max(30, Math.floor(contentWidth * (1 - state.splitRatio)))
    : 0

  // Separator positions (0-indexed within the content area)
  const sepPositions: number[] = []
  if (state.showSidebar && SIDEBAR_WIDTH < contentWidth) {
    sepPositions.push(SIDEBAR_WIDTH)
  }
  if (showDetail && detailWidth > 0) {
    // Second separator goes before detail pane.
    // Ensure it stays after the sidebar separator (if visible).
    const sidebarSep = state.showSidebar ? SIDEBAR_WIDTH : 0
    const sepPos = Math.max(sidebarSep + 1, contentWidth - detailWidth)
    sepPositions.push(sepPos)
  }

  return (
    <Box flexDirection="column" height="100%" position="relative">
      <KeyboardHandler />

      {/* ── Terminal too small warning ── */}
      {tooSmall && (
        <Box flexShrink={0}>
          <Text color="red" bold inverse>
            {" Terminal too small — resize to at least 60 columns "}
          </Text>
        </Box>
      )}

      {/* ── 1-row flat status bar ── */}
      <Box flexShrink={0}>
        <StatusBar />
      </Box>

      {/* ── Main content area — single unified border ── */}
      {/* All 3 panes (sidebar / screen / detail-preview) live inside ONE frame */}
      <Frame
        separatorPositions={sepPositions}
        borderColor={colors.border}
      >
        {/* Sidebar (no border — inside the outer frame) */}
        {state.showSidebar && (
          <>
            <Sidebar />
            {/* Vertical separator between sidebar and content */}
            <Box width={1} minHeight="100%">
              <Text color={colors.border}>│</Text>
            </Box>
          </>
        )}

        {/* Main screen content */}
        <Box flexGrow={1} minWidth={0}>
          <CurrentScreen />
        </Box>

        {/* Detail preview pane (3-pane mode, list screen only) */}
        {state.screen === "list" && state.showDetail && state.selectedId !== null && (
          <>
            <Box width={1} minHeight="100%">
              <Text color={colors.border}>│</Text>
            </Box>
            <Box
              width={detailWidth}
              flexShrink={0}
            >
              <DetailPreview />
            </Box>
          </>
        )}
      </Frame>

      {/* ── 1-row flat command bar ── */}
      <Box flexShrink={0}>
        <CommandBar />
      </Box>

      {/* ── Overlays (on top of everything) ── */}
      <Toast />
      {state.paletteOpen && <CommandPalette />}
    </Box>
  )
}
