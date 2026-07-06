import { Box, Text } from "ink"
import { useTui } from "./context/app-context.tsx"
import { ListScreen } from "./screens/list.tsx"
import { AddScreen } from "./screens/add.tsx"
import { EditScreen } from "./screens/edit.tsx"
import { DeleteScreen } from "./screens/delete.tsx"
import { DetailScreen } from "./screens/detail.tsx"
import { ReportsScreen } from "./screens/reports/index.tsx"
import { CalendarScreen } from "./screens/calendar-screen.tsx"
import { ConfigScreen } from "./screens/config.tsx"
import { ToolsScreen } from "./screens/tools/index.tsx"
import { HelpScreen } from "./screens/help.tsx"
import { HistoryScreen } from "./screens/history-screen.tsx"

export function CurrentScreen() {
  const { state } = useTui()

  switch (state.screen) {
    case "list":
      return <ListScreen />
    case "add":
      return <AddScreen />
    case "edit":
      return <EditScreen />
    case "delete":
      return <DeleteScreen />
    case "detail":
      return <DetailScreen />
    case "history":
      return <HistoryScreen />
    case "reports":
      return <ReportsScreen />
    case "calendar":
      return <CalendarScreen />
    case "config":
      return <ConfigScreen />
    case "tools":
      return <ToolsScreen />
    case "help":
      return <HelpScreen />
    default:
      return (
        <Box flexGrow={1} alignItems="center" justifyContent="center">
          <Text dimColor>Unknown screen</Text>
        </Box>
      )
  }
}
