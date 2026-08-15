/**
 * Suggestion command handlers.
 *
 * Provides the backing logic for all `subtrack suggest` subcommands.
 */

import { consola } from "consola"
import { fail } from "../error.ts"
import pc from "picocolors"
import {
  getSuggestions,
  getSuggestion,
  dismissSuggestion,
  dismissAllSuggestions,
  writeSubscription,
  markSuggestionAsAdded,
} from "../db.ts"
import { formatPrice } from "../price.ts"
import { reviewSuggestions } from "./interactor.ts"
import { handleSuggestScan } from "./scan.ts"
import type { SuggestListFlags, SuggestDismissFlags } from "./types.ts"

/** List pending suggestions. */
export function handleSuggestList(flags: SuggestListFlags = {}): void {
  const status = flags.all ? undefined : "pending"
  const suggestions = getSuggestions(status)

  if (flags.json) {
    process.stdout.write(JSON.stringify(suggestions, null, 2) + "\n")
    return
  }

  if (suggestions.length === 0) {
    consola.info(flags.all ? "No suggestions found." : "No pending suggestions.")
    return
  }

  consola.log(pc.bold(pc.cyan(`── Suggestions (${suggestions.length}) ──`)))
  consola.log("")

  for (const s of suggestions) {
    const priceStr = s.price !== null && s.currency
      ? formatPrice(s.price, s.currency)
      : "N/A"
    const cycleStr = s.cycle ?? ""
    const statusTag = s.status === "pending"
      ? pc.green("pending")
      : s.status === "dismissed"
        ? pc.dim("dismissed")
        : pc.blue("added")

    consola.log(
      `  ${pc.cyan(`#${s.id}`)} ${pc.bold(s.name)}  ${pc.yellow(priceStr)}${cycleStr ? pc.dim(`/${cycleStr}`) : ""}  ${statusTag}  ${pc.dim(s.sourceDetail ?? "")}`,
    )
  }
}

/** View a single suggestion in detail. */
export function handleSuggestView(id: number): void {
  const suggestion = getSuggestion(id)
  if (!suggestion) {
    fail(`Suggestion #${id} not found.`)
    return
  }

  const priceStr = suggestion.price !== null && suggestion.currency
    ? formatPrice(suggestion.price, suggestion.currency)
    : "N/A"

  consola.log(pc.bold(pc.cyan(`── Suggestion #${suggestion.id} ──`)))
  consola.log(`  ${pc.bold("Name:")}       ${suggestion.name}`)
  consola.log(`  ${pc.bold("Price:")}      ${priceStr}${suggestion.cycle ? pc.dim(`/${suggestion.cycle}`) : ""}`)
  if (suggestion.vendorName) consola.log(`  ${pc.bold("Vendor:")}     ${suggestion.vendorName}`)
  if (suggestion.planTier) consola.log(`  ${pc.bold("Plan:")}       ${suggestion.planTier}`)
  if (suggestion.paymentMethod) consola.log(`  ${pc.bold("Payment:")}    ${suggestion.paymentMethod}`)
  consola.log(`  ${pc.bold("Source:")}     ${suggestion.sourceDetail ?? suggestion.source}`)
  consola.log(`  ${pc.bold("Confidence:")} ${Math.round(suggestion.confidence * 100)}%`)
  consola.log(`  ${pc.bold("Status:")}     ${suggestion.status}`)
  if (suggestion.matchedSubId) {
    consola.log(`  ${pc.bold("Added as:")}   subscription #${suggestion.matchedSubId}`)
  }
  if (suggestion.createdAt) {
    consola.log(`  ${pc.bold("Created:")}   ${suggestion.createdAt}`)
  }
}

/** Review suggestions interactively (add/edit/skip). */
export async function handleSuggestReview(): Promise<void> {
  const suggestions = getSuggestions("pending")
  if (suggestions.length === 0) {
    consola.info("No pending suggestions to review.")
    return
  }
  await reviewSuggestions(suggestions)
}

/** Dismiss a suggestion by id. */
export function handleSuggestDismiss(id: number): void {
  const ok = dismissSuggestion(id)
  if (ok) {
    consola.success(`Suggestion #${id} dismissed.`)
  } else {
    fail(`Suggestion #${id} not found or already processed.`)
  }
}

/** Dismiss all pending suggestions. */
export function handleSuggestDismissAll(flags: SuggestDismissFlags = {}): void {
  const count = getSuggestions("pending").length
  if (count === 0) {
    consola.info("No pending suggestions to dismiss.")
    return
  }
  dismissAllSuggestions()
  consola.success(`${count} suggestion${count > 1 ? "s" : ""} dismissed.`)
}

/** Add a suggestion as a subscription directly (non-interactive). */
export function handleSuggestAdd(id: number): void {
  const suggestion = getSuggestion(id)
  if (!suggestion) {
    fail(`Suggestion #${id} not found.`)
    return
  }
  if (suggestion.status !== "pending") {
    fail(`Suggestion #${id} is already ${suggestion.status}.`)
    return
  }

  const price = suggestion.price ?? 0
  const currency = suggestion.currency ?? "USD"
  const cycle = (suggestion.cycle ?? "monthly") as import("../types.ts").Cycle

  const subId = writeSubscription({
    name: suggestion.name,
    price,
    currency,
    cycle,
    tags: [],
    vendorName: suggestion.vendorName,
    planTier: suggestion.planTier,
    paymentMethod: suggestion.paymentMethod,
  })

  markSuggestionAsAdded(id, subId)
  consola.success(`Added "${suggestion.name}" as subscription #${subId}.`)
}
