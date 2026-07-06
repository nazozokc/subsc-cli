import { Box, Text } from "ink"
import { formatPrice } from "../../price.ts"
import { colors } from "../theme.ts"

type BarItem = {
  label: string
  value: number
  color?: string
}

type Props = {
  items: BarItem[]
  maxWidth?: number
  currency?: string
}

export function BarChart({ items, maxWidth = 16, currency = "USD" }: Props) {
  if (items.length === 0) return null

  const maxValue = Math.max(...items.map((i) => i.value), 1)

  return (
    <Box flexDirection="column" gap={0}>
      {items.map((item) => {
        const ratio = item.value / maxValue
        const filled = Math.round(ratio * maxWidth)
        const empty = maxWidth - filled
        const bar = "█".repeat(filled) + "░".repeat(Math.max(0, empty))

        return (
          <Box key={item.label} minHeight={1}>
            <Box width={18}>
              <Text color={colors.text} bold wrap="truncate-end">
                {item.label.padEnd(18).slice(0, 18)}
              </Text>
            </Box>
            <Box width={maxWidth + 2}>
              <Text color={item.color ?? colors.primary}>{bar}</Text>
            </Box>
            <Box width={14} justifyContent="flex-end">
              <Text bold color={colors.warning}>
                {formatPrice(item.value, currency)}
              </Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
