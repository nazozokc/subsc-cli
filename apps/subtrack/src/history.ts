import { consola } from "consola"
import pc from "picocolors"
import { getPriceHistory, getAllPriceChanges, getSubscription } from "./db.ts"
import type { PriceHistoryEntry } from "./db.ts"
import { formatPrice } from "./price.ts"

export type HistoryOptions = {
  json?: boolean
  all?: boolean
  days?: number
}

function formatDiff(
  oldPrice: number | null,
  newPrice: number,
  oldCurrency: string | null,
  newCurrency: string,
): string {
  const oldStr = oldPrice !== null ? formatPrice(oldPrice, oldCurrency ?? newCurrency) : "—"
  const newStr = formatPrice(newPrice, newCurrency)
  if (oldCurrency && newCurrency && oldCurrency !== newCurrency) {
    return `${oldStr} (${oldCurrency}) → ${newStr} (${newCurrency})`
  }
  if (oldPrice !== null && oldPrice !== newPrice) {
    const diff = newPrice - oldPrice
    const sign = diff > 0 ? "+" : ""
    return `${oldStr} → ${newStr}  (${sign}${formatPrice(diff, newCurrency)})`
  }
  return `→ ${newStr}`
}

function displayHistory(entries: PriceHistoryEntry[]): void {
  if (entries.length === 0) {
    consola.info("No price history found")
    return
  }

  // Group by subscription if showing all
  const groups = new Map<string, PriceHistoryEntry[]>()
  for (const e of entries) {
    const key = `${e.subscriptionId}::${e.subscriptionName}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  for (const [key, groupEntries] of groups) {
    const [, name] = key.split("::")
    consola.log(pc.bold(`${name}:`))
    for (const e of groupEntries) {
      const date = e.changedAt.slice(0, 10)
      consola.log(
        `  ${pc.dim(date)}  ${formatDiff(e.oldPrice, e.newPrice, e.oldCurrency, e.newCurrency)}`,
      )
    }
    consola.log("")
  }
}

export function handleHistory(id?: number, options: HistoryOptions = {}): void {
  if (options.json) {
    let entries: PriceHistoryEntry[]
    if (id !== undefined) {
      entries = getPriceHistory(id)
    } else {
      entries = getAllPriceChanges(options.days)
    }
    process.stdout.write(JSON.stringify(entries, null, 2) + "\n")
    return
  }

  if (id !== undefined) {
    const sub = getSubscription(id)
    if (!sub) {
      consola.error(`Subscription with id ${id} not found`)
      return
    }
    consola.log(pc.bold(`Price history for: ${sub.name}`))
    consola.log("")
    const entries = getPriceHistory(id)
    displayHistory(entries)
    return
  }

  if (options.all) {
    const entries = getAllPriceChanges(options.days)
    if (entries.length === 0) {
      consola.info("No price changes recorded")
      return
    }
    consola.log(pc.bold("All price changes:"))
    consola.log("")
    displayHistory(entries)
    return
  }

  consola.info("Usage: subtrack history <id> | subtrack history --all")
}
