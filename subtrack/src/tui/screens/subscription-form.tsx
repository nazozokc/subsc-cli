import { Box, Text, useInput } from "ink"
import { TextInput, Select } from "@inkjs/ui"
import { useState, useCallback, useEffect, useRef } from "react"
import { useSetFormActive } from "../context/app-context.tsx"
import type { AddSharedArgs, Cycle, Status } from "../../types.ts"

// ── Types ──────────────────────────────────────────────

type FormData = {
  name: string
  price: string
  currency: string
  cycle: string
  billingDay: string
  status: string
  paymentMethod: string
  tags: string
  notes: string
}

type FormStep =
  | "name" | "price" | "currency" | "cycle"
  | "billingDay" | "status" | "paymentMethod"
  | "tags" | "notes" | "confirm"

type Props = {
  initial?: Partial<FormData>
  onSave: (data: AddSharedArgs) => void
  onCancel: () => void
  title: string
}

const defaultForm = (initial?: Partial<FormData>): FormData => ({
  name: initial?.name ?? "",
  price: initial?.price ?? "",
  currency: initial?.currency ?? "USD",
  cycle: initial?.cycle ?? "monthly",
  billingDay: initial?.billingDay ?? "",
  status: initial?.status ?? "active",
  paymentMethod: initial?.paymentMethod ?? "",
  tags: initial?.tags ?? "",
  notes: initial?.notes ?? "",
})

// ── Option lists ───────────────────────────────────────

const CURRENCIES = [
  { label: "USD ($)", value: "USD" },
  { label: "JPY (¥)", value: "JPY" },
  { label: "EUR (€)", value: "EUR" },
  { label: "GBP (£)", value: "GBP" },
  { label: "CAD (C$)", value: "CAD" },
  { label: "AUD (A$)", value: "AUD" },
  { label: "KRW (₩)", value: "KRW" },
  { label: "CNY (¥)", value: "CNY" },
  { label: "INR (₹)", value: "INR" },
  { label: "MXN (Mex$)", value: "MXN" },
  { label: "BRL (R$)", value: "BRL" },
  { label: "CHF (Fr)", value: "CHF" },
]

const CYCLES = [
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "bi-weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Semi-annual", value: "semi-annual" },
  { label: "Yearly", value: "yearly" },
]

const STATUSES = [
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Cancelled", value: "cancelled" },
]

// ── Steps ──────────────────────────────────────────────

const STEPS: FormStep[] = [
  "name", "price", "currency", "cycle",
  "billingDay", "status", "paymentMethod",
  "tags", "notes", "confirm",
]

const STEP_LABELS: Record<FormStep, string> = {
  name: "Name",
  price: "Price (in smallest unit — e.g. 1490 for ¥1,490)",
  currency: "Currency",
  cycle: "Billing Cycle",
  billingDay: "Billing Day of Month (1-31, optional)",
  status: "Status",
  paymentMethod: "Payment Method (optional — e.g. credit_card, paypal)",
  tags: "Tags (comma-separated, optional)",
  notes: "Notes (optional)",
  confirm: "Confirm",
}

const STEP_SHORT: Record<FormStep, string> = {
  name: "Name",
  price: "Price",
  currency: "Currency",
  cycle: "Cycle",
  billingDay: "Billing Day",
  status: "Status",
  paymentMethod: "Payment",
  tags: "Tags",
  notes: "Notes",
  confirm: "Done",
}

// ── Progress bar ───────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const barWidth = 20
  const filled = Math.round((current / total) * barWidth)
  const empty = barWidth - filled

  return (
    <Box>
      <Text color="cyan">{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(empty)}</Text>
      <Text>
        {" "}
        <Text bold>{current}</Text>
        <Text dimColor>/{total}</Text>
      </Text>
    </Box>
  )
}

// ── Validation ─────────────────────────────────────────

function validateStep(step: FormStep, data: FormData): string | null {
  switch (step) {
    case "name":
      if (!data.name.trim()) return "Name is required"
      break
    case "price":
      if (!data.price.trim()) return "Price is required"
      if (isNaN(Number(data.price)) || Number(data.price) < 0 || !Number.isInteger(Number(data.price))) return "Price must be a non-negative integer"
      break
    case "billingDay":
      if (data.billingDay.trim()) {
        const d = Number(data.billingDay)
        if (isNaN(d) || d < 1 || d > 31 || !Number.isInteger(d)) return "Billing day must be 1-31"
      }
      break
  }
  return null
}

// ── Emitted values panel ──────────────────────────────

function ValuesPanel({ data }: { data: FormData }) {
  const fields: [string, string][] = [
    ["Name", data.name || "—"],
    ["Price", data.price ? `${data.price} ${data.currency}` : "—"],
    ["Cycle", data.cycle],
    ["Status", data.status],
  ]
  if (data.billingDay.trim()) fields.push(["Bill Day", data.billingDay])
  if (data.paymentMethod.trim()) fields.push(["Method", data.paymentMethod.trim()])

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} minWidth={26} flexGrow={0}>
      <Text bold dimColor underline>
        Current Values
      </Text>
      {fields.map(([label, value]) => (
        <Box key={label}>
          <Box width={10}><Text dimColor>{label}:</Text></Box>
          <Text bold wrap="truncate-end">{value}</Text>
        </Box>
      ))}
      {data.tags.trim() && (
        <Box>
          <Box width={10}><Text dimColor>Tags:</Text></Box>
          <Text dimColor wrap="truncate-end">{data.tags}</Text>
        </Box>
      )}
    </Box>
  )
}

// ── Component ─────────────────────────────────────────

export function SubscriptionForm({ initial, onSave, onCancel, title }: Props) {
  const [data, setData] = useState<FormData>(() => defaultForm(initial))
  const [stepIdx, setStepIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const step = STEPS[stepIdx]
  const setFormActive = useSetFormActive()
  const fieldRefs = useRef<Record<FormStep, HTMLInputElement | null>>({} as Record<FormStep, HTMLInputElement | null>)

  // Prevent global key handler conflicts while form is active
  useEffect(() => {
    setFormActive(true)
    return () => setFormActive(false)
  }, [setFormActive])

  const goNext = useCallback(() => {
    const err = validateStep(step, data)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1)
    }
  }, [step, stepIdx, data])

  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setData((d) => ({ ...d, [field]: value }))
      setError(null)
    },
    [],
  )

  // Handle input for the current step
  // Focus input only on the current step to prevent re-renders
  useEffect(() => {
    const fieldRef = fieldRefs.current[step]
    if (fieldRef?.focus) {
      fieldRef.focus()
    }
  }, [step])

  const handleConfirm = useCallback(() => {
    const price = Number(data.price)
    if (isNaN(price) || price < 0 || !Number.isInteger(price)) {
      setError("Price must be a non-negative integer")
      return
    }

    const tags = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    const billingDay = data.billingDay.trim()
      ? Number(data.billingDay)
      : null

    const status = data.status as Status

    onSave({
      name: data.name.trim(),
      price,
      currency: data.currency,
      cycle: data.cycle as Cycle,
      status,
      billingDay,
      paymentMethod: data.paymentMethod.trim() || null,
      notes: data.notes.trim() || null,
      tags,
    })
  }, [data, onSave])

  // ── Render ──

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Title + progress */}
      <Box marginBottom={0} flexDirection="column">
        <Box>
          <Text bold inverse color="cyan">
            {" "}{title}{" "}
          </Text>
        </Box>
        <Box marginTop={0}>
          <ProgressBar current={stepIdx + 1} total={STEPS.length} />
          <Text dimColor>
            {" "}{STEP_SHORT[step] ?? step}
          </Text>
        </Box>
      </Box>

      {/* Step label */}
      <Box>
        <Text bold underline color="cyan">
          {STEP_LABELS[step] ?? step}
        </Text>
      </Box>

      {/* Error */}
      {error && (
        <Box borderStyle="round" borderColor="red" paddingX={1} paddingY={0}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Main content row: input + values panel */}
      <Box flexGrow={1} flexDirection="row" gap={2}>
        {/* Input area */}
        <Box flexGrow={1} flexDirection="column">
          <Box
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            flexGrow={step === "confirm" ? 0 : 1}
          >
            {renderStep(step, data, updateField, goNext)}
          </Box>
        </Box>

        {/* Right sidebar: submitted values (hide on confirm, shown there already) */}
        {step !== "confirm" && (
          <ValuesPanel data={data} />
        )}
      </Box>

      {/* Key hints */}
      <Box paddingLeft={1}>
        <Text dimColor>
          {step === "confirm"
            ? "  y  confirm    n  cancel"
            : "  Enter  next    Esc  cancel"}
        </Text>
      </Box>
    </Box>
  )
}

// ── Step renderer ─────────────────────────────────────

function renderStep(
  step: FormStep,
  data: FormData,
  update: (field: keyof FormData, value: string) => void,
  next: () => void,
) {
  switch (step) {
    // Each case defined below — check STEPS + STEP_LABELS when adding a new step
    case "name":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="e.g. Netflix"
            defaultValue={data.name}
            onChange={(v) => update("name", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "price":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="e.g. 1490"
            defaultValue={data.price}
            onChange={(v) => update("price", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "currency":
      return (
        <Select
          options={CURRENCIES}
          defaultValue={data.currency}
          onChange={(v) => {
            update("currency", v)
            next()
          }}
        />
      )

    case "cycle":
      return (
        <Select
          options={CYCLES}
          defaultValue={data.cycle}
          onChange={(v) => {
            update("cycle", v)
            next()
          }}
        />
      )

    case "billingDay":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="e.g. 15 (leave empty for unknown)"
            defaultValue={data.billingDay}
            onChange={(v) => update("billingDay", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "status":
      return (
        <Select
          options={STATUSES}
          defaultValue={data.status}
          onChange={(v) => {
            update("status", v)
            next()
          }}
        />
      )

    case "paymentMethod":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="e.g. credit_card (optional)"
            defaultValue={data.paymentMethod}
            onChange={(v) => update("paymentMethod", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "tags":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="e.g. video, entertainment (comma-separated)"
            defaultValue={data.tags}
            onChange={(v) => update("tags", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "notes":
      return (
        <Box flexDirection="column">
          <TextInput
            placeholder="Optional notes..."
            defaultValue={data.notes}
            onChange={(v) => update("notes", v)}
            onSubmit={next}
          />
        </Box>
      )

    case "confirm": {
      const price = Number(data.price)
      const billingDay = data.billingDay.trim() ? Number(data.billingDay) : null
      return (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Box width={16}><Text dimColor>Name:</Text></Box>
            <Text bold>{data.name}</Text>
          </Box>
          <Box>
            <Box width={16}><Text dimColor>Price:</Text></Box>
            <Text bold>{isNaN(price) ? "—" : `${price} ${data.currency}`}</Text>
          </Box>
          <Box>
            <Box width={16}><Text dimColor>Cycle:</Text></Box>
            <Text bold>{data.cycle}</Text>
          </Box>
          <Box>
            <Box width={16}><Text dimColor>Status:</Text></Box>
            <Text bold>{data.status}</Text>
          </Box>
          {billingDay && (
            <Box>
              <Box width={16}><Text dimColor>Billing Day:</Text></Box>
              <Text bold>{billingDay}</Text>
            </Box>
          )}
          {data.paymentMethod.trim() && (
            <Box>
              <Box width={16}><Text dimColor>Method:</Text></Box>
              <Text bold>{data.paymentMethod.trim()}</Text>
            </Box>
          )}
          {data.tags.trim() && (
            <Box>
              <Box width={16}><Text dimColor>Tags:</Text></Box>
              <Text bold>{data.tags}</Text>
            </Box>
          )}
          {data.notes.trim() && (
            <Box>
              <Box width={16}><Text dimColor>Notes:</Text></Box>
              <Text bold wrap="truncate-end">{data.notes}</Text>
            </Box>
          )}
        </Box>
      )
    }
  }
}
