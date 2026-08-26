import { confirm, select } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "./error.ts"
import { logAudit } from "./audit.ts"
import { getSubscription, getSubscriptions, updateSubscription, writePriceHistory } from "./db.ts"
import type { AddSharedArgs, SharedArgs, Status } from "./types.ts"

async function selectIds(ids: number[] | undefined): Promise<number[]> {
  if (ids?.length) return ids
  const choices = getSubscriptions().map((s) => ({ name: `#${s.id} ${s.name} (${s.status})`, value: s.id }))
  if (!choices.length) return []
  return [await select({ message: "select subscription", choices, pageSize: 15 })]
}

/** Pause the selected subscriptions. */
export async function handlePause(ids?: number[], force = false): Promise<void> { await changeStatus(ids, "paused", force) }
/** Resume the selected subscriptions. */
export async function handleResume(ids?: number[], force = false): Promise<void> { await changeStatus(ids, "active", force) }

async function changeStatus(ids: number[] | undefined, target: Status, force: boolean): Promise<void> {
  const selected = await selectIds(ids)
  const subs = selected.map(getSubscription).filter((s): s is SharedArgs => !!s)
  const pending = subs.filter((s) => s.status !== target && s.status !== "archived")
  if (!pending.length) { consola.info("No subscriptions need changing"); return }
  if (!force && !(await confirm({ message: `Change ${pending.length} subscription(s) to ${target}?`, default: false }))) { consola.info("Cancelled"); return }
  for (const sub of pending) {
    updateSubscription(sub.id, { status: target })
    logAudit(target === "active" ? "subscription.resume" : "subscription.pause", { targetType: "subscription", targetId: sub.id, details: sub.name })
  }
  consola.success(`Updated ${pending.length} subscription(s)`)
}

/** Renew a subscription and record any price change. */
export async function handleRenew(id: number, flags: { price?: string; currency?: string; cycle?: string; contractEnd?: string; planTier?: string; autoRenewal?: boolean }): Promise<void> {
  const sub = getSubscription(id)
  if (!sub) { fail(`Subscription with id ${id} not found`); return }
  const fields: Partial<AddSharedArgs> = { status: "active" }
  if (flags.price !== undefined) { const price = Number(flags.price); if (!Number.isFinite(price) || price < 0) { fail("price must be a non-negative number"); return }; fields.price = price }
  if (flags.currency !== undefined) fields.currency = flags.currency
  if (flags.cycle !== undefined) fields.cycle = flags.cycle as AddSharedArgs["cycle"]
  if (flags.contractEnd !== undefined) fields.contractEnd = flags.contractEnd || null
  if (flags.planTier !== undefined) fields.planTier = flags.planTier || null
  if (flags.autoRenewal !== undefined) fields.autoRenewal = flags.autoRenewal
  updateSubscription(id, fields)
  writePriceHistory(id, sub.price, fields.price ?? sub.price, sub.currency, fields.currency ?? sub.currency)
  logAudit("subscription.renew", { targetType: "subscription", targetId: id, details: `${sub.name} renewed` })
  consola.success(`Renewed: ${sub.name}`)
}
