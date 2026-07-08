/**
 * Database maintenance command.
 *
 * Provides `subtrack maintenance` to run VACUUM, integrity check,
 * and other DB health operations.
 */

import { consola } from "consola"
import { statSync } from "node:fs"
import { getDbPath, runMaintenance } from "./db.ts"

export type MaintenanceOptions = {
  vacuum?: boolean
  check?: boolean
  json?: boolean
}

export function handleMaintenance(options: MaintenanceOptions = {}): void {
  const results: Record<string, unknown> = {}

  // Default: integrity check only
  const doCheck = options.check ?? true
  const doVacuum = options.vacuum ?? false

  // ── Run native maintenance ──────────────────────────
  const maintenance = runMaintenance({
    vacuum: doVacuum,
    check: doCheck,
  })

  // ── Integrity check ─────────────────────────────────
  if (doCheck) {
    const checkResult = maintenance.integrityMessage ?? "ok"
    const integrityOk = maintenance.integrityOk !== false

    if (options.json) {
      results.integrityCheck = checkResult === "ok" || !maintenance.integrityOk ? "passed" : checkResult
    } else if (integrityOk) {
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
    const vacOk = maintenance.vacuumOk !== false

    if (!vacOk) {
      const msg = maintenance.vacuumMessage ?? "VACUUM failed"
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
