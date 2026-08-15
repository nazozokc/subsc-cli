// ── LLM API Usage commands ───────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleUsageAdd } from "../usage-add.ts"
import { handleUsageList, handleUsageDelete } from "../usage.ts"
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
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => handleUsageList(ctx.values),
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
    delete: usageDeleteCommand,
    import: usageImportCommand,
    refresh: usageRefreshCommand,
    total: usageTotalCommand,
  },
  run: () => consola.info("Usage: subtrack usage add|list|delete|import|refresh|total"),
})
