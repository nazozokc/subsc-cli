import { input, confirm, checkbox, select } from "@inquirer/prompts"
import { consola } from "consola"
import type { Currency, Cycle, Status, SharedArgs, AddSharedArgs, AddFlags, ListFlags } from "./types.ts"
import {
  getSubscriptions,
  getSubscription,
  writeSubscription,
  updateSubscription,
  deleteSubscription,
  getAllTags,
  tagsSubscription,
  getLlmUsageTotal,
  getLlmUsageTotalByProvider,
  writePriceHistory,
} from "./db.ts"
import { formatPrice } from "./price.ts"
import {
  spreadSubscription,
  showApiUsage,
} from "./display.ts"
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
  validateDateString,
  validateVendorName,
  validateVendorUrl,
  validatePlanTier,
  validateDiscountValue,
  validateDiscountType,
  promptString,
  promptSelect,
} from "./prompts.ts"

// ── Add workflow ────────────────────────────────────────

async function resolveAddOptions(flags: AddFlags) {
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
    // empty flag = no notes (keep null)
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

  // contractStart: optional date
  let contractStart: string | null = null
  if (flags.contractStart !== undefined) {
    const trimmed = flags.contractStart.trim()
    if (trimmed) {
      const valid = validateDateString(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      contractStart = trimmed
    }
  } else if (prompted) {
    const cs = await input({
      message: "contract start date (YYYY-MM-DD, optional)",
      validate: validateDateString,
    })
    if (cs.trim()) contractStart = cs.trim()
  }

  // contractEnd: optional date
  let contractEnd: string | null = null
  if (flags.contractEnd !== undefined) {
    const trimmed = flags.contractEnd.trim()
    if (trimmed) {
      const valid = validateDateString(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      contractEnd = trimmed
    }
  } else if (prompted) {
    const ce = await input({
      message: "contract end date (YYYY-MM-DD, optional, leave empty for ongoing)",
      validate: validateDateString,
    })
    if (ce.trim()) contractEnd = ce.trim()
  }

  // autoRenewal: boolean
  let autoRenewal = true
  if (flags.autoRenewal !== undefined) {
    const val = flags.autoRenewal.toString().toLowerCase()
    if (val === "false" || val === "0" || val === "no") autoRenewal = false
  } else if (prompted) {
    autoRenewal = await confirm({
      message: "auto-renewal enabled?",
      default: true,
    })
  }

  // vendorName: optional
  let vendorName: string | null = null
  if (flags.vendorName !== undefined) {
    const trimmed = flags.vendorName.trim()
    if (trimmed) {
      const valid = validateVendorName(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      vendorName = trimmed
    }
  } else if (prompted) {
    const vn = await input({
      message: "vendor/provider name (optional)",
      validate: validateVendorName,
    })
    if (vn.trim()) vendorName = vn.trim()
  }

  // vendorUrl: optional
  let vendorUrl: string | null = null
  if (flags.vendorUrl !== undefined) {
    const trimmed = flags.vendorUrl.trim()
    if (trimmed) {
      const valid = validateVendorUrl(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      vendorUrl = trimmed
    }
  } else if (prompted) {
    const vu = await input({
      message: "vendor URL/website (optional)",
      validate: validateVendorUrl,
    })
    if (vu.trim()) vendorUrl = vu.trim()
  }

  // planTier: optional
  let planTier: string | null = null
  if (flags.planTier !== undefined) {
    const trimmed = flags.planTier.trim()
    if (trimmed) {
      const valid = validatePlanTier(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      planTier = trimmed
    }
  } else if (prompted) {
    const pt = await input({
      message: "plan tier (e.g. Pro, Business, optional)",
      validate: validatePlanTier,
    })
    if (pt.trim()) planTier = pt.trim()
  }

  // discountAmount & discountType: optional
  let discountAmount: number | null = null
  let discountType: "percentage" | "fixed" | null = null
  if (flags.discountAmount !== undefined) {
    const trimmed = flags.discountAmount.trim()
    if (trimmed) {
      const valid = validateDiscountValue(trimmed)
      if (valid !== true) { consola.error(valid); return null }
      discountAmount = Number(trimmed)
    }
  } else if (prompted) {
    const da = await input({
      message: "discount amount (optional, e.g. 20 for 20% or $20 off)",
      validate: validateDiscountValue,
    })
    if (da.trim()) {
      discountAmount = Number(da)
      // Ask for type if amount was entered
      const dt = await input({
        message: "discount type (percentage or fixed, optional)",
        validate: validateDiscountType,
      })
      if (dt.trim() && (dt.trim() === "percentage" || dt.trim() === "fixed")) {
        discountType = dt.trim() as "percentage" | "fixed"
      }
    }
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

  return { name, price, currency, cycle, tags, status, billingDay, notes, paymentMethod, contractStart, contractEnd, autoRenewal, vendorName, vendorUrl, planTier, discountAmount, discountType }
}

// ── Command handlers ────────────────────────────────────

export async function handleList(options: ListFlags) {
  // Determine status filter
  let statusFilter: string | undefined
  if (options.all) {
    statusFilter = "all"
  } else if (options.status) {
    statusFilter = options.status
  } else if (options.tags) {
    // tagsSubscription doesn't filter by status — we'll filter the result
    statusFilter = undefined
  } else {
    // Default: active + paused only
    statusFilter = "active,paused"
  }

  let list = options.tags
    ? tagsSubscription(options.tags.split(",").map((t) => t.trim()))
    : getSubscriptions(options.sort, options.desc, statusFilter)

  // Apply status filter for tagsSubscription path (tagsSubscription doesn't support status)
  if (options.tags && statusFilter && statusFilter !== "all") {
    const statuses = statusFilter.split(",").map((s) => s.trim().toLowerCase())
    list = list.filter((s) => statuses.includes(s.status))
  }

  // Apply price range filters
  if (options.minPrice !== undefined) {
    list = list.filter((s) => s.price >= options.minPrice!)
  }
  if (options.maxPrice !== undefined) {
    list = list.filter((s) => s.price <= options.maxPrice!)
  }

  // Apply limit
  if (options.limit !== undefined && options.limit > 0) {
    list = list.slice(0, options.limit)
  }

  // JSON output
  if (options.json) {
    const data = list.map((sub) => ({
      id: sub.id,
      name: sub.name,
      price: sub.price,
      currency: sub.currency,
      cycle: sub.cycle,
      status: sub.status,
      tags: sub.tags,
      billingDay: sub.billingDay,
      notes: sub.notes,
      paymentMethod: sub.paymentMethod,
      contractStart: sub.contractStart,
      contractEnd: sub.contractEnd,
      autoRenewal: sub.autoRenewal,
      vendorName: sub.vendorName,
      vendorUrl: sub.vendorUrl,
      planTier: sub.planTier,
      discountAmount: sub.discountAmount,
      discountType: sub.discountType,
      createdAt: sub.createdAt,
    }))
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }

  await spreadSubscription(list, options.currency as Currency | undefined, options.notes, options.method, options.showContract, options.showVendor)

  if (options.api) {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const from = `${y}-${String(m).padStart(2, "0")}-01`
    const to = `${y}-${String(m).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    const monthLabel = `${now.toLocaleString("en-US", { month: "long" })} ${y}`

    const total = getLlmUsageTotal(from, to)
    const byProvider = getLlmUsageTotalByProvider(from, to)
    showApiUsage(total, byProvider, monthLabel)
  }
}

export async function handleAdd(flags: AddFlags) {
  const result = await resolveAddOptions(flags)
  if (!result) return
  try {
    writeSubscription(result)
    consola.success(`Added subscription: ${result.name}`)
  } catch (error) {
    consola.error(`Failed to add subscription: ${String(error)}`)
  }
}

export async function handleDelete(ids?: number[]) {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      const sub = getSubscription(id)
      if (!sub) {
        consola.error(`Subscription with id ${id} not found`)
        continue
      }
      deleteSubscription(id)
      consola.success(`Deleted: ${sub.name}`)
    }
    return
  }

  const all = getSubscriptions(undefined, undefined, "all")

  if (all.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  const selected = await checkbox({
    message: "select subscriptions to delete",
    choices: all.map((sub) => ({
      name: `${sub.name} — ${formatPrice(sub.price, sub.currency)}/${sub.cycle}${sub.tags.length > 0 ? ` [${sub.tags.join(", ")}]` : ""}`,
      value: sub,
    })),
  })

  if (selected.length === 0) {
    consola.info("Cancelled")
    return
  }

  const names = selected.map((s) => s.name).join(", ")
  const ok = await confirm({
    message: `Delete ${selected.length} subscription${selected.length > 1 ? "s" : ""}? (${names})`,
    default: false,
  })

  if (!ok) {
    consola.info("Cancelled")
    return
  }

  for (const sub of selected) {
    deleteSubscription(sub.id)
    consola.success(`Deleted: ${sub.name}`)
  }
}

export async function handleTags(taglist: string[], options: { json?: boolean } = {}) {
  const list = tagsSubscription(taglist)

  if (options.json) {
    const data = list.map((sub) => ({
      id: sub.id,
      name: sub.name,
      price: sub.price,
      currency: sub.currency,
      cycle: sub.cycle,
      status: sub.status,
      tags: sub.tags,
      billingDay: sub.billingDay,
      notes: sub.notes,
      paymentMethod: sub.paymentMethod,
      contractStart: sub.contractStart,
      contractEnd: sub.contractEnd,
      autoRenewal: sub.autoRenewal,
      vendorName: sub.vendorName,
      vendorUrl: sub.vendorUrl,
      planTier: sub.planTier,
      discountAmount: sub.discountAmount,
      discountType: sub.discountType,
      createdAt: sub.createdAt,
    }))
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }

  await spreadSubscription(list)
}

// ── Edit workflow ────────────────────────────────────────

export async function handleEdit(
  id?: number,
  flags: Partial<AddFlags> = {},
) {
  const all = getSubscriptions(undefined, undefined, "all")
  if (all.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  let sub: SharedArgs | undefined
  if (id !== undefined) {
    sub = getSubscription(id)
    if (!sub) {
      consola.error(`Subscription with id ${id} not found`)
      return
    }
  } else {
    const picked = await select({
      message: "select subscription to edit",
      loop: false,
      pageSize: 10,
      choices: all.map((s) => ({
        name: `${s.name} — ${formatPrice(s.price, s.currency)}/${s.cycle}${s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : ""}`,
        value: s,
      })),
    })
    sub = picked
  }

  const hasFlags =
    flags.name !== undefined || flags.price !== undefined ||
    flags.currency !== undefined || flags.cycle !== undefined ||
    flags.tags !== undefined || flags.status !== undefined ||
    flags.billingDay !== undefined ||
    flags.paymentMethod !== undefined ||
    flags.contractStart !== undefined || flags.contractEnd !== undefined ||
    flags.autoRenewal !== undefined ||
    flags.vendorName !== undefined || flags.vendorUrl !== undefined ||
    flags.planTier !== undefined ||
    flags.discountAmount !== undefined || flags.discountType !== undefined

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
    if (flags.currency !== undefined) newData.currency = flags.currency
    if (flags.cycle !== undefined) newData.cycle = flags.cycle as Cycle
    if (flags.status !== undefined) newData.status = flags.status as Status
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
    if (flags.contractStart !== undefined) {
      const trimmed = flags.contractStart.trim()
      newData.contractStart = trimmed || null
    }
    if (flags.contractEnd !== undefined) {
      const trimmed = flags.contractEnd.trim()
      newData.contractEnd = trimmed || null
    }
    if (flags.autoRenewal !== undefined) {
      const val = flags.autoRenewal.toString().toLowerCase()
      newData.autoRenewal = val === "false" || val === "0" || val === "no" ? false : true
    }
    if (flags.vendorName !== undefined) {
      const trimmed = flags.vendorName.trim()
      newData.vendorName = trimmed || null
    }
    if (flags.vendorUrl !== undefined) {
      const trimmed = flags.vendorUrl.trim()
      newData.vendorUrl = trimmed || null
    }
    if (flags.planTier !== undefined) {
      const trimmed = flags.planTier.trim()
      newData.planTier = trimmed || null
    }
    if (flags.discountAmount !== undefined) {
      const trimmed = flags.discountAmount.trim()
      newData.discountAmount = trimmed ? Number(trimmed) : null
    }
    if (flags.discountType !== undefined) {
      const trimmed = flags.discountType.trim()
      newData.discountType = (trimmed as "percentage" | "fixed") || null
    }
    updateSubscription(sub.id, newData)
    writePriceHistory(sub.id, sub.price, newData.price ?? sub.price, sub.currency, newData.currency ?? sub.currency)
    const updated = getSubscription(sub.id)!
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
      { name: `payment method (${sub.paymentMethod ?? "not set"})`, value: "paymentMethod" },
      { name: `contract start (${sub.contractStart ?? "not set"})`, value: "contractStart" },
      { name: `contract end (${sub.contractEnd ?? "not set"})`, value: "contractEnd" },
      { name: `auto-renewal (${sub.autoRenewal ? "yes" : "no"})`, value: "autoRenewal" },
      { name: `vendor (${sub.vendorName ?? "not set"})`, value: "vendorName" },
      { name: `vendor URL (${sub.vendorUrl ?? "not set"})`, value: "vendorUrl" },
      { name: `plan tier (${sub.planTier ?? "not set"})`, value: "planTier" },
      { name: `discount (${sub.discountAmount != null ? `${sub.discountAmount}${sub.discountType === "percentage" ? "%" : ""}` : "not set"})`, value: "discount" },
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

  if (fields.includes("contractStart")) {
    const cs = await input({
      message: "New contract start date (YYYY-MM-DD, empty to clear):",
      default: sub.contractStart ?? "",
      validate: validateDateString,
    })
    newData.contractStart = cs.trim() || null
  }
  if (fields.includes("contractEnd")) {
    const ce = await input({
      message: "New contract end date (YYYY-MM-DD, empty to clear):",
      default: sub.contractEnd ?? "",
      validate: validateDateString,
    })
    newData.contractEnd = ce.trim() || null
  }
  if (fields.includes("autoRenewal")) {
    const ar = await confirm({
      message: "Auto-renewal enabled?",
      default: sub.autoRenewal,
    })
    newData.autoRenewal = ar
  }
  if (fields.includes("vendorName")) {
    const vn = await input({
      message: "New vendor name (empty to clear):",
      default: sub.vendorName ?? "",
      validate: validateVendorName,
    })
    newData.vendorName = vn.trim() || null
  }
  if (fields.includes("vendorUrl")) {
    const vu = await input({
      message: "New vendor URL (empty to clear):",
      default: sub.vendorUrl ?? "",
      validate: validateVendorUrl,
    })
    newData.vendorUrl = vu.trim() || null
  }
  if (fields.includes("planTier")) {
    const pt = await input({
      message: "New plan tier (empty to clear):",
      default: sub.planTier ?? "",
      validate: validatePlanTier,
    })
    newData.planTier = pt.trim() || null
  }
  if (fields.includes("discount")) {
    const da = await input({
      message: "New discount amount (empty to clear):",
      default: sub.discountAmount != null ? String(sub.discountAmount) : "",
      validate: validateDiscountValue,
    })
    newData.discountAmount = da.trim() ? Number(da) : null

    if (newData.discountAmount != null) {
      const dt = await input({
        message: "New discount type (percentage or fixed, empty to clear):",
        default: sub.discountType ?? "",
        validate: validateDiscountType,
      })
      newData.discountType = (dt.trim() as "percentage" | "fixed") || null
    } else {
      newData.discountType = null
    }
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
  consola.success(
    `Updated: ${updated.name} — ${formatPrice(updated.price, updated.currency)}/${updated.cycle}`,
  )
}
