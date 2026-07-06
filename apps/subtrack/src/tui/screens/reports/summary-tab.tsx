import { Box, Text } from "ink"
import { useMemo } from "react"
import { getSubscriptions } from "../../../db.ts"
import { formatPrice } from "../../../price.ts"
import { BarChart } from "../../components/bar-chart.tsx"
import { colors } from "../../theme.ts"
import { monthlyFactor } from "./helpers.ts"

type Props = {
  refreshKey: number
}

export function SummaryTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])

  const totalActive = subs.filter((s) => s.status === "active").length
  const totalPaused = subs.filter((s) => s.status === "paused").length
  const totalCancelled = subs.filter((s) => s.status === "cancelled").length

  const monthlyByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of subs) {
      if (sub.status === "cancelled") continue
      const factor = monthlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + Math.round(sub.price * factor))
    }
    return map
  }, [subs])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold underline color={colors.primary}>At a Glance</Text>
        </Box>
        <Box><Box width={20}><Text color={colors.textDim}>Total subscriptions:</Text></Box><Text bold>{subs.length}</Text></Box>
        <Box><Box width={20}><Text color={colors.textDim}>Active:</Text></Box><Text bold color={colors.statusActive}>{totalActive}</Text></Box>
        <Box><Box width={20}><Text color={colors.textDim}>Paused:</Text></Box><Text bold color={colors.statusPaused}>{totalPaused}</Text></Box>
        <Box><Box width={20}><Text color={colors.textDim}>Cancelled:</Text></Box><Text bold color={colors.statusCancelled}>{totalCancelled}</Text></Box>
      </Box>

      {monthlyByCurrency.size > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box marginBottom={1}>
            <Text bold underline color={colors.primary}>Monthly Cost</Text>
          </Box>
          {Array.from(monthlyByCurrency.entries()).map(([currency, total]) => (
            <Box key={currency} flexDirection="column">
              <Box marginBottom={1}>
                <Text bold color={colors.primary}>{currency}</Text>
                <Text color={colors.textDim}>  {formatPrice(total, currency)}/mo</Text>
              </Box>
              <BarChart
                items={[{ label: "Total", value: total }]}
                maxWidth={12}
                currency={currency}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
