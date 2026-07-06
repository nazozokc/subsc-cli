/**
 * Database maintenance command.
 *
 * Provides `subtrack maintenance` to run VACUUM, integrity check,
 * and other DB health operations.
 */

import { consola } from "consola"
import { statSync } from "node:fs"
import { getDb, saveDb, getDbPath } from "./db.ts"
import { logAudit } from "./audit.ts"

export type MaintenanceOptions = {
  vacuum?: boolean
  check?: boolean
  json?: boolean
}

export function handleMaintenance(options: MaintenanceOptions = {}): void {
  const db = getDb()
  const results: Record<string, unknown> = {}

  // Default: integrity check only
  const doCheck = options.check ?? true
  const doVacuum = options.vacuum ?? false

  // ── Integrity check ─────────────────────────────────
  if (doCheck) {
    const integrityResult = db.exec("PRAGMA integrity_check")
    const checkResult = integrityResult.length > 0 && integrityResult[0].values.length > 0
      ? String(integrityResult[0].values[0][0])
      : "ok"

    if (options.json) {
      results.integrityCheck = checkResult === "ok" ? "passed" : checkResult
    } else if (checkResult === "ok") {
      consola.success("Integrity check: passed")
    } else {
      consola.error(`Integrity check: FAILED — ${checkResult}`)
      consola.warn(
        "Database integrity issues detected.\n" +
        "  Run 'subtrack backup' immediately, then restore from a known-good backup.",
      )
    }
  }

  // ── VACUUM ───────────────────────────────────────────
  if (doVacuum) {
    const beforeSize = getFileSize(getDbPath())

    try {
      db.run("VACUUM")
      saveDb()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (options.json) {
        results.vacuum = { error: msg }
      } else {
        consola.error(`VACUUM failed: ${msg}`)
      }
      return
    }

    const afterSize = getFileSize(getDbPath())
    const saved = beforeSize - afterSize

    if (options.json) {
      results.vacuum = {
        beforeBytes: beforeSize,
        afterBytes: afterSize,
        savedBytes: saved,
      }
    } else {
      if (saved > 0) {
        consola.success(
          `VACUUM complete: ${formatBytes(beforeSize)} → ${formatBytes(afterSize)} (freed ${formatBytes(saved)})`,
        )
      } else {
        consola.info("VACUUM complete: no space reclaimed (database already optimized)")
      }
    }

    logAudit("subscription.edit", {
      targetType: "database",
      details: `VACUUM: ${formatBytes(beforeSize)} → ${formatBytes(afterSize)}`,
    })
  }

  // ── Output ───────────────────────────────────────────
  if (options.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n")
  }
}

/** Get file size in bytes, or 0 if not accessible. */
function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

/** Format bytes to human-readable string. */
function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
