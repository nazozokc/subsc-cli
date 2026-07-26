import { Box, Text } from "ink"
import { useMemo } from "react"
import { useTui } from "../../context/app-context.tsx"
import { getLlmUsage } from "../../../db.ts"
import { colors } from "../../theme.ts"

export function UsageTab() {
  const { state } = useTui()
  const entries = useMemo(() => getLlmUsage({ limit: 50 }), [state.refreshKey])
  const total = entries.reduce((s, e) => s + e.cost, 0)

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>LLM API Usage</Text>
        <Text color={colors.textDim}>  ({entries.length} entries)</Text>
      </Box>
      {entries.length === 0 ? (
        <Text color={colors.textDim}>No usage entries</Text>
      ) : (
        <>
          {entries.map((e) => (
            <Box key={e.id}>
              <Box width={14}>
                <Text bold wrap="truncate-end">{e.provider}</Text>
              </Box>
              <Box width={20}>
                <Text color={colors.textDim} wrap="truncate-end">{e.model}</Text>
              </Box>
              <Box width={12}>
                <Text>{e.date}</Text>
              </Box>
              <Box width={10}>
                <Text>${(e.cost / 100).toFixed(4)}</Text>
              </Box>
              {e.description && (
                <Text color={colors.textDim} wrap="truncate-end">{e.description}</Text>
              )}
            </Box>
          ))}
          <Box marginTop={1}>
            <Text bold color={colors.warning}>
              Total: ${(total / 100).toFixed(2)}
            </Text>
          </Box>
        </>
      )}
    </Box>
  )
}
