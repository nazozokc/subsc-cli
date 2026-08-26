import { consola } from "consola"
import pc from "picocolors"
import { getAuditLogs } from "./db/audit.ts"
import { getAllPriceChanges, getSubscriptions } from "./db.ts"
import type { SharedArgs } from "./types.ts"

export type CheckFinding = { code: string; severity: "warning" | "error"; message: string; id?: number }

/** Check subscription records for actionable data-quality problems. */
export function handleCheck(options: { json?: boolean; strict?: boolean } = {}): void {
  const findings: CheckFinding[] = []
  const subs = getSubscriptions({ includeArchived: true })
  const names = new Map<string, SharedArgs[]>()
  const today = new Date().toISOString().slice(0, 10)
  for (const sub of subs) {
    const key = sub.name.trim().toLowerCase()
    names.set(key, [...(names.get(key) ?? []), sub])
    if (sub.status === "active" && sub.billingDay === null) findings.push({ code: "missing-billing-day", severity: "warning", message: `${sub.name} has no billing day`, id: sub.id })
    if (sub.contractStart && sub.contractEnd && sub.contractStart > sub.contractEnd) findings.push({ code: "invalid-contract-range", severity: "error", message: `${sub.name} contract start is after contract end`, id: sub.id })
    if (sub.contractEnd && sub.contractEnd < today) findings.push({ code: "expired-contract", severity: "warning", message: `${sub.name} contract ended on ${sub.contractEnd}`, id: sub.id })
  }
  for (const [name, group] of names) if (name && group.length > 1) findings.push({ code: "duplicate-name", severity: "warning", message: `Duplicate subscription name: ${group.map((s) => s.name).join(", ")}` })
  if (options.json) process.stdout.write(JSON.stringify(findings, null, 2) + "\n")
  else if (!findings.length) consola.success("No problems found")
  else for (const finding of findings) consola.log(`${finding.severity === "error" ? pc.red("error") : pc.yellow("warning")}: ${finding.message}`)
  if (options.strict && findings.length) process.exitCode = 1
}

/** Show audit and price-history changes as one chronological stream. */
export function handleChanges(options: { id?: number; from?: string; to?: string; limit?: number; json?: boolean } = {}): void {
  const limit = options.limit ?? 50
  const audit = getAuditLogs({ from: options.from, to: options.to, limit }).filter((entry) => options.id === undefined || entry.target_id === options.id)
  const prices = getAllPriceChanges().filter((entry) => {
    const date = entry.changedAt.slice(0, 10)
    return (options.id === undefined || entry.subscriptionId === options.id) &&
      (!options.from || date >= options.from) && (!options.to || date <= options.to)
  }).map((entry) => ({ type: "price", date: entry.changedAt, id: entry.subscriptionId, details: `${entry.subscriptionName}: ${entry.oldPrice ?? "—"} → ${entry.newPrice}` }))
  const result = [...audit.map((entry) => ({ type: "audit", date: entry.created_at, id: entry.target_id, details: `${entry.action}: ${entry.details ?? ""}` })), ...prices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  if (options.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n")
  else if (!result.length) consola.info("No changes found")
  else for (const entry of result) consola.log(`${pc.dim(entry.date)}  ${entry.details}`)
}
