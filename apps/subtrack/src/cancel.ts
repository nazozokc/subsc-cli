import { confirm } from "@inquirer/prompts"
import { consola } from "consola"
import pc from "picocolors"
import { mkdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { getSubscription, updateSubscription } from "./db.ts"
import { logAudit } from "./audit.ts"
import { fail } from "./error.ts"
import { loadConfig } from "./config.ts"
import { formatPrice } from "./price.ts"
import { calculateNextBilling } from "./upcoming.ts"
import { today, formatDate, formatShortDate } from "./date-utils.ts"
import { exportCsv } from "./export.ts"
import { safeOutputPath } from "./path-utils.ts"
import type { AddSharedArgs } from "./types.ts"

export type CancelOptions = {
  /** Skip the checklist and cancel immediately */
  force?: boolean
  /** Output subscription info as JSON (no changes made) */
  json?: boolean
}

/** Sanitize a subscription name for use in a file name. */
function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60) || "subscription"
}

export async function handleCancel(id: number, options: CancelOptions = {}): Promise<void> {
  const sub = getSubscription(id)
  if (!sub) {
    fail(`Subscription with id ${id} not found`)
    return
  }

  if (sub.status === "cancelled") {
    consola.info(`"${sub.name}" is already cancelled`)
    return
  }
  if (sub.status === "archived") {
    consola.info(`"${sub.name}" is archived — unarchive it first: subtrack unarchive ${id}`)
    return
  }

  const nextBilling = calculateNextBilling(sub, new Date())
  const cancellationDate = today()

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          id: sub.id,
          name: sub.name,
          price: sub.price,
          currency: sub.currency,
          cycle: sub.cycle,
          status: sub.status,
          nextBilling: formatDate(nextBilling),
          cancellationDate,
        },
        null,
        2,
      ) + "\n",
    )
    return
  }

  consola.log(pc.bold(`Cancelling: ${sub.name}`))
  consola.log(`  Price:        ${formatPrice(sub.price, sub.currency)}/${sub.cycle}`)
  const fmt = loadConfig().dateFormat === "short" ? formatShortDate : formatDate
  consola.log(`  Next billing: ${fmt(nextBilling)}`)
  consola.log("")

  let noteCancellationDate = false
  if (!options.force) {
    // Checklist 1: export data
    const doExport = await confirm({
      message: "Export this subscription's data before cancelling?",
      default: true,
    })
    if (doExport) {
      const exportPath = path.join(os.homedir(), "exports", `${safeFileName(sub.name)}-${cancellationDate}.csv`)
      const safePath = safeOutputPath(exportPath)
      if (!safePath) {
        consola.warn("Cannot export — invalid output path; skipping export")
      } else {
        try {
          mkdirSync(path.dirname(safePath), { recursive: true, mode: 0o700 })
          writeFileSync(safePath, exportCsv([sub]), { mode: 0o600 })
          consola.success(`Exported data to: ${safePath}`)
        } catch (err) {
          consola.warn(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // Checklist 2: alternatives
    const checkedAlternatives = await confirm({
      message: "Have you checked alternative services?",
      default: false,
    })
    if (!checkedAlternatives) {
      consola.warn("You may want to review alternatives before cancelling")
    }

    // Checklist 3: note the cancellation date
    noteCancellationDate = await confirm({
      message: "Note the cancellation date in the subscription notes?",
      default: true,
    })

    // Final confirmation
    const ok = await confirm({
      message: `Confirm cancellation of "${sub.name}"?`,
      default: false,
    })
    if (!ok) {
      consola.info("Aborted — no changes made")
      return
    }
  }

  const updates: Partial<AddSharedArgs> = { status: "cancelled" }
  if (noteCancellationDate) {
    updates.notes = sub.notes
      ? `${sub.notes}\nCancelled: ${cancellationDate}`
      : `Cancelled: ${cancellationDate}`
  }
  if (!sub.contractEnd) {
    updates.contractEnd = cancellationDate
  }

  updateSubscription(id, updates)
  logAudit("subscription.cancel", {
    targetType: "subscription",
    targetId: id,
    details: sub.name,
  })
  consola.success(`Cancelled: "${sub.name}"`)
  consola.info(`Remove it permanently with: subtrack delete ${id}`)
}