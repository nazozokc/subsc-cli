import type { SqlValue } from "sql.js"
import { getDb, execObjs, execObj, saveDb } from "./connection.ts"
import type { SharedArgs, AddSharedArgs } from "../types.ts"

const SORT_FIELDS = ["id", "name", "price", "currency", "cycle", "status"] as const

/** Cast raw DB row to SharedArgs, converting integer booleans. */
export function toSharedArgs(raw: Record<string, unknown>): SharedArgs {
  return {
    ...raw,
    autoRenewal: Boolean(raw.autoRenewal),
  } as unknown as SharedArgs
}

export function mapTags(subs: SharedArgs[]): SharedArgs[] {
  if (subs.length === 0) return subs

  const db = getDb()
  const ids = subs.map((s) => s.id)
  const placeholders = ids.map(() => "?").join(",")
  const rows = execObjs<{ subscription_id: number; name: string }>(
    db,
    `SELECT subscription_tags.subscription_id, tags.name FROM tags
     JOIN subscription_tags ON subscription_tags.tag_id = tags.id
     WHERE subscription_tags.subscription_id IN (${placeholders})`,
    ids,
  )

  // Group tags by subscription id
  const tagMap = new Map<number, string[]>()
  for (const row of rows) {
    const list = tagMap.get(row.subscription_id)
    if (list) {
      list.push(row.name)
    } else {
      tagMap.set(row.subscription_id, [row.name])
    }
  }

  for (const sub of subs) {
    sub.tags = tagMap.get(sub.id) ?? []
  }

  return subs
}

export const SUBSCRIPTION_COLS = `
  id, name, price, currency, cycle, status,
  billing_day AS billingDay, created_at AS createdAt,
  notes, payment_method AS paymentMethod,
  contract_start AS contractStart, contract_end AS contractEnd,
  auto_renewal AS autoRenewal, vendor_name AS vendorName,
  vendor_url AS vendorUrl, plan_tier AS planTier,
  discount_amount AS discountAmount, discount_type AS discountType
`

export const getSubscriptions = (sort?: string, desc?: boolean, status?: string): SharedArgs[] => {
  const db = getDb()
  const field = sort && (SORT_FIELDS as readonly string[]).includes(sort) ? sort : "id"
  const order = desc ? "DESC" : "ASC"

  let whereClause = ""
  const params: SqlValue[] = []
  if (status !== undefined) {
    if (status === "all") {
      // no filter — include all
    } else {
      const statuses = status.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      if (statuses.length > 0) {
        whereClause = `WHERE status IN (${statuses.map(() => "?").join(",")})`
        params.push(...statuses)
      }
    }
  } else {
    // Default: include all (backward compatible)
    whereClause = ""
  }

  const raw = execObjs<Record<string, unknown>>(
    db,
    `SELECT ${SUBSCRIPTION_COLS} FROM subscriptions ${whereClause} ORDER BY ${field} ${order}`,
    params.length > 0 ? params : undefined,
  )
  return mapTags(raw.map(toSharedArgs))
}

export const writeSubscription = (data: AddSharedArgs): void => {
  const db = getDb()
  const uniqueTags = Array.from(new Set(data.tags))

  db.run("BEGIN TRANSACTION")
  try {
    db.run(
      `INSERT INTO subscriptions (name, price, currency, cycle, status, billing_day, created_at, notes, payment_method,
        contract_start, contract_end, auto_renewal, vendor_name, vendor_url, plan_tier, discount_amount, discount_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name, data.price, data.currency, data.cycle, data.status ?? "active",
        data.billingDay ?? null, data.createdAt ?? new Date().toISOString().split("T")[0],
        data.notes ?? null, data.paymentMethod ?? null,
        data.contractStart ?? null, data.contractEnd ?? null,
        data.autoRenewal !== false ? 1 : 0,
        data.vendorName ?? null, data.vendorUrl ?? null, data.planTier ?? null,
        data.discountAmount ?? null, data.discountType ?? null,
      ],
    )

    const idRow = execObj<Record<string, SqlValue>>(
      db,
      "SELECT last_insert_rowid() AS id",
    )
    if (!idRow) throw new Error("Failed to get last insert id")
    const subscriptionId = Number(idRow.id)

    for (const t of uniqueTags) {
      db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t])
      const tagRow = execObj<{ id: number }>(
        db,
        "SELECT id FROM tags WHERE name = ?",
        [t],
      )
      if (tagRow) {
        db.run(
          "INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?, ?)",
          [subscriptionId, tagRow.id],
        )
      }
    }

    db.run("COMMIT")
    saveDb()
  } catch (error) {
    try {
      db.run("ROLLBACK")
    } catch {
      /* rollback failed, nothing to do */
    }
    throw error
  }
}

export const deleteSubscription = (id: number): boolean => {
  const db = getDb()
  db.run("DELETE FROM subscriptions WHERE id = ?", [id])
  const modified = db.getRowsModified() > 0
  if (modified) saveDb()
  return modified
}

export const getSubscription = (id: number): SharedArgs | undefined => {
  const db = getDb()
  const raw = execObj<Record<string, unknown>>(
    db,
    `SELECT ${SUBSCRIPTION_COLS} FROM subscriptions WHERE id = ?`,
    [id],
  )
  if (!raw) return undefined
  return mapTags([toSharedArgs(raw)])[0]
}

export const updateSubscription = (
  id: number,
  fields: Partial<AddSharedArgs>,
): boolean => {
  const db = getDb()

  db.run("BEGIN TRANSACTION")
  try {
    const sets: string[] = []
    const params: SqlValue[] = []

    if (fields.name !== undefined) { sets.push("name = ?"); params.push(fields.name) }
    if (fields.price !== undefined) { sets.push("price = ?"); params.push(fields.price) }
    if (fields.currency !== undefined) { sets.push("currency = ?"); params.push(fields.currency) }
    if (fields.cycle !== undefined) { sets.push("cycle = ?"); params.push(fields.cycle) }
    if (fields.status !== undefined) { sets.push("status = ?"); params.push(fields.status) }
    if (fields.billingDay !== undefined) { sets.push("billing_day = ?"); params.push(fields.billingDay) }
    if (fields.notes !== undefined) { sets.push("notes = ?"); params.push(fields.notes || null) }
    if (fields.paymentMethod !== undefined) { sets.push("payment_method = ?"); params.push(fields.paymentMethod || null) }
    if (fields.contractStart !== undefined) { sets.push("contract_start = ?"); params.push(fields.contractStart || null) }
    if (fields.contractEnd !== undefined) { sets.push("contract_end = ?"); params.push(fields.contractEnd || null) }
    if (fields.autoRenewal !== undefined) { sets.push("auto_renewal = ?"); params.push(fields.autoRenewal ? 1 : 0) }
    if (fields.vendorName !== undefined) { sets.push("vendor_name = ?"); params.push(fields.vendorName || null) }
    if (fields.vendorUrl !== undefined) { sets.push("vendor_url = ?"); params.push(fields.vendorUrl || null) }
    if (fields.planTier !== undefined) { sets.push("plan_tier = ?"); params.push(fields.planTier || null) }
    if (fields.discountAmount !== undefined) { sets.push("discount_amount = ?"); params.push(fields.discountAmount) }
    if (fields.discountType !== undefined) { sets.push("discount_type = ?"); params.push(fields.discountType || null) }

    if (sets.length > 0) {
      params.push(id)
      db.run(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`, params)
    }

    if (fields.tags !== undefined) {
      const uniqueTags = Array.from(new Set(fields.tags))
      db.run("DELETE FROM subscription_tags WHERE subscription_id = ?", [id])
      for (const t of uniqueTags) {
        db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t])
        const tagRow = execObj<{ id: number }>(
          db,
          "SELECT id FROM tags WHERE name = ?",
          [t],
        )
        if (tagRow) {
          db.run(
            "INSERT INTO subscription_tags (subscription_id, tag_id) VALUES (?, ?)",
            [id, tagRow.id],
          )
        }
      }
    }

    db.run("COMMIT")
    saveDb()
    return true
  } catch (error) {
    try { db.run("ROLLBACK") } catch { /* ok */ }
    throw error
  }
}
