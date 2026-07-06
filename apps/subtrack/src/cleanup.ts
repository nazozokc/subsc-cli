/**
 * One-command database cleanup: integrity check + VACUUM + prune audit + prune tags.
 */

import { consola } from "consola"
import { statSync } from "node:fs"
import { getDb, saveDb, getDbPath } from "./db.ts"
import { pruneAuditLogs } from "./db.ts"
import { pruneTags } from "./db.ts"
import { logAudit } from "./audit.ts"

export type CleanupOptions = {
  vacuum?: boolean
  auditDays?: number
  json?: boolean
}

export function handleCleanup(options: CleanupOptions = {}): void {
  const db = getDb()
  const results: Record<string, unknown> = {}
  const doVacuum = options.vacuum ?? true
  const auditDays = options.auditDays ?? 90

  // ── Integrity check ─────────────────────────────────
  const integrityResult = db.exec("PRAGMA integrity_check")
  const checkResult = integrityResult.length > 0 && integrityResult[0].values.length > 0
    ? String(integrityResult[0].values[0][0])
    : "ok"
  const integrityOk = checkResult === "ok"

  if (options.json) {
    results.integrityCheck = integrityOk ? "passed" : checkResult
  } else if (integrityOk) {
    consola.success("Integrity check: passed")
  } else {
    consola.error(`Integrity check: FAILED — ${checkResult}`)
  }

  // ── VACUUM ───────────────────────────────────────────
  if (doVacuum && integrityOk) {
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
      results.vacuum = { beforeBytes: beforeSize, afterBytes: afterSize, savedBytes: saved }
    } else if (saved > 0) {
      consola.success(`VACUUM: ${formatBytes(beforeSize)} → ${formatBytes(afterSize)} (freed ${formatBytes(saved)})`)
    } else {
      consola.info("VACUUM: no space reclaimed (already optimized)")
    }
  }

  // ── Prune audit logs ────────────────────────────────
  const beforeDate = new Date(Date.now() - auditDays * 24 * 60 * 60 * 1000)
  const beforeStr = beforeDate.toISOString().replace("T", " ").slice(0, 19)
  const prunedAudit = pruneAuditLogs(beforeStr)
  if (options.json) {
    results.auditPruned = prunedAudit
  } else if (prunedAudit > 0) {
    consola.success(`Pruned ${prunedAudit} audit log entr${prunedAudit > 1 ? "ies" : "y"} older than ${auditDays} days`)
  } else {
    consola.info("Audit log: nothing to prune")
  }

  // ── Prune orphaned tags ─────────────────────────────
  const prunedTags = pruneTags()
  if (options.json) {
    results.tagsPruned = prunedTags
  } else if (prunedTags > 0) {
    consola.success(`Removed ${prunedTags} orphaned tag${prunedTags > 1 ? "s" : ""}`)
  } else {
    consola.info("Tags: no orphans found")
  }

  logAudit("cleanup", {
    targetType: "database",
    details: `integrity=${checkResult}, vacuum=${doVacuum}, audit_pruned=${prunedAudit}, tags_pruned=${prunedTags}`,
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n")
  }
}

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

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
