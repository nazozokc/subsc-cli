/**
 * Core subscription command handlers: list, delete, clone, archive, unarchive, tags.
 * Separated from the more complex add/edit workflows.
 */

import { checkbox, confirm, select } from "@inquirer/prompts"
import { consola } from "consola"
import type { Currency, SharedArgs, AddFlags } from "../types.ts"
import {
  getSubscriptions,
  getSubscription,
  deleteSubscription,
  writeSubscription,
  archiveSubscription,
  unarchiveSubscription,
  tagsSubscription,
  getLlmUsageTotal,
  getLlmUsageTotalByProvider,
} from "../db.ts"
import { formatPrice } from "../price.ts"
import { spreadSubscription, showApiUsage } from "../display.ts"
import { logAudit } from "../audit.ts"

export async function handleList(options: { currency?: string; sort?: string; desc?: boolean; api?: boolean; notes?: boolean; method?: boolean; tags?: string; json?: boolean; limit?: number; offset?: number; includeArchived?: boolean }) {
  // Auto-scan for new suggestions (non-blocking on failure)
  if (!options.json) {
    const { autoScan } = await import("../suggest/scan.ts")
    await autoScan()
    const { showNotificationBanner } = await import("../notifications/banner.ts")
    showNotificationBanner()
  }

  const list = options.tags
    ? tagsSubscription(options.tags.split(",").map((t) => t.trim()))
    : getSubscriptions({ sort: options.sort, desc: options.desc, limit: options.limit, offset: options.offset, includeArchived: options.includeArchived })

  if (options.json) {
    process.stdout.write(JSON.stringify(list, null, 2) + "\n")
    return
  }
  await spreadSubscription(list, options.currency as Currency | undefined, options.notes, options.method)

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
      const sub = getSubscription(id)
      if (!sub) {
        consola.error(`Subscription with id ${id} not found`)
        continue
      }
      deleteSubscription(id)
      logAudit("subscription.delete", {
        targetType: "subscription",
        targetId: id,
        details: sub.name,
      })
      consola.success(`Deleted: ${sub.name}`)
    }
    return
  }

  const all = getSubscriptions()

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
  const sub = getSubscription(id)
  if (!sub) {
    consola.error(`Subscription with id ${id} not found`)
    return
  }

  const newName = flags.name ?? `${sub.name} (copy)`
  const newData = {
    name: newName,
    price: flags.price !== undefined ? Number(flags.price) : sub.price,
    currency: flags.currency ?? sub.currency,
    cycle: (flags.cycle as import("../types.ts").Cycle) ?? sub.cycle,
    tags: flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : [...sub.tags],
    status: sub.status,
    billingDay: sub.billingDay,
    notes: sub.notes,
    paymentMethod: sub.paymentMethod,
  }

  try {
    const newId = writeSubscription(newData)
    logAudit("subscription.clone", {
      targetType: "subscription",
      targetId: newId,
      details: `Cloned from #${id} "${sub.name}" → "${newName}"`,
    })
    consola.success(`Cloned: "${sub.name}" → "${newName}" (id=${newId})`)
  } catch (error) {
    consola.error(`Failed to clone subscription: ${String(error)}`)
  }
}

// ── Archive / Unarchive ──────────────────────────────────

export function handleArchive(id: number) {
  const sub = getSubscription(id)
  if (!sub) {
    consola.error(`Subscription with id ${id} not found`)
    return
  }
  if (sub.status === "archived") {
    consola.info(`"${sub.name}" is already archived`)
    return
  }
  if (archiveSubscription(id)) {
    logAudit("subscription.archive", {
      targetType: "subscription",
      targetId: id,
      details: sub.name,
    })
    consola.success(`Archived: "${sub.name}"`)
  }
}

export function handleUnarchive(id: number) {
  const sub = getSubscription(id)
  if (!sub) {
    consola.error(`Subscription with id ${id} not found`)
    return
  }
  if (sub.status !== "archived") {
    consola.info(`"${sub.name}" is not archived (status: ${sub.status})`)
    return
  }
  if (unarchiveSubscription(id)) {
    logAudit("subscription.unarchive", {
      targetType: "subscription",
      targetId: id,
      details: sub.name,
    })
    consola.success(`Unarchived: "${sub.name}"`)
  }
}
