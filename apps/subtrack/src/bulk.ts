import { input, confirm, select } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "./error.ts"
import type { SharedArgs, Status } from "./types.ts"
import { getSubscriptions, updateSubscription, deleteSubscription } from "./db.ts"
import { logAudit } from "./audit.ts"
import {
  STATUS_CHOICES,
  isValidStatus,
} from "./prompts.ts"

export type BulkFilters = {
  tag?: string
  status?: string
  name?: string
}

export type BulkOptions = {
  force?: boolean
}

// ── Filter helper ─────────────────────────────────────

function getFilteredSubscriptions(
  filters: BulkFilters,
): SharedArgs[] {
  let list = getSubscriptions()

  if (filters.tag) {
    const tag = filters.tag.trim().toLowerCase()
    list = list.filter((s) => s.tags.some((t) => t.toLowerCase() === tag))
  }

  if (filters.status) {
    const status = filters.status.trim().toLowerCase()
    list = list.filter((s) => s.status === status)
  }

  if (filters.name) {
    const pattern = filters.name.trim().toLowerCase()
    list = list.filter((s) => s.name.toLowerCase().includes(pattern))
  }

  return list
}

// ── Interactive filter prompt ─────────────────────────

async function promptFilters(): Promise<BulkFilters> {
  const filters: BulkFilters = {}

  const tagFilter = await input({
    message: "filter by tag (optional, empty for all)",
  })
  if (tagFilter.trim()) filters.tag = tagFilter.trim()

  const statusFilter = await select({
    message: "filter by status",
    choices: [
      { name: "all statuses", value: "" },
      ...STATUS_CHOICES,
    ],
  })
  if (statusFilter) filters.status = statusFilter

  const nameFilter = await input({
    message: "filter by name pattern (optional, empty for all)",
  })
  if (nameFilter.trim()) filters.name = nameFilter.trim()

  return filters
}

// ── Confirmation prompt ────────────────────────────────

async function confirmAction(
  message: string,
  count: number,
  force?: boolean,
): Promise<boolean> {
  if (count === 0) {
    consola.info("No subscriptions match the filter")
    return false
  }

  if (force) return true

  return await confirm({
    message: `${message} (${count} subscription${count > 1 ? "s" : ""})?`,
    default: false,
  })
}

// ── Command handlers ───────────────────────────────────

export async function handleBulkStatus(
  targetStatus: string,
  filters: BulkFilters,
  options: BulkOptions,
): Promise<void> {
  if (!targetStatus || !isValidStatus(targetStatus)) {
    fail(`Invalid status "${targetStatus}". Must be active, paused, or cancelled`)
    return
  }

  // Interactive mode when no filters given
  if (!filters.tag && !filters.status && !filters.name) {
    filters = await promptFilters()
  }

  const list = getFilteredSubscriptions(filters)

  const ok = await confirmAction(
    `Change status to "${targetStatus}"`,
    list.length,
    options.force,
  )
  if (!ok) { consola.info("Cancelled"); return }

  for (const sub of list) {
    updateSubscription(sub.id, { status: targetStatus as Status })
  }
  logAudit("subscription.bulk_status", {
    details: `${list.length} subscriptions → "${targetStatus}"`,
  })
  consola.success(`Updated ${list.length} subscription${list.length > 1 ? "s" : ""} to "${targetStatus}"`)
}

export async function handleBulkDelete(
  filters: BulkFilters,
  options: BulkOptions,
): Promise<void> {
  // Interactive mode when no filters given
  if (!filters.tag && !filters.status && !filters.name) {
    filters = await promptFilters()
  }

  const list = getFilteredSubscriptions(filters)

  const ok = await confirmAction(
    `Delete`,
    list.length,
    options.force,
  )
  if (!ok) { consola.info("Cancelled"); return }

  for (const sub of list) {
    deleteSubscription(sub.id)
  }
  logAudit("subscription.bulk_delete", {
    details: `${list.length} subscriptions deleted`,
  })
  consola.success(`Deleted ${list.length} subscription${list.length > 1 ? "s" : ""}`)
}

export async function handleBulkTagAdd(
  tag: string,
  filters: BulkFilters,
): Promise<void> {
  if (!tag?.trim()) {
    fail("Tag name is required")
    return
  }

  const tagName = tag.trim()

  // Interactive mode when no filters given
  if (!filters.tag && !filters.status && !filters.name) {
    filters = await promptFilters()
  }

  const list = getFilteredSubscriptions(filters)

  const ok = await confirmAction(
    `Add tag "${tagName}" to`,
    list.length,
    false,
  )
  if (!ok) { consola.info("Cancelled"); return }

  for (const sub of list) {
    const newTags = sub.tags.includes(tagName) ? sub.tags : [...sub.tags, tagName]
    updateSubscription(sub.id, { tags: newTags })
  }
  logAudit("subscription.bulk_tag_add", {
    details: `Tag "${tagName}" added to ${list.length} subscriptions`,
  })
  consola.success(`Added tag "${tagName}" to ${list.length} subscription${list.length > 1 ? "s" : ""}`)
}

export async function handleBulkTagRemove(
  tag: string,
  filters: BulkFilters,
): Promise<void> {
  if (!tag?.trim()) {
    fail("Tag name is required")
    return
  }

  const tagName = tag.trim()

  // Interactive mode when no filters given
  if (!filters.tag && !filters.status && !filters.name) {
    filters = await promptFilters()
  }

  const list = getFilteredSubscriptions(filters)

  const ok = await confirmAction(
    `Remove tag "${tagName}" from`,
    list.length,
    false,
  )
  if (!ok) { consola.info("Cancelled"); return }

  for (const sub of list) {
    const newTags = sub.tags.filter((t: string) => t !== tagName)
    updateSubscription(sub.id, { tags: newTags })
  }
  consola.success(`Removed tag "${tagName}" from ${list.length} subscription${list.length > 1 ? "s" : ""}`)
}
