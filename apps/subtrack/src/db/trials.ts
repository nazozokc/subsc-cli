import { getDb, execObjs, execObj, saveDb } from "./connection.ts"
import type { TrialEntry, AddTrialArgs } from "../types.ts"

export const writeTrial = (data: AddTrialArgs): void => {
  const db = getDb()
  db.run(
    "INSERT INTO trials (name, expires_at, price, currency, cycle, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [data.name, data.expiresAt, data.price ?? null, data.currency ?? null, data.cycle ?? null, data.notes ?? null],
  )
  saveDb()
}

export const getTrials = (): TrialEntry[] => {
  const db = getDb()
  return execObjs<TrialEntry>(
    db,
    "SELECT id, name, expires_at AS expiresAt, price, currency, cycle, notes, created_at AS createdAt FROM trials ORDER BY expires_at ASC",
  )
}

export const getTrial = (id: number): TrialEntry | undefined => {
  const db = getDb()
  return execObj<TrialEntry>(
    db,
    "SELECT id, name, expires_at AS expiresAt, price, currency, cycle, notes, created_at AS createdAt FROM trials WHERE id = ?",
    [id],
  )
}

export const deleteTrial = (id: number): boolean => {
  const db = getDb()
  db.run("DELETE FROM trials WHERE id = ?", [id])
  const modified = db.getRowsModified() > 0
  if (modified) saveDb()
  return modified
}

/** Return trial entries expiring within the next `days` days. */
export const getTrialsExpiringSoon = (days: number): TrialEntry[] => {
  const db = getDb()
  return execObjs<TrialEntry>(
    db,
    `SELECT id, name, expires_at AS expiresAt, price, currency, cycle, notes, created_at AS createdAt FROM trials
     WHERE expires_at >= date('now') AND expires_at <= date('now', '+' || ? || ' days')
     ORDER BY expires_at ASC`,
    [days],
  )
}
