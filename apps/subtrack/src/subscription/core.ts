/**
 * Core subscription command handlers: list, delete, clone, archive, unarchive, tags.
 * Separated from the more complex add/edit workflows.
 */

import { checkbox, confirm, select } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "../error.ts"
import { loadConfig } from "../config.ts"
import type { Currency, SharedArgs, AddFlags } from "../types.ts"
import {
  tagsSubscription,
  getLlmUsageTotal,
  getLlmUsageTotalByProvider,
} from "../db.ts"
import { subscriptionRepository } from "../application/repositories.ts"
import { formatPrice } from "../price.ts"
import { spreadSubscription, showApiUsage } from "../display.ts"
import { logAudit } from "../audit.ts"
import { runPreCommandHooks } from "../pre-command.ts"

export async function handleList(options: {
  currency?: string
  sort?: string
  desc?: boolean
  api?: boolean
  notes?: boolean
  method?: boolean
  tags?: string
  json?: boolean
  limit?: number
  offset?: number
  includeArchived?: boolean
  showContract?: boolean
  showVendor?: boolean
  status?: string
  minPrice?: number
  maxPrice?: number
}) {
  // Auto-scan for new suggestions (non-blocking on failure)
  await runPreCommandHooks(options)

  const list = options.tags
    ? tagsSubscription(options.tags.split(",").map((t) => t.trim()))
    : subscriptionRepository.list({
        sort: options.sort,
        desc: options.desc,
        limit: options.limit,
        offset: options.offset,
        includeArchived: options.includeArchived,
        status: options.status,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
      })

  if (options.json) {
    process.stdout.write(JSON.stringify(list, null, 2) + "\n")
    return
  }
  // Flag > config > default (off)
  const showNotes = options.notes ?? loadConfig().listShowNotes === "on"
  const showMethod = options.method ?? loadConfig().listShowMethod === "on"
  await spreadSubscription(list, options.currency as Currency | undefined, showNotes, showMethod, options.showContract, options.showVendor)

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

export async function handleDelete(ids?: number[]) {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      const sub = subscriptionRepository.get(id)
      if (!sub) {
        fail(`Subscription with id ${id} not found`)
        continue
      }
      subscriptionRepository.remove(id)
      logAudit("subscription.delete", {
        targetType: "subscription",
        targetId: id,
        details: sub.name,
      })
      consola.success(`Deleted: ${sub.name}`)
    }
    return
  }

  const all = subscriptionRepository.list()

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
    subscriptionRepository.remove(sub.id)
    logAudit("subscription.delete", {
      targetType: "subscription",
      targetId: sub.id,
      details: sub.name,
    })
    consola.success(`Deleted: ${sub.name}`)
  }
}

export async function handleTags(taglist: string[]) {
  const list = tagsSubscription(taglist)
  await spreadSubscription(list)
}

// ── Clone ──────────────────────────────────────────────

export async function handleClone(id: number, flags: Partial<AddFlags> = {}): Promise<void> {
  const sub = subscriptionRepository.get(id)
  if (!sub) {
    fail(`Subscription with id ${id} not found`)
    return
  }

  const newName = flags.name ?? `${sub.name} (copy)`
  let price = sub.price
  if (flags.price !== undefined) {
    const parsed = Number(flags.price)
    if (!isFinite(parsed) || isNaN(parsed)) {
      fail(`Invalid price: "${flags.price}"`)
      return
    }
    price = parsed
  }
  const newData = {
    name: newName,
    price,
    currency: flags.currency ?? sub.currency,
    cycle: (flags.cycle as import("../types.ts").Cycle) ?? sub.cycle,
    tags: flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : [...sub.tags],
    status: sub.status,
    billingDay: sub.billingDay,
    notes: sub.notes,
    paymentMethod: sub.paymentMethod,
  }

  try {
    const newId = subscriptionRepository.add(newData)
    logAudit("subscription.clone", {
      targetType: "subscription",
      targetId: newId,
      details: `Cloned from #${id} "${sub.name}" → "${newName}"`,
    })
    consola.success(`Cloned: "${sub.name}" → "${newName}" (id=${newId})`)
  } catch (error) {
    fail(`Failed to clone subscription: ${String(error)}`)
  }
}

// ── Archive / Unarchive ──────────────────────────────────

export function handleArchive(id: number) {
  const sub = subscriptionRepository.get(id)
  if (!sub) {
    fail(`Subscription with id ${id} not found`)
    return
  }
  if (sub.status === "archived") {
    consola.info(`"${sub.name}" is already archived`)
    return
  }
  if (subscriptionRepository.archive(id)) {
    logAudit("subscription.archive", {
      targetType: "subscription",
      targetId: id,
      details: sub.name,
    })
    consola.success(`Archived: "${sub.name}"`)
  }
}

export function handleUnarchive(id: number) {
  const sub = subscriptionRepository.get(id)
  if (!sub) {
    fail(`Subscription with id ${id} not found`)
    return
  }
  if (sub.status !== "archived") {
    consola.info(`"${sub.name}" is not archived (status: ${sub.status})`)
    return
  }
  if (subscriptionRepository.unarchive(id)) {
    logAudit("subscription.unarchive", {
      targetType: "subscription",
      targetId: id,
      details: sub.name,
    })
    consola.success(`Unarchived: "${sub.name}"`)
  }
}
