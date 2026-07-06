import { Box, useInput } from "ink"
import { useTui } from "../../context/app-context.tsx"
import { TabBar } from "../../components/tab-bar.tsx"
import { Header } from "../../components/header.tsx"
import { TOOLS_TABS, TOOLS_TAB_LABELS } from "../../types.ts"
import { ExportTab } from "./export-tab.tsx"
import { ImportTab } from "./import-tab.tsx"
import { BackupTab } from "./backup-tab.tsx"
import { RestoreTab } from "./restore-tab.tsx"
import { UsageTab } from "./usage-tab.tsx"

export function ToolsScreen() {
  const { state, dispatch } = useTui()

  useInput(
    (input: string, key) => {
      if (key.leftArrow || input === "h") {
        const idx = TOOLS_TABS.indexOf(state.toolsTab)
        const prev = TOOLS_TABS[(idx - 1 + TOOLS_TABS.length) % TOOLS_TABS.length]
        dispatch({ type: "SET_TOOLS_TAB", tab: prev })
        return
      }
      if (key.rightArrow || input === "l") {
        const idx = TOOLS_TABS.indexOf(state.toolsTab)
        const next = TOOLS_TABS[(idx + 1) % TOOLS_TABS.length]
        dispatch({ type: "SET_TOOLS_TAB", tab: next })
        return
      }
    },
    { isActive: state.focus === "content" && !state.formActive && !state.paletteOpen },
  )

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header>Tools</Header>

      <TabBar tabs={TOOLS_TABS} activeTab={state.toolsTab} tabLabels={TOOLS_TAB_LABELS} />

      <Box flexGrow={1}>
        {state.toolsTab === "export" && <ExportTab />}
        {state.toolsTab === "import" && <ImportTab />}
        {state.toolsTab === "backup" && <BackupTab />}
        {state.toolsTab === "restore" && <RestoreTab />}
        {state.toolsTab === "usage" && <UsageTab />}
      </Box>
    </Box>
  )
}
