import { consola } from "consola"
import pc from "picocolors"
import type { Currency, SharedArgs } from "./types.ts"
import { getSubscriptions, getNonCancelledSubscriptions } from "./db.ts"
import { loadConfig } from "./config.ts"
import { formatPrice } from "./price.ts"
import { calcSubTotal } from "./payment.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"

export type BudgetOptions = {
  /** Exit with code 1 when over budget (for cron/scripts) */
  check?: boolean
  /** Comparison period: monthly or yearly (default: monthly) */
  period?: "monthly" | "yearly"
  /** Convert all prices to target currency */
  currency?: string
  /** Compare against a named budget from config.budgets */
  name?: string
  /** Output as JSON */
  json?: boolean
}

type ResolvedBudget = {
  name: string | null
  amount: number
  currency: string
  categories?: string[]
  /** Period carried by named budgets (defaults to the requested period) */
  period?: "monthly" | "yearly"
}

/**
 * Resolve the budget to compare against.
 * - Named budget: entry from config.budgets (uses its own period/currency)
 * - Yearly: config.yearlyBudget, falling back to monthlyBudget * 12
 * - Monthly: config.monthlyBudget
 * Returns null when no budget is configured.
 */
export function resolveBudget(
  period: "monthly" | "yearly",
  name?: string,
): ResolvedBudget | null {
  const config = loadConfig()

  if (name) {
    const entry = config.budgets?.find((b) => b.name === name)
    if (!entry) return null
    return {
      name: entry.name,
      amount: entry.amount,
      currency: entry.currency || config.defaultCurrency || "USD",
      categories: entry.categories,
      period: entry.period,
    }
  }

  if (period === "yearly") {
    const amount = config.yearlyBudget ?? (config.monthlyBudget > 0 ? config.monthlyBudget * 12 : 0)
    return amount > 0
      ? { name: null, amount, currency: config.defaultCurrency || "USD" }
      : null
  }

  return config.monthlyBudget > 0
    ? { name: null, amount: config.monthlyBudget, currency: config.defaultCurrency || "USD" }
    : null
}

/**
 * Convert per-currency totals into a single target currency.
 * Returns the sum and whether any rate was missing.
 */
export function convertTotals(
  totals: Record<string, number>,
  target: string,
  rates: FxRates,
): { sum: number; missing: boolean } {
  let sum = 0
  let missing = false
  for (const [ccy, total] of Object.entries(totals)) {
    if (ccy === target) {
      sum += total
      continue
    }
    try {
      sum += convertPrice(total, ccy, target, rates.rates)
    } catch {
      missing = true
    }
  }
  return { sum, missing }
}

export async function handleBudget(options: BudgetOptions = {}): Promise<void> {
  const period = options.period ?? "monthly"
  const subs = getNonCancelledSubscriptions()

  const budget = resolveBudget(period, options.name)
  if (!budget) {
    if (options.json) {
      process.stdout.write(
        JSON.stringify({ set: false, period, budgetName: options.name ?? null }, null, 2) + "\n",
      )
      return
    }
    if (options.name) {
      consola.info(`Budget "${options.name}" not found — check: subtrack config set budgets ...`)
      return
    }
    const config = loadConfig()
    if (period === "monthly" && (config.yearlyBudget ?? 0) > 0) {
      consola.info(
        "Monthly budget not set — use --period yearly to compare against yearlyBudget, " +
          "or set: subtrack config set monthlyBudget <amount>",
      )
      return
    }
    consola.info(
      period === "yearly"
        ? "No budget set. Use: subtrack config set yearlyBudget <amount>"
        : "No budget set. Use: subtrack config set monthlyBudget <amount>",
    )
    return
  }

  // Named budgets may carry their own period (e.g. yearly vs monthly compare)
  const comparePeriod = budget.period ?? period

  // Fetch FX rates when any conversion might be needed
  const targetCurrency = options.currency as Currency | undefined
  let rates: FxRates | null = null
  if (targetCurrency || budget.currency) {
    try {
      rates = await fetchFxRates()
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
    }
  }

  // Named budgets can filter by categories (tags)
  let filtered: SharedArgs[] = subs
  if (budget.categories && budget.categories.length > 0) {
    filtered = subs.filter((s) => s.tags.some((t) => budget.categories!.includes(t)))
  }

  const totals = calcSubTotal(filtered, rates, targetCurrency, comparePeriod)

  const periodLabel = comparePeriod === "yearly" ? "year" : "month"
  const periodName = comparePeriod === "yearly" ? "Yearly" : "Monthly"

  // Determine a single comparable (currency, spending) pair
  let currency: string | null = null
  let spending = 0
  let budgetDisplay: number = budget.amount

  if (targetCurrency && rates) {
    currency = targetCurrency
    spending = Object.values(totals).reduce((a, b) => a + b, 0)
    // Convert budget into display currency for a fair comparison
    try {
      budgetDisplay = convertPrice(budget.amount, budget.currency, targetCurrency, rates.rates)
    } catch {
      consola.warn(`Cannot convert budget from ${budget.currency} to ${targetCurrency} — missing rate`)
    }
  } else if (rates && budget.currency) {
    const { sum, missing } = convertTotals(totals, budget.currency, rates)
    if (missing) consola.warn("Some prices could not be converted (missing rate)")
    currency = budget.currency
    spending = sum
  } else {
    const keys = Object.keys(totals)
    if (keys.length === 1 && keys[0] === budget.currency) {
      currency = keys[0]
      spending = totals[keys[0]] ?? 0
    }
  }

  if (currency === null) {
    const parts = Object.entries(totals)
      .map(([ccy, total]) => formatPrice(Math.round(total), ccy))
      .join(" + ")
    if (options.json) {
      process.stdout.write(
        JSON.stringify({
          set: true,
          period: comparePeriod,
          budgetName: budget.name,
          budget: budget.amount,
          budgetCurrency: budget.currency,
          spendingByCurrency: Object.fromEntries(
            Object.entries(totals).map(([ccy, total]) => [ccy, Math.round(total)]),
          ),
          comparable: false,
        }, null, 2) + "\n",
      )
      return
    }
    consola.log(`${periodName} spending: ${parts}/${periodLabel}`)
    consola.info(
      "Cannot compare against budget — multiple currencies. Use --currency to convert.",
    )
    return
  }

  const remaining = budgetDisplay - spending
  const over = remaining < 0

  if (options.json) {
    process.stdout.write(
      JSON.stringify({
        set: true,
        period: comparePeriod,
        budgetName: budget.name,
        budget: Math.round(budgetDisplay),
        budgetCurrency: currency,
        spending: Math.round(spending),
        currency,
        remaining: Math.round(remaining),
        over,
      }, null, 2) + "\n",
    )
    return
  }

  const budgetLabel = budget.name ? `Budget (${budget.name})` : "Budget"
  consola.log(
    `${periodName} spending: ${pc.bold(pc.yellow(formatPrice(Math.round(spending), currency)))}/${periodLabel}`,
  )
  consola.log(
    `${budgetLabel}: ${pc.bold(pc.yellow(formatPrice(Math.round(budgetDisplay), currency)))}/${periodLabel}` +
      (budget.currency !== currency ? ` (${budget.currency})` : ""),
  )
  if (over) {
    consola.log(`Over budget: ${pc.red(formatPrice(Math.round(-remaining), currency))}`)
  } else {
    consola.log(`Remaining: ${pc.green(formatPrice(Math.round(remaining), currency))}`)
  }
  if (budget.categories && budget.categories.length > 0) {
    consola.log(pc.dim(`(filtered by categories: ${budget.categories.join(", ")})`))
  }

  if (options.check && over) {
    process.exitCode = 1
  }
}