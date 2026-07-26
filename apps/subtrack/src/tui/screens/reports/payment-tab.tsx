import { Box, Text } from "ink"
import { useMemo } from "react"
import { getSubscriptions } from "../../../db.ts"
import { formatPrice } from "../../../price.ts"
import { BarChart } from "../../components/bar-chart.tsx"
import { colors } from "../../theme.ts"
import { monthlyFactor, yearlyFactor } from "./helpers.ts"

type Props = {
  refreshKey: number
}

export function PaymentTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])
  const active = subs.filter((s) => s.status === "active")

  const monthlyByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of active) {
      const factor = monthlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + Math.round(sub.price * factor))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [active])

  const yearlyByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of active) {
      const factor = yearlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + Math.round(sub.price * factor))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [active])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Payment Totals</Text></Box>
      {active.length === 0 ? (
        <Text color={colors.textDim}>No active subscriptions</Text>
      ) : (
        <>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={colors.primary}>Monthly</Text>
            {monthlyByCurrency.map(([currency, total]) => (
              <Box key={currency} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={colors.textDim}>{currency}</Text>
                  <Text bold color={colors.warning}>  {formatPrice(total, currency)}</Text>
                </Box>
                <BarChart
                  items={[{ label: "Monthly", value: total }]}
                  maxWidth={12}
                  currency={currency}
                />
              </Box>
            ))}
          </Box>
          <Box flexDirection="column">
            <Text bold color={colors.primary}>Yearly</Text>
            {yearlyByCurrency.map(([currency, total]) => (
              <Box key={currency} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={colors.textDim}>{currency}</Text>
                  <Text bold color={colors.warning}>  {formatPrice(total, currency)}</Text>
                </Box>
                <BarChart
                  items={[{ label: "Yearly", value: total }]}
                  maxWidth={12}
                  currency={currency}
                />
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}
