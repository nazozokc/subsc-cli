import { checkbox, confirm } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "./error.ts"
import type { LlmUsageEntry } from "./types.ts"
import { getLlmUsage, deleteLlmUsage } from "./db.ts"
import { logAudit } from "./audit.ts"
import { renderUsageTable } from "./display.ts"
import { formatUsdCost } from "./price.ts"

export { handleUsageAdd } from "./usage-add.ts"
export { handleUsageImport } from "./usage-import.ts"
export { handleUsageRefresh } from "./usage-refresh.ts"
export { handleUsageTotal } from "./usage-total.ts"
export { handleUsageEdit } from "./usage-edit.ts"

export async function handleUsageList(
  options: { provider?: string; from?: string; to?: string; json?: boolean; limit?: number; offset?: number },
) {
  const entries = getLlmUsage({
    provider: options.provider,
    from: options.from,
    to: options.to,
    limit: options.limit ?? 100,
    offset: options.offset,
    minCost: 0,
  })

  if (options.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + "\n")
    return
  }

  renderUsageTable(entries)
}

// ── Delete ──────────────────────────────────────────────

export async function handleUsageDelete(ids?: number[]) {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      const deleted = deleteLlmUsage(id)
      if (deleted) {
        logAudit("usage.delete", { targetType: "usage", targetId: id })
        consola.success(`Deleted usage entry: ${id}`)
      } else {
        fail(`Usage entry with id ${id} not found`)
      }
    }
    return
  }

  const all = getLlmUsage({ limit: 500 })

  if (all.length === 0) {
    consola.info("No usage entries found")
    return
  }

  const selected = await checkbox({
    message: "Select usage entries to delete",
    choices: all.map((e: LlmUsageEntry) => ({
      name: `${e.date}  ${e.provider}/${e.model}  ${e.input_tokens.toLocaleString()} in / ${e.output_tokens.toLocaleString()} out  ${formatUsdCost(e.cost)}${e.description ? `  — ${e.description}` : ""}`,
      value: e,
    })),
    loop: false,
    pageSize: 15,
  })

  if (selected.length === 0) {
    consola.info("Cancelled")
    return
  }

  const ok = await confirm({
    message: `Delete ${selected.length} usage entr${selected.length > 1 ? "ies" : "y"}?`,
    default: false,
  })

  if (!ok) {
    consola.info("Cancelled")
    return
  }

  for (const entry of selected) {
    deleteLlmUsage(entry.id)
    logAudit("usage.delete", {
      targetType: "usage",
      targetId: entry.id,
      details: `${entry.provider}/${entry.model} (${entry.date})`,
    })
    consola.success(`Deleted: ${entry.provider}/${entry.model} (${entry.date})`)
  }
}
