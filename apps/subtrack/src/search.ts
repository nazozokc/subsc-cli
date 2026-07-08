import { input } from "@inquirer/prompts"
import { consola } from "consola"
import { getSubscriptions } from "./db.ts"
import { spreadSubscription } from "./display.ts"
import type { SharedArgs } from "./types.ts"

export type SearchOptions = {
  names?: boolean
  notes?: boolean
  tags?: boolean
  json?: boolean
  status?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
}

/**
 * Search subscriptions by name, notes, and/or tags.
 * When no field flags are given, searches all fields.
 */
export async function handleSearch(
  query: string | undefined,
  options: SearchOptions = {},
): Promise<void> {
  // Interactive prompt if no query provided
  if (!query) {
    if (options.json) {
      process.stdout.write("[]\n")
      return
    }
    const answer = await input({
      message: "search query",
      validate: (v: string) => (v.trim() ? true : "Query cannot be empty"),
    })
    query = answer.trim()
  }

  const fields = {
    names: options.names ?? (!options.notes && !options.tags),
    notes: options.notes ?? (!options.names && !options.tags),
    tags: options.tags ?? (!options.names && !options.notes),
  }

  let results = searchSubscriptions(query, fields)

  // Apply status filter
  if (options.status) {
    const statuses = options.status.split(",").map((s) => s.trim().toLowerCase())
    results = results.filter((s) => statuses.includes(s.status))
  }

  // Apply price range filters
  if (options.minPrice !== undefined) {
    results = results.filter((s) => s.price >= options.minPrice!)
  }
  if (options.maxPrice !== undefined) {
    results = results.filter((s) => s.price <= options.maxPrice!)
  }

  // Apply limit
  if (options.limit !== undefined && options.limit > 0) {
    results = results.slice(0, options.limit)
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n")
    return
  }

  if (results.length === 0) {
    consola.info(`No results for "${query}"`)
    return
  }

  consola.info(
    `Found ${results.length} result${results.length > 1 ? "s" : ""} for "${query}":`,
  )
  await spreadSubscription(results)
}

export function searchSubscriptions(
  query: string,
  fields: { names?: boolean; notes?: boolean; tags?: boolean },
): SharedArgs[] {
  const lowerQuery = query.toLowerCase()

  // Get all subscriptions (native search is name-only, so we filter in JS)
  const all = getSubscriptions()

  return all.filter((sub) => {
    const matchName = fields.names ?? (!fields.notes && !fields.tags)
    const matchNotes = fields.notes ?? (!fields.names && !fields.tags)
    const matchTags = fields.tags ?? (!fields.names && !fields.notes)

    if (matchName && sub.name.toLowerCase().includes(lowerQuery)) return true
    if (matchNotes && sub.notes && sub.notes.toLowerCase().includes(lowerQuery)) return true
    if (matchTags && sub.tags.some((t) => t.toLowerCase().includes(lowerQuery))) return true

    return false
  })
}
