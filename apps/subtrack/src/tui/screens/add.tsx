import { Box, Text } from "ink"
import { SubscriptionForm } from "./subscription-form.tsx"
import { writeSubscription } from "../../db.ts"
import { useTui } from "../context/app-context.tsx"
import { useState } from "react"
import type { AddSharedArgs } from "../../types.ts"
import { colors } from "../theme.ts"

export function AddScreen() {
  const { dispatch } = useTui()
  const [error, setError] = useState<string | null>(null)

  const handleSave = (data: AddSharedArgs) => {
    try {
      writeSubscription(data)
      dispatch({ type: "GO_BACK" })
      dispatch({ type: "SET_LIST_INDEX", index: 0 })
      dispatch({
        type: "SET_TOAST",
        toast: { message: `Added ${data.name}`, type: "success" },
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCancel = () => {
    dispatch({ type: "GO_BACK" })
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {error && <Box paddingX={1}><Text color={colors.danger}>{error}</Text></Box>}
      <SubscriptionForm
        title="Add Subscription"
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </Box>
  )
}
