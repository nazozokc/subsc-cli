import { input } from "@inquirer/prompts"
import { consola } from "consola"
import { getDb, mapTags } from "./db.ts"
import { spreadSubscription } from "./display.ts"
import type { SharedArgs } from "./types.ts"
import type { SqlValue } from "sql.js"

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
  // Apply defaults: search all fields if none specified
  fields = {
    names: fields.names ?? (!fields.notes && !fields.tags),
    notes: fields.notes ?? (!fields.names && !fields.tags),
    tags: fields.tags ?? (!fields.names && !fields.notes),
  }
  const db = getDb()
  const pattern = `%${query}%`
  const conditions: string[] = []
  const params: SqlValue[] = []

  if (fields.names) {
    conditions.push("s.name LIKE ?")
    params.push(pattern)
  }
  if (fields.notes) {
    conditions.push("s.notes LIKE ?")
    params.push(pattern)
  }
  if (fields.tags) {
    conditions.push(
      "s.id IN (SELECT st.subscription_id FROM subscription_tags st JOIN tags t ON t.id = st.tag_id WHERE t.name LIKE ?)",
    )
    params.push(pattern)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : ""
  const sql = `SELECT DISTINCT s.id, s.name, s.price, s.currency, s.cycle, s.status, s.billing_day AS billingDay, s.created_at AS createdAt, s.notes, s.payment_method AS paymentMethod, s.contract_start AS contractStart, s.contract_end AS contractEnd, s.auto_renewal AS autoRenewal, s.vendor_name AS vendorName, s.vendor_url AS vendorUrl, s.plan_tier AS planTier, s.discount_amount AS discountAmount, s.discount_type AS discountType FROM subscriptions s ${whereClause} ORDER BY s.name`

  const results = db.exec(sql, params)
  if (!results.length) return []

  const { columns, values } = results[0]
  const subs: SharedArgs[] = values.map((row) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i]
    }
    return {
      id: Number(obj.id),
      name: String(obj.name),
      price: Number(obj.price),
      currency: String(obj.currency),
      cycle: String(obj.cycle),
      status: String(obj.status),
      billingDay: obj.billingDay !== null ? Number(obj.billingDay) : null,
      createdAt: String(obj.createdAt),
      notes: obj.notes !== null ? String(obj.notes) : null,
      paymentMethod: obj.paymentMethod !== null ? String(obj.paymentMethod) : null,
      contractStart: obj.contractStart !== null ? String(obj.contractStart) : null,
      contractEnd: obj.contractEnd !== null ? String(obj.contractEnd) : null,
      autoRenewal: obj.autoRenewal !== null ? Boolean(obj.autoRenewal) : true,
      vendorName: obj.vendorName !== null ? String(obj.vendorName) : null,
      vendorUrl: obj.vendorUrl !== null ? String(obj.vendorUrl) : null,
      planTier: obj.planTier !== null ? String(obj.planTier) : null,
      discountAmount: obj.discountAmount !== null ? Number(obj.discountAmount) : null,
      discountType: obj.discountType !== null ? (String(obj.discountType) as "percentage" | "fixed") : null,
      tags: [],
    } as unknown as SharedArgs
  })

  return mapTags(subs)
}
