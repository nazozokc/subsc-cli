/**
 * Edit subscription workflow.
 * Handles both non-interactive (flag-based) and interactive (prompt-based) editing.
 */

import { input, confirm, checkbox, select } from "@inquirer/prompts"
import { consola } from "consola"
import type { Cycle, Status, AddSharedArgs, AddFlags } from "../types.ts"
import { getSubscriptions, getSubscription, updateSubscription, getAllTags, writePriceHistory } from "../db.ts"
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
  validatePaymentMethod,
} from "../prompts.ts"

export async function handleEdit(
  id?: number,
  flags: Partial<AddFlags> = {},
) {
  const all = getSubscriptions()
  if (all.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  const sub = id !== undefined ? getSubscription(id) : await select({
    message: "select subscription to edit",
    loop: false,
    pageSize: 10,
    choices: all.map((s) => ({
      name: `${s.name} — ${formatPrice(s.price, s.currency)}/${s.cycle}${s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : ""}`,
      value: s,
    })),
  })

  if (!sub) {
    if (id !== undefined) consola.error(`Subscription with id ${id} not found`)
    return
  }

  const hasFlags =
    flags.name !== undefined || flags.price !== undefined ||
    flags.currency !== undefined || flags.cycle !== undefined ||
    flags.tags !== undefined || flags.status !== undefined ||
    flags.billingDay !== undefined || flags.notes !== undefined ||
    flags.paymentMethod !== undefined

  if (hasFlags) {
    // Non-interactive: update only flagged fields
    const newData: Partial<AddSharedArgs> = {}
    if (flags.name !== undefined) newData.name = flags.name
    if (flags.price !== undefined) {
      const err = validatePrice(flags.price)
      if (err !== true) {
        consola.error(`Invalid price: ${err}`)
        return
      }
      newData.price = Number(flags.price)
    }
    if (flags.currency !== undefined) {
      if (!isValidCurrency(flags.currency)) {
        consola.error(`Invalid currency: "${flags.currency}"`)
        return
      }
      newData.currency = flags.currency
    }
    if (flags.cycle !== undefined) {
      if (!isValidCycle(flags.cycle)) {
        consola.error(`Invalid cycle: "${flags.cycle}"`)
        return
      }
      newData.cycle = flags.cycle as Cycle
    }
    if (flags.status !== undefined) {
      if (!isValidStatus(flags.status)) {
        consola.error(`Invalid status: "${flags.status}"`)
        return
      }
      newData.status = flags.status as Status
    }
    if (flags.billingDay !== undefined) {
      const trimmed = flags.billingDay.trim()
      newData.billingDay = trimmed ? Number(trimmed) : null
    }
    if (flags.tags !== undefined) {
      newData.tags = flags.tags.split(",").map((t) => t.trim()).filter(Boolean)
    }
    if (flags.notes !== undefined) {
      const trimmed = flags.notes.trim()
      newData.notes = trimmed || null
    }
    if (flags.paymentMethod !== undefined) {
      const trimmed = flags.paymentMethod.trim()
      newData.paymentMethod = trimmed || null
    }
    updateSubscription(sub.id, newData)
    writePriceHistory(sub.id, sub.price, newData.price ?? sub.price, sub.currency, newData.currency ?? sub.currency)
    const updated = getSubscription(sub.id)!
    logAudit("subscription.edit", {
      targetType: "subscription",
      targetId: sub.id,
      details: `${sub.name}: ${Object.keys(newData).join(", ")} changed`,
    })
    consola.success(
      `Updated: ${updated.name} — ${formatPrice(updated.price, updated.currency)}/${updated.cycle}`,
    )
    return
  }

  consola.info(
    `Editing: ${sub.name} — ${formatPrice(sub.price, sub.currency)}/${sub.cycle} [${sub.tags.join(", ") || "no tags"}]`,
  )

  // Interactive: pick fields to change
  const fields = await checkbox({
    message: "Select fields to edit:",
    loop: false,
choices: [
        { name: `name (${sub.name})`, value: "name" },
        { name: `price (${formatPrice(sub.price, sub.currency)})`, value: "price" },
        { name: `currency (${sub.currency})`, value: "currency" },
        { name: `cycle (${sub.cycle})`, value: "cycle" },
        { name: `status (${sub.status})`, value: "status" },
        { name: `billing day (${sub.billingDay ?? "not set"})`, value: "billingDay" },
        { name: `tags (${sub.tags.join(", ") || "none"})`, value: "tags" },
        { name: `notes (${sub.notes ?? "none"})`, value: "notes" },
        { name: `payment method (${sub.paymentMethod ?? "not set"})`, value: "paymentMethod" },
      ],
  })

  if (fields.length === 0) {
    consola.info("Cancelled")
    return
  }

  const newData: Partial<AddSharedArgs> = {}

  if (fields.includes("name")) {
    const name = await input({
      message: "New name:",
      default: sub.name,
      validate: validateName,
    })
    newData.name = name
  }
  if (fields.includes("price")) {
    const price = await input({
      message: "New price:",
      default: String(sub.price),
      validate: validatePrice,
    })
    newData.price = Number(price)
  }
  if (fields.includes("currency")) {
    const currency = await select({
      message: "New currency:",
      choices: CURRENCY_CHOICES,
    })
    newData.currency = currency
  }
  if (fields.includes("cycle")) {
    const cycle = await select({
      message: "New cycle:",
      choices: CYCLE_CHOICES,
    })
    newData.cycle = cycle
  }
  if (fields.includes("status")) {
    const status = await select({
      message: "New status:",
      choices: STATUS_CHOICES,
    })
    newData.status = status
  }
  if (fields.includes("billingDay")) {
    const day = await input({
      message: "New billing day (1-31, empty to clear):",
      default: sub.billingDay ? String(sub.billingDay) : "",
      validate: validateBillingDay,
    })
    newData.billingDay = day.trim() ? Number(day) : null
  }
  if (fields.includes("tags")) {
    const existingTags = getAllTags()
    const tags = await input({
      message:
        "New tags (comma-separated)" +
        (existingTags.length > 0 ? ` (existing: ${existingTags.join(", ")})` : ""),
      default: sub.tags.join(", "),
      validate: validateTags,
    })
    newData.tags = tags.split(",").map((t) => t.trim()).filter(Boolean)
  }
  if (fields.includes("paymentMethod")) {
    const pm = await input({
      message: "New payment method (empty to clear):",
      default: sub.paymentMethod ?? "",
      validate: validatePaymentMethod,
    })
    newData.paymentMethod = pm.trim() || null
  }
  if (fields.includes("notes")) {
    const noteStr = await input({
      message: "New notes (empty to clear):",
      default: sub.notes ?? "",
    })
    newData.notes = noteStr.trim() || null
  }

  const ok = await confirm({ message: "Save changes?", default: true })
  if (!ok) {
    consola.info("Cancelled")
    return
  }

  updateSubscription(sub.id, newData)
  writePriceHistory(sub.id, sub.price, newData.price ?? sub.price, sub.currency, newData.currency ?? sub.currency)
  const updated = getSubscription(sub.id)
  if (!updated) {
    consola.error("Failed to retrieve updated subscription")
    return
  }
  logAudit("subscription.edit", {
    targetType: "subscription",
    targetId: sub.id,
    details: `${sub.name}: ${Object.keys(newData).join(", ")} changed`,
  })
  consola.success(
    `Updated: ${updated.name} — ${formatPrice(updated.price, updated.currency)}/${updated.cycle}`,
  )
}
