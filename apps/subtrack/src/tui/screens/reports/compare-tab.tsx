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

export function CompareTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])
  const active = subs.filter((s) => s.status === "active")

  const monthlyTotal = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of active) {
      const factor = monthlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + sub.price * factor)
    }
    for (const [currency, total] of map) {
      map.set(currency, Math.round(total))
    }
    return map
  }, [active])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Period Comparison</Text></Box>
      {active.length === 0 ? (
        <Text color={colors.textDim}>No active subscriptions</Text>
      ) : (
        Array.from(monthlyTotal.entries()).map(([currency, total]) => (
          <Box key={currency} flexDirection="column" marginBottom={1}>
            <Box marginBottom={1}>
              <Text bold color={colors.primary}>{currency}/month</Text>
              <Text bold color={colors.warning}>  {formatPrice(total, currency)}</Text>
            </Box>
            <BarChart
              items={[{ label: currency, value: total }]}
              maxWidth={16}
              currency={currency}
            />
          </Box>
        ))
      )}
    </Box>
  )
}
