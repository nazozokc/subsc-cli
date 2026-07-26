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

export function ForecastTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])
  const active = subs.filter((s) => s.status === "active")

  const monthly = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of active) {
      const f = monthlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + Math.round(sub.price * f))
    }
    return map
  }, [active])

  const yearly = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of active) {
      const f = yearlyFactor(sub.cycle)
      map.set(sub.currency, (map.get(sub.currency) ?? 0) + Math.round(sub.price * f))
    }
    return map
  }, [active])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Spending Forecast</Text></Box>
      {active.length === 0 ? (
        <Text color={colors.textDim}>No active subscriptions</Text>
      ) : (
        <>
          <Box marginBottom={1} flexDirection="column">
            <Text bold color={colors.primary}>Monthly Costs</Text>
            <Box marginTop={1}>
              {Array.from(monthly.entries()).map(([c, t]) => (
                <Box key={c} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={colors.textDim}>{c}:</Text>
                    <Text bold color={colors.warning}>  {formatPrice(t, c)}</Text>
                  </Box>
                  <BarChart items={[{ label: "Monthly", value: t }]} maxWidth={12} currency={c} />
                </Box>
              ))}
            </Box>
          </Box>
          <Box flexDirection="column">
            <Text bold color={colors.primary}>Yearly Total</Text>
            <Box marginTop={1}>
              {Array.from(yearly.entries()).map(([c, t]) => (
                <Box key={c} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={colors.textDim}>{c}:</Text>
                    <Text bold color={colors.warning}>  {formatPrice(t, c)}</Text>
                  </Box>
                  <BarChart items={[{ label: "Yearly", value: t }]} maxWidth={12} currency={c} />
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}
