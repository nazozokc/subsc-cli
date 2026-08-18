import { consola } from "consola"
import pc from "picocolors"
import { getSubscriptions, getAllPriceChanges } from "./db.ts"
import type { SharedArgs, Currency } from "./types.ts"
import { periodFactor, OCCURRENCES_PER_YEAR } from "./date-utils.ts"
import { formatPrice } from "./price.ts"
import { fetchFxRates, convertSubsWithRates } from "./fx.ts"
import type { FxRates } from "./fx.ts"

export type OptimizeOptions = {
  json?: boolean
  minSavings?: number
  currency?: string
  discountRate?: number
  exclude?: string[]
}

type CycleSuggestion = {
  type: "cycle"
  name: string
  currentCycle: string
  suggestedCycle: string
  currentMonthly: number
  suggestedMonthly: number
  yearlySavings: number
}

type DuplicateSuggestion = {
  type: "duplicate"
  names: string[]
  category: string
  totalMonthly: number
}

type InactiveSuggestion = {
  type: "inactive"
  name: string
  id: number
  price: number
  currency: string
  cycle: string
  monthly: number
  lastChanged: string
}

type CancelSaving = {
  type: "cancelled"
  name: string
  price: number
  currency: string
  cycle: string
  monthly: number
}

type Suggestion =
  | CycleSuggestion
  | DuplicateSuggestion
  | InactiveSuggestion
  | CancelSaving

type OptimizeResult = {
  suggestions: Suggestion[]
  totalYearlySavings: number
}

// ── Analysis helpers ──────────────────────────────────────

/**
 * Estimate yearly savings from switching monthly to yearly billing.
 * Uses a conservative 15% discount (common for most SaaS).
 */
function estimateYearlyDiscount(monthlyPrice: number, discountRate: number = 15): number {
  return Math.round(monthlyPrice * 12 * (discountRate / 100))
}

/**
 * Tokenize a subscription name for comparison.
 * Removes common words and splits into tokens.
 */
function tokenizeName(name: string): string[] {
  const common = [
    "plan", "pro", "basic", "premium", "standard", "plus", "family",
    "duo", "student", "enterprise", "business", "personal",
  ]
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !common.includes(t))
}

/**
 * Compute Jaccard similarity between two token arrays.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

// ── Analysis functions ────────────────────────────────────

function analyzeCycleOptimization(subs: SharedArgs[], discountRate: number = 15): CycleSuggestion[] {
  const results: CycleSuggestion[] = []

  for (const sub of subs) {
    if (sub.status === "cancelled" || sub.status === "paused") continue
    if (sub.cycle !== "monthly") continue

    const monthlyCost = sub.price
    const yearlyCost = monthlyCost * 12
    const estimatedYearlyWithDiscount = Math.round(yearlyCost * (1 - discountRate / 100))
    const savings = yearlyCost - estimatedYearlyWithDiscount

    if (savings > 0) {
      results.push({
        type: "cycle",
        name: sub.name,
        currentCycle: "monthly",
        suggestedCycle: "yearly",
        currentMonthly: monthlyCost,
        suggestedMonthly: Math.round(estimatedYearlyWithDiscount / 12),
        yearlySavings: savings,
      })
    }
  }

  return results
}

function analyzeDuplicates(subs: SharedArgs[]): DuplicateSuggestion[] {
  const active = subs.filter((s) => s.status === "active")
  const results: DuplicateSuggestion[] = []
  const checked = new Set<number>()

  for (let i = 0; i < active.length; i++) {
    if (checked.has(active[i].id)) continue
    const tokensA = tokenizeName(active[i].name)
    const similar: SharedArgs[] = []

    for (let j = i + 1; j < active.length; j++) {
      if (checked.has(active[j].id)) continue
      const tokensB = tokenizeName(active[j].name)
      const similarity = jaccardSimilarity(tokensA, tokensB)
      if (similarity >= 0.5) {
        similar.push(active[j])
      }
    }

    if (similar.length > 0) {
      const allSimilar = [active[i], ...similar]
      for (const s of allSimilar) checked.add(s.id)

      const totalMonthly = allSimilar.reduce(
        (sum, s) => sum + s.price * periodFactor(s.cycle, "monthly"),
        0,
      )

      // Find common category from first tag or name prefix
      const category =
        allSimilar
          .map((s) => s.tags[0])
          .filter(Boolean)
          .sort()[0] || allSimilar.map((s) => tokenizeName(s.name)[0]).filter(Boolean).sort()[0] || "unknown"

      results.push({
        type: "duplicate",
        names: allSimilar.map((s) => s.name),
        category,
        totalMonthly: Math.round(totalMonthly),
      })
    }
  }

  return results
}

function analyzeInactive(subs: SharedArgs[]): InactiveSuggestion[] {
  const active = subs.filter((s) => s.status === "active")
  const allChanges = getAllPriceChanges()
  const results: InactiveSuggestion[] = []

  // Group changes by subscription
  const changesBySub = new Map<number, string>()
  for (const change of allChanges) {
    const existing = changesBySub.get(change.subscriptionId)
    if (!existing || change.changedAt > existing) {
      changesBySub.set(change.subscriptionId, change.changedAt)
    }
  }

  const now = new Date()
  for (const sub of active) {
    const lastChange = changesBySub.get(sub.id)
    if (lastChange) {
      const changeDate = new Date(lastChange)
      const monthsSince = (now.getTime() - changeDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
      if (monthsSince >= 18) {
        results.push({
          type: "inactive",
          name: sub.name,
          id: sub.id,
          price: sub.price,
          currency: sub.currency,
          cycle: sub.cycle,
          monthly: Math.round(sub.price * periodFactor(sub.cycle, "monthly")),
          lastChanged: lastChange.slice(0, 10),
        })
      }
    }
  }

  return results
}

function analyzeCancelledSavings(subs: SharedArgs[]): CancelSaving[] {
  const results: CancelSaving[] = []

  for (const sub of subs) {
    if (sub.status !== "cancelled" && sub.status !== "paused") continue

    results.push({
      type: "cancelled",
      name: sub.name,
      price: sub.price,
      currency: sub.currency,
      cycle: sub.cycle,
      monthly: Math.round(sub.price * periodFactor(sub.cycle, "monthly")),
    })
  }

  return results
}

// ── Rendering ─────────────────────────────────────────────

function renderCycleSuggestions(suggestions: CycleSuggestion[], displayCurrency: string = "USD"): string {
  if (suggestions.length === 0) return ""
  const lines: string[] = [
    "",
    pc.bold("  Cycle Optimization"),
    "",
  ]

  let totalSavings = 0
  for (const s of suggestions) {
    const currentYearly = s.currentMonthly * 12
    const suggestedYearly = s.suggestedMonthly * 12
    lines.push(
      `    ${s.name}` +
        `  ${pc.dim(`${formatPrice(s.currentMonthly, displayCurrency)}/mo → `)}` +
        `${pc.green(`${formatPrice(s.suggestedMonthly, displayCurrency)}/mo`)}` +
        `  ${pc.green(`(save ${formatPrice(s.yearlySavings, displayCurrency)}/yr)`)}`,
    )
    totalSavings += s.yearlySavings
  }

  if (totalSavings > 0) {
    lines.push(
      `    ${pc.dim("─".repeat(40))}`,
      `    ${pc.green(pc.bold(`Total savings: ${formatPrice(totalSavings, displayCurrency)}/yr`))}`,
    )
  }

  return lines.join("\n")
}

function renderDuplicateSuggestions(suggestions: DuplicateSuggestion[], displayCurrency: string = "USD"): string {
  if (suggestions.length === 0) return ""
  const lines: string[] = [
    "",
    pc.bold("  Possible Duplicates"),
    "",
  ]

  for (const s of suggestions) {
    lines.push(`    ${pc.yellow(s.category)}:`)
    for (const name of s.names) {
      lines.push(`      • ${name}`)
    }
    lines.push(`      ${pc.dim(`Combined: ${formatPrice(s.totalMonthly, displayCurrency)}/mo`)}`)
    lines.push("")
  }

  return lines.join("\n")
}

function renderInactiveSuggestions(suggestions: InactiveSuggestion[]): string {
  if (suggestions.length === 0) return ""
  const lines: string[] = [
    "",
    pc.bold("  Inactive (no price change >18 months)"),
    "",
  ]

  for (const s of suggestions) {
    lines.push(
      `    ${pc.dim(`#${s.id}`)} ${s.name}` +
        `  ${formatPrice(s.monthly, s.currency)}/mo` +
        `  ${pc.dim(`last change: ${s.lastChanged}`)}`,
    )
  }

  return lines.join("\n")
}

function renderCancelledSavings(suggestions: CancelSaving[], displayCurrency: string = "USD"): string {
  if (suggestions.length === 0) return ""
  const totalMonthly = suggestions.reduce((s, c) => s + c.monthly, 0)
  const lines: string[] = [
    "",
    pc.bold("  Cancelled / Paused (previously paid)"),
    "",
  ]

  for (const s of suggestions) {
    lines.push(`    • ${s.name}  ${pc.dim(`${formatPrice(s.monthly, s.currency)}/mo`)}`)
  }

  lines.push(
    `    ${pc.dim("─".repeat(40))}`,
    `    ${pc.dim(`Previously: ${formatPrice(totalMonthly, displayCurrency)}/mo`)}`,
  )

  return lines.join("\n")
}

function renderReport(result: OptimizeResult, displayCurrency: string = "USD"): string {
  const sections: string[] = [
    pc.bold("Cost Optimization Report"),
  ]

  const cycleSuggestions = result.suggestions.filter((s) => s.type === "cycle")
  const duplicateSuggestions = result.suggestions.filter((s) => s.type === "duplicate")
  const inactiveSuggestions = result.suggestions.filter((s) => s.type === "inactive")
  const cancelledSuggestions = result.suggestions.filter((s) => s.type === "cancelled")

  const cycleSection = renderCycleSuggestions(cycleSuggestions as CycleSuggestion[], displayCurrency)
  const duplicateSection = renderDuplicateSuggestions(duplicateSuggestions as DuplicateSuggestion[], displayCurrency)
  const inactiveSection = renderInactiveSuggestions(inactiveSuggestions as InactiveSuggestion[])
   const cancelledSection = renderCancelledSavings(cancelledSuggestions as CancelSaving[], displayCurrency)

  if (cycleSection) sections.push(cycleSection)
  if (duplicateSection) sections.push(duplicateSection)
  if (inactiveSection) sections.push(inactiveSection)
  if (cancelledSection) sections.push(cancelledSection)

  if (result.suggestions.length === 0) {
    sections.push("", "  No optimization opportunities found. Everything looks good!")
  }

  if (result.totalYearlySavings > 0) {
    sections.push(
      "",
      pc.bold(
        `  Total potential savings: ${pc.green(formatPrice(result.totalYearlySavings, displayCurrency))}/yr`,
      ),
    )
  }

  return sections.join("\n")
}

// ── Main ──────────────────────────────────────────────────

export async function handleOptimize(options: OptimizeOptions = {}): Promise<void> {
  let subs = getSubscriptions()

  if (subs.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  // Apply exclude filter
  if (options.exclude && options.exclude.length > 0) {
    subs = subs.filter((s) => !options.exclude!.includes(s.name))
  }

  const minSavings = options.minSavings ?? 0
  const discountRate = options.discountRate ?? 15
  let displayCurrency = "USD" as string

  // Currency conversion for display
  if (options.currency) {
    displayCurrency = options.currency
    try {
      const rates = await fetchFxRates()
      subs = convertSubsWithRates(subs, displayCurrency as Currency, rates)
    } catch {
      consola.warn("Failed to fetch exchange rates; showing in original currencies")
      displayCurrency = "USD"
    }
  }

  const cycleSuggestions = analyzeCycleOptimization(subs, discountRate)
  const duplicateSuggestions = analyzeDuplicates(subs)
  const inactiveSuggestions = analyzeInactive(subs)
  const cancelledSuggestions = analyzeCancelledSavings(subs)

  const allSuggestions: Suggestion[] = [
    ...cycleSuggestions,
    ...duplicateSuggestions,
    ...inactiveSuggestions,
    ...cancelledSuggestions,
  ]

  const totalYearlySavings =
    cycleSuggestions.reduce((s, c) => s + c.yearlySavings, 0)

  if (minSavings > 0 && totalYearlySavings < minSavings) {
    consola.info(
      `Potential savings (${formatPrice(totalYearlySavings, displayCurrency)}/yr) below minimum threshold (${formatPrice(minSavings, displayCurrency)}/yr)`,
    )
    return
  }

  if (options.json) {
    const result: OptimizeResult = {
      suggestions: allSuggestions,
      totalYearlySavings,
    }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    return
  }

  consola.log(renderReport({ suggestions: allSuggestions, totalYearlySavings }, displayCurrency))
}
