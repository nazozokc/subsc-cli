/**
 * Add subscription workflow.
 * Separated from core.ts because of its complex interactive prompt logic.
 */

import { input, confirm, select } from "@inquirer/prompts"
import { consola } from "consola"
import type { AddFlags, Cycle, Status } from "../types.ts"
import { getSubscriptions, writeSubscription, getAllTags } from "../db.ts"
import { formatPrice } from "../price.ts"
import { logAudit } from "../audit.ts"
import {
  CURRENCY_CHOICES,
  CYCLE_CHOICES,
  STATUS_CHOICES,
  isValidCurrency,
  isValidCycle,
  isValidStatus,
  validateName,
  validatePrice,
  validateTags,
  validateBillingDay,
  validateNotes,
  validatePaymentMethod,
  promptString,
  promptSelect,
} from "../prompts.ts"

// ── Add workflow ────────────────────────────────────────

export async function resolveAddOptions(flags: AddFlags): Promise<{
  name: string
  price: number
  currency: string
  cycle: Cycle
  tags: string[]
  status: Status
  billingDay: number | null
  notes: string | null
  paymentMethod: string | null
} | null> {
  const nameRes = await promptString(
    flags.name,
    "subscription name",
    validateName,
  )
  if (!nameRes) return null

  const priceRes = await promptString(
    flags.price,
    "monthly payment amount",
    validatePrice,
  )
  if (!priceRes) return null

  const currencyRes = await promptSelect(
    flags.currency,
    "currency",
    CURRENCY_CHOICES,
    isValidCurrency,
  )
  if (!currencyRes) return null

  const cycleRes = await promptSelect(
    flags.cycle,
    "cycle",
    CYCLE_CHOICES,
    isValidCycle,
  )
  if (!cycleRes) return null

  // tags: special case — hint from existing tags, no flag-fallback validation needed
  let tagsStr = flags.tags
  let prompted =
    nameRes.prompted ||
    priceRes.prompted ||
    currencyRes.prompted ||
    cycleRes.prompted

  if (tagsStr === undefined) {
    if (prompted) {
      const existingTags = getAllTags()
      tagsStr = await input({
        message:
          "tags" +
          (existingTags.length > 0
            ? ` (existing: ${existingTags.join(", ")})`
            : ""),
        validate: validateTags,
      })
    } else {
      tagsStr = ""
    }
  }

  // notes: optional free text
  let notes: string | null = null
  const notesStr = flags.notes
  if (notesStr !== undefined) {
    const trimmed = notesStr.trim()
    if (trimmed) {
      const valid = validateNotes(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      notes = trimmed
    }
  } else if (prompted) {
    const noteStr = await input({
      message: "notes (optional, max 500 chars)",
      validate: validateNotes,
    })
    if (noteStr.trim()) notes = noteStr.trim()
  }

  // paymentMethod: optional free text
  let paymentMethod: string | null = null
  const paymentMethodStr = flags.paymentMethod
  if (paymentMethodStr !== undefined) {
    const trimmed = paymentMethodStr.trim()
    if (trimmed) {
      const valid = validatePaymentMethod(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      paymentMethod = trimmed
    }
  } else if (prompted) {
    const pmStr = await input({
      message: "payment method (optional, e.g. credit_card, paypal)",
      validate: validatePaymentMethod,
    })
    if (pmStr.trim()) paymentMethod = pmStr.trim()
  }

  // billingDay: optional, 1-31
  let billingDay: number | null = null
  const billingDayStr = flags.billingDay
  if (billingDayStr !== undefined) {
    const trimmed = billingDayStr.trim()
    if (trimmed) {
      const valid = validateBillingDay(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      billingDay = Number(trimmed)
    }
  } else if (prompted) {
    const dayStr = await input({
      message: "billing day (1-31, optional)",
      validate: validateBillingDay,
    })
    if (dayStr.trim()) billingDay = Number(dayStr)
  }

  // status
  const statusRes = await promptSelect(
    flags.status,
    "status",
    STATUS_CHOICES,
    isValidStatus,
  )
  if (!statusRes) return null

  const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
  const price = Number(priceRes.value)
  const name = nameRes.value.trim()
  const currency = currencyRes.value
  const cycle = cycleRes.value
  const status = statusRes.value
  prompted = prompted || statusRes.prompted

  if (prompted) {
    const extra = status !== "active" ? `, status: ${status}` : ""
    const ok = await confirm({
      message: `Save "${name}" (${formatPrice(price, currency)}, ${cycle}${extra})?`,
      default: true,
    })
    if (!ok) {
      consola.info("Cancelled")
      return null
    }
  }

  return { name, price, currency, cycle: cycle as Cycle, tags, status: status as Status, billingDay, notes, paymentMethod }
}

export async function handleAdd(flags: AddFlags) {
  const result = await resolveAddOptions(flags)
  if (!result) return
  try {
    const id = writeSubscription(result)
    logAudit("subscription.add", {
      targetType: "subscription",
      targetId: id,
      details: `${result.name} — ${formatPrice(result.price, result.currency)}/${result.cycle}`,
    })
    consola.success(`Added subscription: ${result.name}`)
  } catch (error) {
    consola.error(`Failed to add subscription: ${String(error)}`)
  }
}
