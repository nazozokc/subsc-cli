import { Box, Text } from "ink"
import { useMemo } from "react"
import { getSubscriptions } from "../../../db.ts"
import { formatPrice } from "../../../price.ts"
import { colors } from "../../theme.ts"
import { computeNextBill } from "./helpers.ts"

type Props = {
  refreshKey: number
}

export function UpcomingTab({ refreshKey }: Props) {
  const subs = useMemo(() => getSubscriptions(), [refreshKey])
  const today = new Date()
  const in7Days = new Date(today.getTime() + 7 * 86400000)

  const upcoming = useMemo(() => {
    return subs
      .filter((s) => s.status === "active" && s.billingDay !== null)
      .map((s) => ({
        ...s,
        nextBill: computeNextBill(s.billingDay!, today, in7Days),
      }))
      .filter((s) => s.nextBill !== null)
      .sort((a, b) => a.nextBill!.getTime() - b.nextBill!.getTime())
  }, [subs])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Upcoming Bills (next 7 days)</Text></Box>
      {upcoming.length === 0 ? (
        <Text color={colors.textDim}>No bills due in the next 7 days</Text>
      ) : (
        upcoming.map((s) => (
          <Box key={s.id}>
            <Box width={24}><Text bold wrap="truncate-end">{s.name}</Text></Box>
            <Box width={16}>
              <Text color={colors.warning}>
                {s.nextBill!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </Box>
            <Box width={14}><Text>{formatPrice(s.price, s.currency)}</Text></Box>
            <Text color={colors.textDim}>/{s.cycle}</Text>
          </Box>
        ))
      )}
    </Box>
  )
}
