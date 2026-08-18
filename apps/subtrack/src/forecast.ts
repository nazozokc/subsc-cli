import { input, confirm, select, checkbox } from "@inquirer/prompts"
import { consola } from "consola"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import type { SharedArgs, Currency, Cycle } from "./types.ts"
import { TABLE_CHARS, TABLE_STYLE } from "./display-constants.ts"
import { periodFactor } from "./date-utils.ts"
import { getSubscriptions, getNonCancelledSubscriptions } from "./db.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertPrice, tryConvert } from "./fx.ts"
import type { FxRates } from "./fx.ts"
import {
  CURRENCY_CHOICES,
  CYCLE_CHOICES,
} from "./prompts.ts"

export type ForecastOptions = {
  months?: number
  cancel?: string[] // subscription names to exclude
  addName?: string
  addPrice?: string
  addCurrency?: string
  addCycle?: string
  currency?: string
  json?: boolean
  maxRows?: number
}

type ForecastEntry = {
  name: string
  monthly: number
  currency: string
}

// ── Main handler ──────────────────────────────────────

export async function handleForecast(
  options: ForecastOptions,
): Promise<void> {
  // Interactive mode when no options given
  const interactive =
    !options.json &&
    options.months === undefined &&
    !options.cancel &&
    !options.addName

  let months = options.months ?? 12
  let cancelNames: string[] = options.cancel ?? []
  let addEntry: { name: string; price: number; currency: string; cycle: Cycle } | null = null

  if (interactive) {
    // Ask for months
    const monthsStr = await input({
      message: "Forecast months (default: 12)",
      validate: (v: string) =>
        !v || (Number(v) > 0 && Number.isInteger(Number(v)))
          ? true
          : "Enter a positive integer",
    })
    if (monthsStr.trim()) months = Number(monthsStr)

    // Ask for cancellations
    const allSubs = getNonCancelledSubscriptions()
    if (allSubs.length > 0) {
      const toCancel = await checkbox({
        message: "Select subscriptions to exclude (optional)",
        choices: allSubs.map((s) => ({
          name: `${s.name} (${formatPrice(s.price, s.currency)}/${s.cycle})`,
          value: s.name,
        })),
      })
      cancelNames = toCancel
    }

    // Ask for hypothetical addition
    const addHypothetical = await confirm({
      message: "Add a hypothetical subscription?",
      default: false,
    })
    if (addHypothetical) {
      const name = await input({ message: "Subscription name:", validate: (v: string) => (v ? true : "Name required") })
      const priceStr = await input({ message: "Monthly price:", validate: (v: string) => (Number(v) > 0 ? true : "Enter a positive number") })
      const currency = await select({ message: "Currency:", choices: CURRENCY_CHOICES })
      const cycle = await select({ message: "Cycle:", choices: CYCLE_CHOICES })
      addEntry = {
        name: name.trim(),
        price: Math.round(Number(priceStr)),
        currency,
        cycle,
      }
    }
  } else if (options.addName) {
    // Flag-based add subscription
    const price = options.addPrice ? Math.round(Number(options.addPrice)) : 0
    addEntry = {
      name: options.addName,
      price,
      currency: options.addCurrency ?? "USD",
      cycle: (options.addCycle as Cycle) ?? "monthly",
    }
  }

  // Calculate entries
  const subs = getNonCancelledSubscriptions()

  const entries: ForecastEntry[] = subs
    .filter((s) => !cancelNames.includes(s.name))
    .map((s) => ({
      name: s.name,
      monthly: s.price * periodFactor(s.cycle, "monthly"),
      currency: s.currency,
    }))

  if (addEntry) {
    entries.push({
      name: addEntry.name,
      monthly: addEntry.price * periodFactor(addEntry.cycle, "monthly"),
      currency: addEntry.currency,
    })
  }

  if (entries.length === 0) {
    consola.info("No active subscriptions to forecast")
    return
  }

  // Currency conversion
  let targetCurrency: string | undefined = options.currency
  let rates: FxRates | null = null

  if (targetCurrency) {
    try {
      rates = await fetchFxRates()
    } catch {
      consola.fail("Failed to fetch exchange rates; showing original currencies")
      targetCurrency = undefined
    }
  }

  // Calculate totals
  const currencyGroups: Record<string, { entries: ForecastEntry[]; total: number }> = {}
  for (const entry of entries) {
    const ccy = targetCurrency ?? entry.currency
    if (!currencyGroups[ccy]) currencyGroups[ccy] = { entries: [], total: 0 }

    let monthly = entry.monthly
    if (targetCurrency && rates && entry.currency !== targetCurrency) {
      // Keep original on missing rate
      monthly = tryConvert(entry.monthly, entry.currency, targetCurrency, rates.rates) ?? entry.monthly
    }

    currencyGroups[ccy].entries.push({
      ...entry,
      monthly: Math.round(monthly),
      currency: ccy,
    })
    currencyGroups[ccy].total += Math.round(monthly)
  }

  // ── JSON output ──────────────────────────────────

  if (options.json) {
    const result: Record<string, unknown> = {
      months,
      currency: targetCurrency ?? null,
      groups: {},
    }
    if (cancelNames.length > 0) {
      result.excluded = cancelNames
    }
    const groups: Record<string, unknown> = {}
    for (const [ccy, group] of Object.entries(currencyGroups).sort()) {
      groups[ccy] = {
        total: Math.round(group.total),
        monthlyTotal: Math.round(group.total),
        periodTotal: Math.round(group.total * months),
        entries: group.entries.map((e) => ({
          name: e.name,
          monthly: Math.round(e.monthly),
          currency: e.currency,
          periodTotal: Math.round(e.monthly * months),
        })),
      }
    }
    result.groups = groups
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    return
  }

  // ── Display ────────────────────────────────────────

  const periodLabel = months === 12 ? "Year" : `${months} Months`

  for (const [ccy, group] of Object.entries(currencyGroups).sort()) {
    if (Object.keys(currencyGroups).length > 1) {
      consola.log("")
      consola.log(pc.bold(pc.cyan(`── ${ccy} ──`)))
    }

    const entriesForTable = group.entries
    const isMultiCurrency = Object.keys(currencyGroups).length > 1

    // Limit displayed columns
    const maxRows = options.maxRows ?? 8
    const displayEntries = entriesForTable.slice(0, maxRows)
    const overflow = entriesForTable.length - displayEntries.length

    const headers = ["Subscription", `Monthly`, periodLabel]
    const colAligns: ("left" | "right")[] = ["left", "right", "right"]

    const width = process.stdout.columns ?? 80
    const nameWidth = Math.max(16, Math.round(width * 0.35))
    const priceWidth = Math.max(10, Math.round(width * 0.2))
    const totalWidth = Math.max(10, Math.round(width * 0.2))
    const colWidths: number[] = [nameWidth, priceWidth, totalWidth]

    const table = new CliTable3({
      chars: { ...TABLE_CHARS },
      style: { ...TABLE_STYLE },
      colWidths: colWidths,
      head: headers,
      colAligns,
    })

    for (let i = 0; i < displayEntries.length; i++) {
      const e = displayEntries[i]
      const monthlyTotal = Math.round(e.monthly * months)
      const row = [
        e.name.length > 30 ? e.name.slice(0, 27) + "..." : e.name,
        formatPrice(e.monthly, e.currency),
        formatPrice(monthlyTotal, e.currency),
      ]
      if (i % 2 === 0) {
        table.push(row.map((cell) => `\x1b[48;5;236m${cell}\x1b[0m`))
      } else {
        table.push(row)
      }
    }

    if (overflow > 0) {
      table.push([
        pc.dim(`... and ${overflow} more`),
        "",
        "",
      ])
    }

    // Divider
    table.push([
      pc.dim("─".repeat(nameWidth - 2)),
      pc.dim("─"),
      pc.dim("─"),
    ])

    // Grand total row
    const grandMonthly = Math.round(group.total)
    const grandTotal = Math.round(group.total * months)
    table.push([
      pc.bold(pc.yellow("Total")),
      pc.bold(pc.yellow(formatPrice(grandMonthly, ccy))),
      pc.bold(pc.yellow(formatPrice(grandTotal, ccy))),
    ])

    if (!isMultiCurrency) {
      consola.log("")
    }
    consola.log(table.toString())

    // Show what-if savings when cancelling
    if (cancelNames.length > 0 && !isMultiCurrency) {
      const removedEntries = subs
        .filter((s) => cancelNames.includes(s.name))
        .map((s) => ({
          monthly: s.price * periodFactor(s.cycle, "monthly"),
          currency: s.currency,
        }))

      let removedMonthly = 0
      for (const re of removedEntries) {
        if (targetCurrency && rates && re.currency !== targetCurrency) {
          removedMonthly += Math.round(
            convertPrice(re.monthly, re.currency, targetCurrency, rates.rates),
          )
        } else {
          removedMonthly += Math.round(re.monthly)
        }
      }

      const savedMonthly = Math.round(removedMonthly)
      const savedTotal = Math.round(removedMonthly * months)
      const newMonthly = grandMonthly - savedMonthly
      const newTotal = grandTotal - savedTotal

      consola.log("")
      consola.log(
        pc.dim(
          `Without ${cancelNames.join(", ")}: ${pc.bold(formatPrice(newMonthly, ccy))}/${months === 1 ? "month" : "month"} ` +
          `(${formatPrice(newTotal, ccy)}/${periodLabel.toLocaleLowerCase()}) ` +
          `${pc.green(`— save ${formatPrice(savedMonthly, ccy)}/month (${formatPrice(savedTotal, ccy)}/${periodLabel.toLocaleLowerCase()})`)}`,
        ),
      )
    }
  }
}
