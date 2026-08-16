// ── LLM API Usage commands ───────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleUsageAdd } from "../usage-add.ts"
import { handleUsageList, handleUsageDelete, handleUsageEdit } from "../usage.ts"
import { handleUsageImport } from "../usage-import.ts"
import { handleUsageRefresh } from "../usage-refresh.ts"
import { handleUsageTotal } from "../usage-total.ts"
import type { Cycle, UsageRefreshFlags } from "../types.ts"

const usageAddCommand = define({
  name: "add",
  description: "Add an LLM API usage entry",
  toKebab: true,
  args: {
    provider: { type: "string", description: "Provider name (openai, anthropic, ...)" },
    model: { type: "string", description: "Model name (e.g. gpt-4o)" },
    inputTokens: { type: "string", description: "Input tokens used" },
    outputTokens: { type: "string", description: "Output tokens used" },
    date: { type: "string", description: "Date (YYYY-MM-DD, default: today)" },
    description: { type: "string", description: "Optional description" },
    cost: { type: "string", description: "Total cost in USD (e.g. 0.50 for 50 cents; overrides auto-pricing)" },
  },
  run: (ctx) => handleUsageAdd(ctx.values),
})

const usageListCommand = define({
  name: "list",
  description: "List LLM API usage entries",
  args: {
    provider: { type: "string", description: "Filter by provider" },
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    limit: { type: "string", description: "Max entries to show (default: 100)" },
    offset: { type: "string", description: "Skip the first N entries (for paging)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    let limit: number | undefined
    if (ctx.values.limit !== undefined) {
      limit = Number(ctx.values.limit)
      if (!Number.isInteger(limit) || limit < 1) {
        consola.fail("Invalid --limit. Enter a positive integer (e.g. --limit 200)")
        return
      }
    }
    let offset: number | undefined
    if (ctx.values.offset !== undefined) {
      offset = Number(ctx.values.offset)
      if (!Number.isInteger(offset) || offset < 0) {
        consola.fail("Invalid --offset. Enter a non-negative integer (e.g. --offset 100)")
        return
      }
    }
    handleUsageList({ ...ctx.values, limit, offset })
  },
})

const usageEditCommand = define({
  name: "edit",
  description: "Update fields of an LLM API usage entry",
  toKebab: true,
  args: {
    id: { type: "positional", description: "Entry ID to edit" },
    provider: { type: "string", description: "Provider name (openai, anthropic, ...)" },
    model: { type: "string", description: "Model name (e.g. gpt-4o)" },
    inputTokens: { type: "string", description: "Input tokens used" },
    outputTokens: { type: "string", description: "Output tokens used" },
    date: { type: "string", description: "Date (YYYY-MM-DD)" },
    description: { type: "string", description: "Optional description" },
    cost: { type: "string", description: "Total cost in USD (e.g. 0.50 for 50 cents)" },
  },
  run: (ctx) => {
    const id = Number(ctx.values.id)
    if (isNaN(id)) {
      consola.fail("Invalid id. Provide the usage entry ID (e.g. usage edit 5 --cost 0.50)")
      return
    }
    handleUsageEdit(id, ctx.values)
  },
})

const usageDeleteCommand = define({
  name: "delete",
  description: "Delete LLM API usage entries",
  args: {
    id: { type: "positional", array: true, description: "Entry ID(s) to delete (omit for interactive selection)", required: false },
  },
  run: (ctx) => {
    const ids = ctx.positionals.slice(1).map(Number).filter((n) => !isNaN(n))
    handleUsageDelete(ids.length > 0 ? ids : undefined)
  },
})

const usageImportCommand = define({
  name: "import",
  description: "Import LLM API usage from JSONL/JSON response log files",
  toKebab: true,
  args: {
    file: { type: "positional", description: "JSONL/JSON file to import (use - for stdin)" },
    dryRun: { type: "boolean", description: "Validate without importing" },
  },
  run: (ctx) => handleUsageImport(ctx.values),
})

const usageRefreshCommand = define({
  name: "refresh",
  description: "Auto-scan known sources (OpenCode DB, Claude Code, Codex CLI, Cursor, Copilot, Windsurf) and import usage data — defaults to current month",
  args: {
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    all: { type: "boolean", description: "Scan all historical data (ignore date range)" },
  },
  run: (ctx) => handleUsageRefresh(ctx.values as UsageRefreshFlags),
})

const usageTotalCommand = define({
  name: "total",
  description: "Show aggregated LLM API usage costs for a period",
  args: {
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    period: { type: "string", description: "Period: monthly, quarterly, yearly (default: monthly)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle
    handleUsageTotal({ from: ctx.values.from, to: ctx.values.to, period, json: ctx.values.json })
  },
})

export const usageCommand = define({
  name: "usage",
  description: "Track LLM API usage costs",
  subCommands: {
    add: usageAddCommand,
    list: usageListCommand,
    edit: usageEditCommand,
    delete: usageDeleteCommand,
    import: usageImportCommand,
    refresh: usageRefreshCommand,
    total: usageTotalCommand,
  },
  run: () => consola.info("Usage: subtrack usage add|list|edit|delete|import|refresh|total"),
})
