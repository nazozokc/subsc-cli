import { checkbox, confirm } from "@inquirer/prompts"
import { consola } from "consola"
import { fail } from "./error.ts"
import type { LlmUsageEntry } from "./types.ts"
import { usageRepository } from "./application/repositories.ts"
import { logAudit } from "./audit.ts"
import { renderUsageTable } from "./display.ts"
import { formatUsdCost } from "./price.ts"
import { writeJson } from "./presentation/output.ts"

export { handleUsageAdd } from "./usage-add.ts"
export { handleUsageImport } from "./usage-import.ts"
export { handleUsageRefresh } from "./usage-refresh.ts"
export { handleUsageTotal } from "./usage-total.ts"
export { handleUsageEdit } from "./usage-edit.ts"

export async function handleUsageList(
  options: { provider?: string; from?: string; to?: string; json?: boolean; limit?: number; offset?: number },
) {
  const entries = usageRepository.list({
    provider: options.provider,
    from: options.from,
    to: options.to,
    limit: options.limit ?? 100,
    offset: options.offset,
    minCost: 0,
  })

  if (options.json) {
    writeJson(entries)
    return
  }

  renderUsageTable(entries)
}

// ── Delete ──────────────────────────────────────────────

export async function handleUsageDelete(ids?: number[]) {
  if (ids && ids.length > 0) {
    for (const id of ids) {
      const deleted = usageRepository.remove(id)
      if (deleted) {
        logAudit("usage.delete", { targetType: "usage", targetId: id })
        consola.success(`Deleted usage entry: ${id}`)
      } else {
        fail(`Usage entry with id ${id} not found`)
      }
    }
    return
  }

  const all = usageRepository.list({ limit: 500 })

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
    usageRepository.remove(entry.id)
    logAudit("usage.delete", {
      targetType: "usage",
      targetId: entry.id,
      details: `${entry.provider}/${entry.model} (${entry.date})`,
    })
    consola.success(`Deleted: ${entry.provider}/${entry.model} (${entry.date})`)
  }
}
