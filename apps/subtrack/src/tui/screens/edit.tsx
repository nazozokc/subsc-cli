import { useMemo, useState } from "react"
import { Box, Text } from "ink"
import { SubscriptionForm } from "./subscription-form.tsx"
import { getSubscription, updateSubscription } from "../../db.ts"
import { useTui } from "../context/app-context.tsx"
import type { AddSharedArgs } from "../../types.ts"
import { colors } from "../theme.ts"

export function EditScreen() {
  const { state, dispatch } = useTui()
  const [error, setError] = useState<string | null>(null)

  const sub = useMemo(
    () => (state.selectedId ? getSubscription(state.selectedId) : undefined),
    [state.selectedId],
  )

  if (!sub) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={colors.textDim}>Subscription not found</Text>
      </Box>
    )
  }

  const handleSave = (data: AddSharedArgs) => {
    try {
      updateSubscription(sub.id, data)
      dispatch({ type: "GO_BACK" })
      dispatch({ type: "INCREMENT_REFRESH_KEY" })
      dispatch({
        type: "SET_TOAST",
        toast: { message: `Updated ${data.name}`, type: "success" },
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
        title={`Edit: ${sub.name}`}
        initial={{
          name: sub.name,
          price: String(sub.price),
          currency: sub.currency,
          cycle: sub.cycle,
          billingDay: sub.billingDay ? String(sub.billingDay) : "",
          status: sub.status,
          paymentMethod: sub.paymentMethod ?? "",
          tags: sub.tags.join(", "),
          notes: sub.notes ?? "",
        }}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </Box>
  )
}
