import { Box, Text } from "ink"
import { useMemo } from "react"
import { getSubscriptions } from "../../../db.ts"
import { BarChart } from "../../components/bar-chart.tsx"
import { colors } from "../../theme.ts"

type Props = {
  refreshKey: number
}

export function AnalyticsTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])
  const activeSubs = subs.filter((s) => s.status === "active")

  const tagFreq = useMemo(() => {
    const map = new Map<string, number>()
    for (const sub of activeSubs) {
      for (const tag of sub.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [activeSubs])

  const cycleCost = useMemo(() => {
    const map = new Map<string, { cycle: string; currency: string; total: number }>()
    for (const sub of activeSubs) {
      const key = `${sub.cycle}::${sub.currency}`
      const existing = map.get(key) ?? { cycle: sub.cycle, currency: sub.currency, total: 0 }
      existing.total += sub.price
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [activeSubs])

  const sortedByPrice = useMemo(
    () => [...activeSubs].sort((a, b) => b.price - a.price).slice(0, 5),
    [activeSubs],
  )

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Analytics</Text></Box>
      {activeSubs.length === 0 ? (
        <Text color={colors.textDim}>No active subscriptions</Text>
      ) : (
        <>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={colors.primary}>Most Expensive (top 5)</Text>
            <Box marginTop={1}>
              <BarChart
                items={sortedByPrice.map((sub) => ({
                  label: sub.name,
                  value: sub.price,
                  color: colors.warning,
                }))}
                maxWidth={16}
                currency={sortedByPrice[0]?.currency ?? "USD"}
              />
            </Box>
            <Box marginTop={1}>
              {sortedByPrice.map((sub, i) => (
                <Box key={sub.id}>
                  <Box width={4}><Text color={colors.textDim}>{(i + 1) + "."}</Text></Box>
                  <Box width={24}><Text bold wrap="truncate-end">{sub.name}</Text></Box>
                  <Text color={colors.textDim}>/{sub.cycle}</Text>
                </Box>
              ))}
            </Box>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={colors.primary}>Cost by Cycle</Text>
            <Box marginTop={1}>
              {Array.from(new Set(cycleCost.map((c) => c.currency))).map((currency) => (
                <Box key={currency} flexDirection="column" marginBottom={1}>
                  <Text color={colors.textDim}>{currency}:</Text>
                  <BarChart
                    items={cycleCost
                      .filter((c) => c.currency === currency)
                      .map((c) => ({ label: c.cycle, value: c.total }))}
                    maxWidth={16}
                    currency={currency}
                  />
                </Box>
              ))}
            </Box>
          </Box>

          <Box flexDirection="column">
            <Text bold color={colors.primary}>Top Tags</Text>
            {tagFreq.length === 0 ? (
              <Text color={colors.textDim}>No tags</Text>
            ) : (
              tagFreq.slice(0, 10).map(([tag, count]) => (
                <Box key={tag}>
                  <Box width={20}><Text bold wrap="truncate-end">{tag}</Text></Box>
                  <Text color={colors.textDim}>{count} subscription{count !== 1 ? "s" : ""}</Text>
                </Box>
              ))
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
