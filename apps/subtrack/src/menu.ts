/**
 * Interactive main menu shown when running `subtrack` without a subcommand.
 * Covers every CLI command — organized into category sub-menus.
 * Built with @inquirer/prompts; handlers are called with empty flags so they
 * run in their interactive mode (consistent with the "interactive by default"
 * tenet).
 */

import { checkbox, confirm, input, select } from "@inquirer/prompts"
import { consola } from "consola"
import pc from "picocolors"
import { getAllTags, getSubscriptions, getDbPath } from "./db.ts"
import { handleList, handleDelete, handleTags, handleClone, handleArchive, handleUnarchive } from "./subscription/core.ts"
import { handleAdd } from "./subscription/add.ts"
import { handleEdit } from "./subscription/edit.ts"
import { handleSearch } from "./search.ts"
import { handleUpcoming } from "./upcoming.ts"
import { handleCalendar } from "./calendar.ts"
import { handleHistory } from "./history.ts"
import { handleTimeline } from "./timeline.ts"
import { handleStats } from "./stats.ts"
import { handleTrialAdd, handleTrialList, handleTrialExpiring, handleTrialDelete } from "./trial.ts"
import { handleSuggestList, handleSuggestReview, handleSuggestDismiss } from "./suggest/suggest.ts"
import { handleSuggestScan } from "./suggest/scan.ts"
import { handleBulkStatus, handleBulkDelete, handleBulkTagAdd, handleBulkTagRemove } from "./bulk.ts"
import { handleTagList, handleTagRename, handleTagDelete, handleTagPrune, handleTagMerge } from "./tag.ts"
import { handlePayment, handleSummary } from "./payment.ts"
import { handleAnalytics } from "./analytics.ts"
import { handleCompare } from "./compare.ts"
import { handleForecast } from "./forecast.ts"
import { handleOptimize } from "./optimize.ts"
import { handleNotify } from "./notify.ts"
import { handleExport } from "./export.ts"
import { handleImport } from "./import-csv.ts"
import { handleBackup, handleRestore } from "./backup.ts"
import { handleMaintenance } from "./maintenance.ts"
import { handleCleanup } from "./cleanup.ts"
import { handleAuditList, handleAuditPrune } from "./audit.ts"
import { handleUsageAdd } from "./usage-add.ts"
import { handleUsageDelete, handleUsageList } from "./usage.ts"
import { handleUsageImport } from "./usage-import.ts"
import { handleUsageRefresh } from "./usage-refresh.ts"
import { handleUsageTotal } from "./usage-total.ts"
import { handleConfigGet, handleConfigList, handleConfigReset, handleConfigSet } from "./config.ts"
import { handleProfile } from "./profile.ts"
import { handleCurrencyList } from "./currency.ts"
import { handleMcp } from "./commands.ts"
import { CYCLE_CHOICES } from "./prompts.ts"
import { formatPrice } from "./price.ts"
import { divider } from "./display-constants.ts"
import type { Cycle, Status } from "./types.ts"

type MainChoice = "view" | "add" | "manage" | "report" | "data" | "config" | "system" | "quit"

/** Show the subtrack header (title, version, subscription count, DB path). */
function showMenuHeader(): void {
  const pkg = require("../package.json") as { version: string }
  const count = getSubscriptions().length
  console.log(pc.bold(pc.cyan(`subtrack v${pkg.version}`)))
  console.log(
    pc.dim(
      `  ${count} subscription${count === 1 ? "" : "s"} · ${getDbPath()}`,
    ),
  )
  console.log(divider(52))
  console.log("")
}

export async function handleMenu(): Promise<void> {
  showMenuHeader()
  while (true) {
    const choice = await select<MainChoice>({
      message: "subtrack — choose a category",
      pageSize: 10,
      choices: [
        { name: "View & Search", description: "List, search, tag filter, upcoming, calendar, history, timeline, stats", value: "view" },
        { name: "Add & Edit", description: "Add, edit, clone, import CSV, trials, suggestions", value: "add" },
        { name: "Manage", description: "Delete, archive, bulk operations, tag management, cleanup", value: "manage" },
        { name: "Reports", description: "Summary, payment, analytics, compare, forecast, optimize, notify", value: "report" },
        { name: "Data", description: "Export, backup, restore, maintenance, audit, LLM usage", value: "data" },
        { name: "Config", description: "Configuration, filter profiles, currencies", value: "config" },
        { name: "System", description: "MCP server", value: "system" },
        { name: "Quit", description: "Exit subtrack", value: "quit" },
      ],
    })

    switch (choice) {
      case "view": await runViewMenu(); break
      case "add": await runAddMenu(); break
      case "manage": await runManageMenu(); break
      case "report": await runReportMenu(); break
      case "data": await runDataMenu(); break
      case "config": await runConfigMenu(); break
      case "system": await runSystemMenu(); break
      case "quit": return
    }
  }
}

// ── Shared helpers ────────────────────────────────────

const BACK = { name: "← Back", value: "back" } as const

async function pickSubscription(message: string, status?: Status): Promise<number | null> {
  const subs = getSubscriptions({ includeArchived: true })
    .filter((s) => status === undefined || s.status === status)
  if (subs.length === 0) {
    consola.info("No subscriptions found")
    return null
  }
  return select({
    message,
    pageSize: 10,
    loop: false,
    choices: subs.map((s) => ({
      name: `#${s.id} ${s.name} — ${formatPrice(s.price, s.currency)}/${s.cycle}${s.status !== "active" ? ` (${s.status})` : ""}`,
      value: s.id,
    })),
  })
}

async function pickTag(message: string): Promise<string | null> {
  const tags = getAllTags()
  if (tags.length === 0) {
    consola.info("No tags found")
    return null
  }
  return select({
    message,
    pageSize: 10,
    choices: tags.map((t) => ({ name: t, value: t })),
  })
}

async function pickPeriod(message = "select period"): Promise<Cycle> {
  return select<Cycle>({ message, choices: CYCLE_CHOICES })
}

// ── View & Search ─────────────────────────────────────

async function runViewMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "view & search",
      pageSize: 10,
      choices: [
        { name: "List", description: "Show all subscriptions", value: "list" },
        { name: "Search", description: "Search by name, notes, or tags", value: "search" },
        { name: "Tag filter", description: "Filter subscriptions by tags (AND)", value: "tags" },
        { name: "Upcoming", description: "Upcoming bills within 7 days", value: "upcoming" },
        { name: "Calendar", description: "Monthly calendar with billing days", value: "calendar" },
        { name: "History", description: "Price change history", value: "history" },
        { name: "Timeline", description: "Monthly spending timeline", value: "timeline" },
        { name: "Stats", description: "Database statistics", value: "stats" },
        BACK,
      ],
    })

    switch (action) {
      case "list": await handleList({}); break
      case "search": await handleSearch(undefined); break
      case "tags": await runTagFilter(); break
      case "upcoming": await handleUpcoming(); break
      case "calendar": await handleCalendar({}); break
      case "history": {
        const id = await pickSubscription("select subscription")
        if (id !== null) await handleHistory(id)
        break
      }
      case "timeline": await handleTimeline(); break
      case "stats": await handleStats(); break
      case "back": return
    }
  }
}

async function runTagFilter(): Promise<void> {
  const tags = getAllTags()
  if (tags.length === 0) {
    consola.info("No tags found")
    return
  }
  const selected = await checkbox({
    message: "select tags (AND logic)",
    pageSize: 10,
    choices: tags.map((t) => ({ name: t, value: t })),
  })
  if (selected.length === 0) return
  await handleTags(selected)
}

// ── Add & Edit ────────────────────────────────────────

async function runAddMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "add & edit",
      pageSize: 10,
      choices: [
        { name: "Add", description: "Add a new subscription", value: "add" },
        { name: "Edit", description: "Edit a subscription", value: "edit" },
        { name: "Clone", description: "Clone an existing subscription", value: "clone" },
        { name: "Import", description: "Import subscriptions from CSV", value: "import" },
        { name: "Trials", description: "Manage free trials", value: "trial" },
        { name: "Suggestions", description: "Review suggestions from email scans", value: "suggest" },
        BACK,
      ],
    })

    switch (action) {
      case "add": await handleAdd({}); break
      case "edit": await handleEdit(); break
      case "clone": {
        const id = await pickSubscription("select subscription to clone")
        if (id !== null) await handleClone(id)
        break
      }
      case "import": {
        const file = await input({ message: "CSV file path:", validate: (v) => v.trim().length > 0 || "Path required" })
        await handleImport(file, {})
        break
      }
      case "trial": await runTrialMenu(); break
      case "suggest": await runSuggestMenu(); break
      case "back": return
    }
  }
}

async function runTrialMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "trials",
      pageSize: 10,
      choices: [
        { name: "Add", description: "Register a free trial", value: "add" },
        { name: "List", description: "List all trials", value: "list" },
        { name: "Expiring", description: "Trials expiring within 7 days", value: "expiring" },
        { name: "Delete", description: "Delete trials", value: "delete" },
        BACK,
      ],
    })

    switch (action) {
      case "add": await handleTrialAdd({}); break
      case "list": handleTrialList(); break
      case "expiring": handleTrialExpiring(); break
      case "delete": await handleTrialDelete(); break
      case "back": return
    }
  }
}

async function runSuggestMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "suggestions",
      pageSize: 10,
      choices: [
        { name: "List", description: "List pending suggestions", value: "list" },
        { name: "Review", description: "Review suggestions and add as subscriptions", value: "review" },
        { name: "Dismiss", description: "Dismiss a suggestion by id", value: "dismiss" },
        { name: "Scan", description: "Scan email sources for new suggestions", value: "scan" },
        BACK,
      ],
    })

    switch (action) {
      case "list": handleSuggestList(); break
      case "review": await handleSuggestReview(); break
      case "dismiss": {
        const id = Number(await input({ message: "suggestion id (see suggestions list):", validate: (v) => (Number.isInteger(Number(v)) && Number(v) > 0) || "Valid id required" }))
        handleSuggestDismiss(id)
        break
      }
      case "scan": await handleSuggestScan(); break
      case "back": return
    }
  }
}

// ── Manage ────────────────────────────────────────────

async function runManageMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "manage",
      pageSize: 10,
      choices: [
        { name: "Delete", description: "Delete subscriptions", value: "delete" },
        { name: "Archive", description: "Archive a subscription", value: "archive" },
        { name: "Unarchive", description: "Unarchive a subscription", value: "unarchive" },
        { name: "Bulk", description: "Bulk status / delete / tag operations", value: "bulk" },
        { name: "Tags", description: "Tag list, rename, delete, prune, merge", value: "tag" },
        { name: "Cleanup", description: "Integrity check, VACUUM, prune audit/tags", value: "cleanup" },
        BACK,
      ],
    })

    switch (action) {
      case "delete": await handleDelete(); break
      case "archive": {
        const id = await pickSubscription("select subscription to archive")
        if (id !== null) handleArchive(id)
        break
      }
      case "unarchive": {
        const id = await pickSubscription("select subscription to unarchive", "archived")
        if (id !== null) handleUnarchive(id)
        break
      }
      case "bulk": await runBulkMenu(); break
      case "tag": await runTagMenu(); break
      case "cleanup": {
        const ok = await confirm({ message: "Run cleanup (integrity check, VACUUM, prune audit/tags)?", default: false })
        if (ok) handleCleanup()
        break
      }
      case "back": return
    }
  }
}

async function runBulkMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "bulk operations",
      pageSize: 10,
      choices: [
        { name: "Set status", description: "Change status of matching subscriptions", value: "status" },
        { name: "Delete", description: "Delete matching subscriptions", value: "delete" },
        { name: "Add tag", description: "Add a tag to matching subscriptions", value: "tag-add" },
        { name: "Remove tag", description: "Remove a tag from matching subscriptions", value: "tag-remove" },
        BACK,
      ],
    })

    switch (action) {
      case "status": {
        const status = await select<Status>({
          message: "target status",
          choices: [
            { name: "active", value: "active" },
            { name: "paused", value: "paused" },
            { name: "cancelled", value: "cancelled" },
            { name: "archived", value: "archived" },
          ],
        })
        await handleBulkStatus(status, {}, {})
        break
      }
      case "delete": await handleBulkDelete({}, {}); break
      case "tag-add": {
        const tag = await input({ message: "tag to add:", validate: (v) => v.trim().length > 0 || "Tag required" })
        await handleBulkTagAdd(tag.trim(), {})
        break
      }
      case "tag-remove": {
        const tag = await input({ message: "tag to remove:", validate: (v) => v.trim().length > 0 || "Tag required" })
        await handleBulkTagRemove(tag.trim(), {})
        break
      }
      case "back": return
    }
  }
}

async function runTagMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "tag management",
      pageSize: 10,
      choices: [
        { name: "List", description: "List all tags with usage counts", value: "list" },
        { name: "Rename", description: "Rename a tag", value: "rename" },
        { name: "Delete", description: "Delete a tag", value: "delete" },
        { name: "Prune", description: "Remove unused tags", value: "prune" },
        { name: "Merge", description: "Merge one tag into another", value: "merge" },
        BACK,
      ],
    })

    switch (action) {
      case "list": handleTagList(); break
      case "rename": {
        const oldName = await pickTag("select tag to rename")
        if (oldName === null) break
        const newName = await input({ message: "new name:", validate: (v) => v.trim().length > 0 || "Name required" })
        handleTagRename(oldName, newName.trim())
        break
      }
      case "delete": {
        const name = await pickTag("select tag to delete")
        if (name === null) break
        handleTagDelete(name)
        break
      }
      case "prune": handleTagPrune(); break
      case "merge": {
        const source = await pickTag("select tag to merge from")
        if (source === null) break
        const target = await pickTag("select tag to merge into")
        if (target === null) break
        if (source !== target) handleTagMerge(source, target)
        break
      }
      case "back": return
    }
  }
}

// ── Reports ───────────────────────────────────────────

async function runReportMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "reports",
      pageSize: 10,
      choices: [
        { name: "Summary", description: "Subscription summary statistics", value: "summary" },
        { name: "Payment", description: "Payment totals for a period", value: "payment" },
        { name: "Analytics", description: "Detailed subscription analytics", value: "analytics" },
        { name: "Compare", description: "Compare spending with previous period", value: "compare" },
        { name: "Forecast", description: "Spending forecast with what-if scenarios", value: "forecast" },
        { name: "Optimize", description: "Cost optimization suggestions", value: "optimize" },
        { name: "Notify", description: "Desktop notification for upcoming bills", value: "notify" },
        BACK,
      ],
    })

    switch (action) {
      case "summary": await handleSummary(); break
      case "payment": await handlePayment(await pickPeriod("select period"), {}); break
      case "analytics": handleAnalytics(); break
      case "compare": await handleCompare(await pickPeriod("select period")); break
      case "forecast": await handleForecast({}); break
      case "optimize": await handleOptimize(); break
      case "notify": await handleNotify(); break
      case "back": return
    }
  }
}

// ── Data ──────────────────────────────────────────────

async function runDataMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "data",
      pageSize: 10,
      choices: [
        { name: "Export", description: "Export subscriptions (csv/json/md/excel/ics)", value: "export" },
        { name: "Backup", description: "Back up the database", value: "backup" },
        { name: "Restore", description: "Restore database from a backup file", value: "restore" },
        { name: "Maintenance", description: "VACUUM and integrity check", value: "maintenance" },
        { name: "Audit", description: "Audit log list / prune", value: "audit" },
        { name: "LLM usage", description: "Track LLM API usage costs", value: "usage" },
        BACK,
      ],
    })

    switch (action) {
      case "export": {
        const format = await select({
          message: "select export format",
          choices: [
            { name: "csv", value: "csv" },
            { name: "json", value: "json" },
            { name: "md", value: "md" },
            { name: "excel", value: "excel" },
            { name: "ics", value: "ics" },
          ],
        })
        await handleExport(format, {})
        break
      }
      case "backup": await handleBackup(); break
      case "restore": {
        const file = await input({ message: "backup file path:", validate: (v) => v.trim().length > 0 || "Path required" })
        await handleRestore(file)
        break
      }
      case "maintenance": handleMaintenance(); break
      case "audit": await runAuditMenu(); break
      case "usage": await runUsageMenu(); break
      case "back": return
    }
  }
}

async function runAuditMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "audit log",
      pageSize: 10,
      choices: [
        { name: "List", description: "View the audit log", value: "list" },
        { name: "Prune", description: "Delete entries older than 90 days", value: "prune" },
        BACK,
      ],
    })

    switch (action) {
      case "list": handleAuditList({}); break
      case "prune": {
        const ok = await confirm({ message: "Delete audit log entries older than 90 days?", default: false })
        if (ok) handleAuditPrune({ force: true })
        break
      }
      case "back": return
    }
  }
}

async function runUsageMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "LLM usage",
      pageSize: 10,
      choices: [
        { name: "Add", description: "Record LLM API usage", value: "add" },
        { name: "List", description: "List usage entries", value: "list" },
        { name: "Delete", description: "Delete usage entries", value: "delete" },
        { name: "Import", description: "Import from JSONL/JSON logs", value: "import" },
        { name: "Refresh", description: "Auto-scan AI tool logs", value: "refresh" },
        { name: "Total", description: "Aggregated cost summary", value: "total" },
        BACK,
      ],
    })

    switch (action) {
      case "add": await handleUsageAdd({}); break
      case "list": await handleUsageList({}); break
      case "delete": await handleUsageDelete(); break
      case "import": {
        const file = await input({ message: "log file path:", validate: (v) => v.trim().length > 0 || "Path required" })
        await handleUsageImport({ file })
        break
      }
      case "refresh": await handleUsageRefresh(); break
      case "total": handleUsageTotal(); break
      case "back": return
    }
  }
}

// ── Config ────────────────────────────────────────────

async function runConfigMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "config",
      pageSize: 10,
      choices: [
        { name: "Config", description: "List / get / set / reset configuration", value: "config" },
        { name: "Profiles", description: "Save / switch / list / show / delete filter profiles", value: "profile" },
        { name: "Currencies", description: "List supported currencies", value: "currency" },
        BACK,
      ],
    })

    switch (action) {
      case "config": await runConfigSubMenu(); break
      case "profile": await runProfileMenu(); break
      case "currency": handleCurrencyList(); break
      case "back": return
    }
  }
}

async function runConfigSubMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "configuration",
      pageSize: 10,
      choices: [
        { name: "List", description: "Show all configuration keys", value: "list" },
        { name: "Get", description: "Show a configuration value", value: "get" },
        { name: "Set", description: "Set a configuration value", value: "set" },
        { name: "Reset", description: "Reset configuration to defaults", value: "reset" },
        BACK,
      ],
    })

    switch (action) {
      case "list": handleConfigList(); break
      case "get": {
        const key = await input({ message: "config key:", validate: (v) => v.trim().length > 0 || "Key required" })
        handleConfigGet(key.trim())
        break
      }
      case "set": {
        const key = await input({ message: "config key:", validate: (v) => v.trim().length > 0 || "Key required" })
        const value = await input({ message: `value for "${key.trim()}":` })
        handleConfigSet(key.trim(), value.trim())
        break
      }
      case "reset": {
        const ok = await confirm({ message: "Reset all configuration to defaults?", default: false })
        if (ok) await handleConfigReset()
        break
      }
      case "back": return
    }
  }
}

async function runProfileMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "filter profiles",
      pageSize: 10,
      choices: [
        { name: "List", description: "List saved profiles", value: "list" },
        { name: "Save", description: "Save the current filter as a profile", value: "save" },
        { name: "Switch", description: "Switch to a profile", value: "switch" },
        { name: "Show", description: "Show the active profile", value: "show" },
        { name: "Delete", description: "Delete a profile", value: "delete" },
        BACK,
      ],
    })

    switch (action) {
      case "list": await handleProfile("list"); break
      case "save": await handleProfile("save"); break
      case "switch": {
        const name = await input({ message: "profile name:", validate: (v) => v.trim().length > 0 || "Name required" })
        await handleProfile("switch", name.trim())
        break
      }
      case "show": await handleProfile("show"); break
      case "delete": {
        const name = await input({ message: "profile name:", validate: (v) => v.trim().length > 0 || "Name required" })
        await handleProfile("delete", name.trim())
        break
      }
      case "back": return
    }
  }
}

// ── System ────────────────────────────────────────────

async function runSystemMenu(): Promise<void> {
  while (true) {
    const action = await select({
      message: "system",
      pageSize: 10,
      choices: [
        { name: "MCP server", description: "Start MCP server (blocks until exit)", value: "mcp" },
        BACK,
      ],
    })

    switch (action) {
      case "mcp": {
        const ok = await confirm({
          message: "Start MCP server? The menu will be blocked until the server exits.",
          default: false,
        })
        if (ok) await handleMcp()
        break
      }
      case "back": return
    }
  }
}
