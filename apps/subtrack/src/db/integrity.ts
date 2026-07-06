/**
 * Database integrity verification module.
 *
 * Tracks the SHA-256 hash of the SQLite database (after encryption)
 * to detect tampering, corruption, or unintended modifications.
 *
 * Flow:
 *   on saveDb()   → compute hash of encrypted blob, write `<dbPath>.sha256`
 *   on loadDb()   → verify hash before decrypting
 *   on mismatch   → backup current DB, warn user, proceed if forced
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { createHash } from "node:crypto"
import { consola } from "consola"

function getDbHashPath(dbFilePath: string): string {
  return `${dbFilePath}.sha256`
}

// ── Hash operations ───────────────────────────────────────

/**
 * Compute SHA-256 hex digest of a buffer.
 */
function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * Write the SHA-256 hash of the database file as a sidecar.
 * Called after every saveDb().
 */
export function writeDbHash(encryptedData: Buffer, dbFilePath?: string): void {
  if (!dbFilePath) return // skip if path unknown (test mode)
  const hashPath = getDbHashPath(dbFilePath)
  const digest = sha256(encryptedData)
  writeFileSync(hashPath, digest + "\n", { mode: 0o600 })
}

/**
 * Verify the SHA-256 hash of the database file.
 *
 * Returns an object with the verification result.
 * - `ok`: true if the hash matches or no sidecar exists (fresh DB)
 * - `expected`: the expected hash from the sidecar (or null)
 * - `actual`: the computed hash of the current file (or null)
 */
export function verifyDbHash(encryptedData: Buffer, dbFilePath?: string): {
  ok: boolean
  expected: string | null
  actual: string | null
} {
  if (!dbFilePath) return { ok: true, expected: null, actual: null }

  const hashPath = getDbHashPath(dbFilePath)

  if (!existsSync(hashPath)) {
    // No sidecar yet — first run or migration. Create one.
    writeDbHash(encryptedData, dbFilePath)
    return { ok: true, expected: null, actual: sha256(encryptedData) }
  }

  const expected = readFileSync(hashPath, "utf-8").trim()
  const actual = sha256(encryptedData)
  return { ok: expected === actual, expected, actual }
}

/**
 * Remove the hash sidecar (used when DB file is deleted/replaced).
 */
export function removeDbHash(dbFilePath?: string): void {
  if (!dbFilePath) return
  const hashPath = getDbHashPath(dbFilePath)
  if (existsSync(hashPath)) {
    try {
      unlinkSync(hashPath)
    } catch { /* best-effort */ }
  }
}

/**
 * Compute a content hash for an unencrypted SQLite buffer.
 * Used for dedup detection and snapshot comparison.
 */
export function contentHash(sqliteData: Buffer): string {
  return sha256(sqliteData)
}
