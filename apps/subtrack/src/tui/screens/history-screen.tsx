import { Box, Text, useInput } from "ink"
import { useMemo } from "react"
import { getPriceHistory, getSubscription } from "../../db.ts"
import { useTui } from "../context/app-context.tsx"
import { colors } from "../theme.ts"
import { formatPrice } from "../../price.ts"

export function HistoryScreen() {
  const { state, dispatch } = useTui()

  const selectedId = state.selectedId

  const sub = useMemo(
    () => (selectedId !== null ? getSubscription(selectedId) : undefined),
    [selectedId, state.refreshKey],
  )

  const entries = useMemo(
    () => (selectedId !== null ? getPriceHistory(selectedId) : []),
    [selectedId, state.refreshKey],
  )

  useInput(
    (input, key) => {
      if (input === "q" || key.escape) {
        dispatch({ type: "GO_BACK" })
        return
      }
    },
    { isActive: true },
  )

  if (!sub) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text color={colors.textDim}>No subscription selected</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold>
          Price History:{" "}
        </Text>
        <Text bold color={colors.primary}>
          {sub.name}
        </Text>
      </Box>

      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No price changes recorded yet</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={0}>
          <Box marginBottom={1}>
            <Box width={12}>
              <Text bold underline color={colors.textDim}>Date</Text>
            </Box>
            <Box width={30}>
              <Text bold underline color={colors.textDim}>Change</Text>
            </Box>
          </Box>
          {entries.map((entry) => {
            const date = entry.changedAt.slice(0, 10)
            const oldStr = entry.oldPrice !== null
              ? formatPrice(entry.oldPrice, entry.oldCurrency ?? entry.newCurrency)
              : "—"
            const newStr = formatPrice(entry.newPrice, entry.newCurrency)
            const diff = entry.oldPrice !== null ? entry.newPrice - entry.oldPrice : 0
            const diffColor = diff > 0 ? "red" : diff < 0 ? "green" : "white"
            const diffStr = entry.oldPrice !== null && diff !== 0
              ? ` (${diff > 0 ? "+" : ""}${formatPrice(Math.abs(diff), entry.newCurrency)})`
              : ""

            return (
              <Box key={entry.id} minHeight={1}>
                <Box width={12}>
                  <Text dimColor>{date}</Text>
                </Box>
                {entry.oldCurrency !== null && entry.oldCurrency !== entry.newCurrency ? (
                  <Box width={30}>
                    <Text>
                      {oldStr} ({entry.oldCurrency}) → {newStr} ({entry.newCurrency})
                    </Text>
                  </Box>
                ) : (
                  <Box width={30}>
                    <Text>
                      {oldStr} →{" "}
                      <Text color={diffColor}>
                        {newStr}{diffStr}
                      </Text>
                    </Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          q/Esc back
        </Text>
      </Box>
    </Box>
  )
}
