/**
 * Compact notification banner for display commands.
 *
 * Shows at the top of list/summary/payment/upcoming output when there are:
 * - Pending suggestions from email scans
 * - Upcoming payment deadlines within the next 7 days
 */

import pc from "picocolors"
import { getPendingSuggestionCount } from "../db/suggestions.ts"
import { calcUpcoming } from "../upcoming.ts"

/**
 * Display a compact notification banner in the main output area.
 * Shows nothing if there are no notifications.
 * Skipped when stdout is piped or JSON mode (caller's responsibility).
 */
export function showNotificationBanner(): void {
  const suggestionCount = getPendingSuggestionCount()
  const upcomingEntries = calcUpcoming(7)

  const parts: string[] = []
  if (suggestionCount > 0) {
    parts.push(`${suggestionCount} pending suggestion${suggestionCount > 1 ? "s" : ""}`)
  }
  if (upcomingEntries.length > 0) {
    parts.push(`${upcomingEntries.length} payment${upcomingEntries.length > 1 ? "s" : ""} due within 7 days`)
  }

  if (parts.length === 0) return

  // Compact one-liner
  console.log(pc.cyan(`ℹ ${parts.join(" · ")}`))
  console.log(pc.dim(`  subtrack suggest · subtrack upcoming`))
  console.log("")
}
