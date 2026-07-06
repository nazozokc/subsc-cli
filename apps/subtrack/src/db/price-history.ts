import type { SqlValue } from "sql.js"
import { getDb, execObjs, saveDb } from "./connection.ts"

export type PriceHistoryEntry = {
  id: number
  subscriptionId: number
  subscriptionName: string
  oldPrice: number | null
  newPrice: number
  oldCurrency: string | null
  newCurrency: string
  changedAt: string
}

type RawPriceHistory = {
  id: number
  subscription_id: number
  old_price: number | null
  new_price: number
  old_currency: string | null
  new_currency: string
  changed_at: string
  name: string
}

function toPriceHistoryEntry(r: RawPriceHistory): PriceHistoryEntry {
  return {
    id: r.id,
    subscriptionId: r.subscription_id,
    subscriptionName: r.name,
    oldPrice: r.old_price,
    newPrice: r.new_price,
    oldCurrency: r.old_currency,
    newCurrency: r.new_currency,
    changedAt: r.changed_at,
  }
}

export const writePriceHistory = (
  subscriptionId: number,
  oldPrice: number | null,
  newPrice: number,
  oldCurrency: string | null,
  newCurrency: string,
): void => {
  const db = getDb()
  // Only record if price or currency actually changed
  if (oldPrice === newPrice && oldCurrency === newCurrency) return
  db.run(
    `INSERT INTO price_history (subscription_id, old_price, new_price, old_currency, new_currency)
     VALUES (?, ?, ?, ?, ?)`,
    [subscriptionId, oldPrice, newPrice, oldCurrency, newCurrency],
  )
  saveDb()
}

/** Get price history for a specific subscription (newest first). */
export const getPriceHistory = (subscriptionId: number): PriceHistoryEntry[] => {
  const db = getDb()
  const rows = execObjs<RawPriceHistory>(
    db,
    `SELECT ph.id, ph.subscription_id, ph.old_price, ph.new_price,
            ph.old_currency, ph.new_currency, ph.changed_at, s.name
     FROM price_history ph
     JOIN subscriptions s ON s.id = ph.subscription_id
     WHERE ph.subscription_id = ?
     ORDER BY ph.changed_at DESC`,
    [subscriptionId],
  )
  return rows.map(toPriceHistoryEntry)
}

/** Get all price changes across subscriptions, optionally filtered to recent days. */
export const getAllPriceChanges = (days?: number): PriceHistoryEntry[] => {
  const db = getDb()
  let sql = `SELECT ph.id, ph.subscription_id, ph.old_price, ph.new_price,
                    ph.old_currency, ph.new_currency, ph.changed_at, s.name
             FROM price_history ph
             JOIN subscriptions s ON s.id = ph.subscription_id`
  const params: SqlValue[] = []
  if (days !== undefined && days > 0) {
    sql += ` WHERE ph.changed_at >= datetime('now', '-' || ? || ' days')`
    params.push(days)
  }
  sql += ` ORDER BY ph.changed_at DESC`
  const rows = execObjs<RawPriceHistory>(db, sql, params.length > 0 ? params : undefined)
  return rows.map(toPriceHistoryEntry)
}
