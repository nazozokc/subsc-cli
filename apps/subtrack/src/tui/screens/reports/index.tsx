import { Box, Text, useInput } from "ink"
import { useTui } from "../../context/app-context.tsx"
import { TabBar } from "../../components/tab-bar.tsx"
import { Header } from "../../components/header.tsx"
import { REPORT_TABS, REPORT_TAB_LABELS } from "../../types.ts"
import { SummaryTab } from "./summary-tab.tsx"
import { PaymentTab } from "./payment-tab.tsx"
import { UpcomingTab } from "./upcoming-tab.tsx"
import { AnalyticsTab } from "./analytics-tab.tsx"
import { CompareTab } from "./compare-tab.tsx"
import { ForecastTab } from "./forecast-tab.tsx"

export function ReportsScreen() {
  const { state, dispatch } = useTui()
  const refreshKey = state.refreshKey

  useInput(
    (input: string, key) => {
      if (key.leftArrow || input === "h") {
        const idx = REPORT_TABS.indexOf(state.reportsTab)
        const prev = REPORT_TABS[(idx - 1 + REPORT_TABS.length) % REPORT_TABS.length]
        dispatch({ type: "SET_REPORTS_TAB", tab: prev })
        return
      }
      if (key.rightArrow || input === "l") {
        const idx = REPORT_TABS.indexOf(state.reportsTab)
        const next = REPORT_TABS[(idx + 1) % REPORT_TABS.length]
        dispatch({ type: "SET_REPORTS_TAB", tab: next })
        return
      }
    },
    { isActive: state.focus === "content" && !state.formActive && !state.paletteOpen },
  )

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header gradient>Reports</Header>

      <TabBar tabs={REPORT_TABS} activeTab={state.reportsTab} tabLabels={REPORT_TAB_LABELS} />

      <Box flexGrow={1}>
        {state.reportsTab === "summary" && <SummaryTab refreshKey={refreshKey} />}
        {state.reportsTab === "payment" && <PaymentTab refreshKey={refreshKey} />}
        {state.reportsTab === "upcoming" && <UpcomingTab refreshKey={refreshKey} />}
        {state.reportsTab === "analytics" && <AnalyticsTab refreshKey={refreshKey} />}
        {state.reportsTab === "compare" && <CompareTab refreshKey={refreshKey} />}
        {state.reportsTab === "forecast" && <ForecastTab refreshKey={refreshKey} />}
      </Box>
    </Box>
  )
}
