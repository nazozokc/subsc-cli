import { select } from "@inquirer/prompts"
import { consola } from "consola"
import pc from "picocolors"
import { loadConfig } from "./config.ts"
import { logAudit } from "./audit.ts"
import { deleteTrial, getSubscription, getSubscriptions, getTrialsExpiringSoon, updateSubscription, writeSubscription } from "./db.ts"
import { handlePause, handleRenew, handleResume } from "./subscription-actions.ts"
import { calcUpcoming } from "./upcoming.ts"
import type { AddSharedArgs, SharedArgs, TrialEntry } from "./types.ts"

export type ReviewOptions = { billDays?: number; contractDays?: number; trialDays?: number; json?: boolean }
type ReviewItem = { kind: "subscription" | "trial"; id: number; name: string; reason: string; sub?: SharedArgs; trial?: TrialEntry }

/** Review subscriptions and trials requiring near-term attention. */
export async function handleReview(options: ReviewOptions = {}): Promise<void> {
  const items = collectItems(options)
  if (options.json) { process.stdout.write(JSON.stringify(items.map(({ sub, trial, ...item }) => ({ ...item, ...(sub ?? trial) })), null, 2) + "\n"); return }
  if (!items.length) { consola.info("Nothing needs review"); return }
  for (const item of items) await reviewItem(item)
}

function collectItems(options: ReviewOptions): ReviewItem[] {
  const billDays = options.billDays ?? 7
  const contractDays = options.contractDays ?? 60
  const trialDays = options.trialDays ?? 30
  const end = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  const items: ReviewItem[] = []
  const upcoming = new Map(calcUpcoming(billDays).map((entry) => [entry.sub.id, entry]))
  for (const sub of getSubscriptions({ status: "active" })) {
    const reasons: string[] = []
    const bill = upcoming.get(sub.id)
    if (bill) reasons.push(`bill due ${bill.nextDate.toISOString().slice(0, 10)}`)
    if (sub.contractEnd && sub.contractEnd <= end(contractDays)) reasons.push(`contract ends ${sub.contractEnd}`)
    if (reasons.length) items.push({ kind: "subscription", id: sub.id, name: sub.name, reason: reasons.join(", "), sub })
  }
  for (const trial of getTrialsExpiringSoon(trialDays)) items.push({ kind: "trial", id: trial.id, name: trial.name, reason: `trial expires ${trial.expiresAt}`, trial })
  return items
}

async function reviewItem(item: ReviewItem): Promise<void> {
  consola.log(`${pc.bold(item.name)} — ${item.reason}`)
  const choices = item.kind === "trial" ? ["keep", "add", "dismiss", "skip"] : ["keep", "pause", "resume", "renew", "cancel", "archive", "skip"]
  const action = await select({ message: "action", choices })
  if (item.sub && action === "pause") await handlePause([item.sub.id], true)
  else if (item.sub && action === "resume") await handleResume([item.sub.id], true)
  else if (item.sub && action === "renew") await handleRenew(item.sub.id, {})
  else if (item.sub && (action === "cancel" || action === "archive")) { const status = action === "cancel" ? "cancelled" : "archived"; updateSubscription(item.sub.id, { status }); logAudit(status === "cancelled" ? "subscription.cancel" : "subscription.archive", { targetType: "subscription", targetId: item.sub.id, details: item.sub.name }) }
  else if (item.trial && action === "add") { writeSubscription({ name: item.trial.name, price: item.trial.price ?? 0, currency: item.trial.currency ?? loadConfig().defaultCurrency, cycle: (item.trial.cycle ?? "monthly") as AddSharedArgs["cycle"], tags: [], notes: item.trial.notes }); deleteTrial(item.trial.id) }
  else if (item.trial && action === "dismiss") deleteTrial(item.trial.id)
}
