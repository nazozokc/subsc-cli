import { Box, Text, useInput } from "ink"
import { useMemo, useState, useEffect } from "react"
import { getSubscription, deleteSubscription } from "../../db.ts"
import { useTui, useSetFormActive } from "../context/app-context.tsx"
import { formatPrice } from "../../price.ts"

export function DeleteScreen() {
  const { state, dispatch } = useTui()
  const [error, setError] = useState<string | null>(null)
  const setFormActive = useSetFormActive()

  useEffect(() => {
    setFormActive(true)
    return () => setFormActive(false)
  }, [setFormActive])

  const sub = useMemo(
    () => (state.selectedId ? getSubscription(state.selectedId) : undefined),
    [state.selectedId],
  )

  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      if (sub) {
        try {
          deleteSubscription(sub.id)
          dispatch({ type: "INCREMENT_REFRESH_KEY" })
          dispatch({
            type: "SET_TOAST",
            toast: { message: `Deleted ${sub.name}`, type: "success" },
          })
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e))
          return
        }
      }
      dispatch({ type: "GO_BACK" })
    } else if (input === "n" || input === "N" || key.escape) {
      dispatch({ type: "GO_BACK" })
    }
  })

  if (!sub) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <Text dimColor>Subscription not found</Text>
      </Box>
    )
  }

  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
      {error && (
        <Box marginBottom={1} borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Warning header */}
      <Box marginBottom={1} borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
        <Box flexDirection="column" alignItems="center">
          <Text bold color="red" inverse>
            {" Delete Subscription "}
          </Text>
          <Text dimColor>This action cannot be undone</Text>
        </Box>
      </Box>

      {/* Subscription details */}
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Box>
          <Box width={14}><Text dimColor>Name:</Text></Box>
          <Text bold>{sub.name}</Text>
        </Box>
        <Box>
          <Box width={14}><Text dimColor>Price:</Text></Box>
          <Text bold color="yellow">{formatPrice(sub.price, sub.currency)}</Text>
        </Box>
        <Box>
          <Box width={14}><Text dimColor>Cycle:</Text></Box>
          <Text bold>{sub.cycle}</Text>
        </Box>
        <Box>
          <Box width={14}><Text dimColor>Status:</Text></Box>
          <Text bold>{sub.status}</Text>
        </Box>
        {sub.tags.length > 0 && (
          <Box>
            <Box width={14}><Text dimColor>Tags:</Text></Box>
            <Text bold>{sub.tags.join(", ")}</Text>
          </Box>
        )}
      </Box>

      {/* Confirmation */}
      <Box marginTop={1} paddingX={2} paddingY={1} borderStyle="round" borderColor="yellow">
        <Text>
          Are you sure?{"  "}
          <Text bold color="green" inverse> y </Text>
          {"  to delete  "}
          <Text bold color="red" inverse> n </Text>
          {"  to cancel"}
        </Text>
      </Box>
    </Box>
  )
}
