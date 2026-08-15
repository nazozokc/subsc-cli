/**
 * Duplicate detection — compares a suggestion against existing subscriptions.
 */

import type { SharedArgs } from "../types.ts"
import { getSubscriptions, findSubscriptionByName } from "../db.ts"
import type { Suggestion } from "./types.ts"

export type MatchResult = {
  /** Existing subscriptions that may match this suggestion. */
  matches: SharedArgs[]
  /** Whether an exact match was found (same name). */
  exactMatch: boolean
}

/**
 * Find existing subscriptions that may match a suggestion.
 */
export function findMatches(suggestion: Pick<Suggestion, "name" | "price">): MatchResult {
  const all = getSubscriptions({ includeArchived: true })
  const name = suggestion.name.toLowerCase().trim()

  // Try exact case-insensitive name match
  const exact = findSubscriptionByName(suggestion.name)
  if (exact) {
    return { matches: [exact], exactMatch: true }
  }

  // Try fuzzy name match
  const nameWords = name.split(/[\s\-_]+/).filter(Boolean)
  const fuzzy: SharedArgs[] = []

  for (const sub of all) {
    const subName = sub.name.toLowerCase()

    // Service name is contained in existing subscription name
    if (subName.includes(name) || name.includes(subName)) {
      fuzzy.push(sub)
      continue
    }

    // Significant word overlap (at least 1 common non-trivial word)
    const subWords = subName.split(/[\s\-_]+/).filter(Boolean)
    const common = nameWords.filter((w) => w.length > 2 && subWords.includes(w))
    if (common.length > 0) {
      fuzzy.push(sub)
    }
  }

  return { matches: fuzzy.slice(0, 5), exactMatch: false }
}

/**
 * Check if a suggestion has a price conflict with an existing subscription.
 * Returns true if the prices differ significantly.
 */
export function hasPriceConflict(
  suggestion: Pick<Suggestion, "price" | "currency">,
  existing: SharedArgs,
): boolean {
  if (suggestion.price === null || suggestion.currency === null) return false
  if (existing.currency !== suggestion.currency) return false

  const diff = Math.abs(suggestion.price - existing.price)
  const ratio = diff / Math.max(existing.price, 1)
  return ratio > 0.3 // More than 30% difference
}
