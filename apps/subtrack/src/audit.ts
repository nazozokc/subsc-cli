/**
 * Audit log command handler.
 *
 * Provides `subtrack audit [list|prune]` for viewing and managing
 * the audit trail of all mutating operations.
 */

import { consola } from "consola"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import { getAuditLogs, getAuditLogCount, pruneAuditLogs, addAuditLog } from "./db/audit.ts"
import type { AuditAction, AddAuditArgs } from "./db/audit.ts"
import { TABLE_CHARS, getTableStyle, calcColumnWidths, zebraRow } from "./display-constants.ts"
import type { ColumnConfig } from "./display-constants.ts"
import { SHORT_MONTH_NAMES, pad2 } from "./date-utils.ts"

// ── Audit log display ───────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  "subscription.add": "Add",
  "subscription.edit": "Edit",
  "subscription.delete": "Delete",
  "subscription.archive": "Archive",
  "subscription.unarchive": "Unarchive",
  "subscription.restore": "Restore",
  "subscription.import": "Import",
  "subscription.bulk_status": "Bulk Status",
  "subscription.bulk_delete": "Bulk Delete",
  "subscription.bulk_tag_add": "Bulk Tag+",
  "subscription.bulk_tag_remove": "Bulk Tag-",
  "subscription.clone": "Clone",
  "trial.add": "Trial Add",
  "trial.delete": "Trial Delete",
  "tag.rename": "Tag Rename",
  "tag.delete": "Tag Delete",
  "tag.prune": "Tag Prune",
  "tag.merge": "Tag Merge",
  "config.set": "Config Set",
  "config.reset": "Config Reset",
  "backup.restore": "Restore",
  "usage.add": "Usage Add",
  "usage.delete": "Usage Delete",
  "cleanup": "Cleanup",
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function formatTimestamp(ts: string): string {
  // "2026-07-05 12:34:56" → "Jul 05 12:34"
  const d = new Date(ts + "Z")
  if (isNaN(d.getTime())) return ts
  return `${SHORT_MONTH_NAMES[d.getMonth()]} ${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// ── Command handlers ────────────────────────────────────

export function handleAuditList(options: {
  action?: string
  limit?: number
  json?: boolean
  from?: string
  to?: string
}): void {
  const entries = getAuditLogs({
    action: options.action,
    limit: options.limit ?? 50,
    from: options.from,
    to: options.to,
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + "\n")
    return
  }

  if (entries.length === 0) {
    consola.info("No audit log entries found")
    return
  }

  const total = getAuditLogCount({ action: options.action, from: options.from, to: options.to })

  const headers = ["ID", "Action", "Target", "Details"] as const
  const AUDIT_COLS: ColumnConfig = {
    headers,
    minWidths: [6, 14, 18, 30] as const,
    maxWidths: [8, 20, 30, 80] as const,
  }
  const colWidths = calcColumnWidths(entries.map((e) => [String(e.id), formatAction(e.action), e.target_type ?? "", e.details ?? ""]), AUDIT_COLS)

  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: getTableStyle(),
    colWidths: colWidths,
    head: [...headers],
    colAligns: ["right", "left", "left", "left"],
  })

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const action = formatAction(e.action)
    const target = e.target_type
      ? `${e.target_type}${e.target_id ? ` #${e.target_id}` : ""}`
      : ""
    const details = e.details
      ? e.details.length > 60
        ? e.details.slice(0, 57) + "..."
        : e.details
      : ""
    const ts = formatTimestamp(e.created_at)
    const row = [String(e.id), action, target, `${ts} ${details}`]
    if (i % 2 === 0) {
      table.push(zebraRow(row))
    } else {
      table.push(row)
    }
  }

  consola.log(table.toString())
  consola.log(pc.dim(`  ${total} total entries · showing ${entries.length}`))
}

export function handleAuditPrune(options: {
  days?: number
  force?: boolean
  json?: boolean
}): void {
  const days = options.days ?? 90
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const beforeStr = before.toISOString().replace("T", " ").slice(0, 19)

  const count = getAuditLogCount({ to: beforeStr })

  if (count === 0) {
    consola.info(`No audit log entries older than ${days} days`)
    return
  }

  if (!options.force) {
    consola.warn(
      `This will delete ${count} audit log entr${count !== 1 ? "ies" : "y"} older than ${days} days.\n` +
      `  Use --force to proceed.`,
    )
    return
  }

  const deleted = pruneAuditLogs(beforeStr)
  consola.success(`Pruned ${deleted} audit log entr${deleted !== 1 ? "ies" : "y"}`)
}

// ── Integration helper ──────────────────────────────────

/**
 * Convenience function to log an audit entry from command handlers.
 * Re-exported for easy use across the codebase.
 */
export function logAudit(action: AuditAction, args: Omit<AddAuditArgs, "action"> = {}): void {
  addAuditLog({ action, ...args })
}
