#!/usr/bin/env node
import { cli, define } from "gunshi";
import { consola } from "consola";
import { saveDb } from "./db.ts";
import {
  handleList,
  handleAdd,
  handleEdit,
  handleDelete,
  handleTags,
  handleTagList,
  handleTagRename,
  handleTagDelete,
  handleTagPrune,
  handleTagMerge,
  handleExport,
  handleSummary,
  handleBackup,
  handleRestore,
  handlePayment,
  handleUpcoming,
  handleAnalytics,
  handleCompare,
  handleConfigList,
  handleConfigGet,
  handleConfigSet,
  handleConfigReset,
  handleSearch,
  handleTrialAdd,
  handleTrialList,
  handleTrialExpiring,
  handleTrialDelete,
  handleBulkStatus,
  handleBulkDelete,
  handleBulkTagAdd,
  handleBulkTagRemove,
  handleClone,
  handleArchive,
  handleUnarchive,
  handleForecast,
  handleTui,
  handleCalendar,
  handleMcp,
  handleHistory,
  handleNotify,
  handleTimeline,
  handleOptimize,
  handleProfile,
  handleAuditList,
  handleAuditPrune,
  handleMaintenance,
  handleCleanup,
  handleStats,
  handleCurrencyList,
} from "./commands.ts";
import {
  handleUsageAdd,
  handleUsageList,
  handleUsageDelete,
  handleUsageImport,
  handleUsageRefresh,
  handleUsageTotal,
} from "./usage.ts";
import { handleImport } from "./import-csv.ts";
import type { Cycle, Status, UsageRefreshFlags } from "./types.ts";

// ── Command definitions ──────────────────────────────────

const listCommand = define({
  name: "list",
  description: "List all subscriptions",
  args: {
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
    sort: {
      type: "string",
      description: "Sort field: name, price, currency, cycle",
    },
    desc: { type: "boolean", short: "d", description: "Sort descending" },
    api: {
      type: "boolean",
      short: "a",
      description: "Include LLM API usage for current month",
    },
    notes: { type: "boolean", short: "n", description: "Show notes column" },
    method: {
      type: "boolean",
      short: "m",
      description: "Show payment method column",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    tags: {
      type: "string",
      description: "Comma-separated tag names to filter by (AND logic)",
    },
    limit: {
      type: "string",
      description: "Max number of items to show",
    },
    offset: {
      type: "string",
      description: "Number of items to skip",
    },
    "include-archived": {
      type: "boolean",
      description: "Include archived subscriptions",
    },
  },
  run: (ctx) => {
    const limit = ctx.values.limit !== undefined ? Number(ctx.values.limit) : undefined
    if (limit !== undefined && (isNaN(limit) || limit < 1 || !Number.isInteger(limit))) {
      consola.error("limit must be a positive integer")
      return
    }
    const offset = ctx.values.offset !== undefined ? Number(ctx.values.offset) : undefined
    if (offset !== undefined && (isNaN(offset) || offset < 0 || !Number.isInteger(offset))) {
      consola.error("offset must be a non-negative integer")
      return
    }
    handleList({ ...ctx.values, limit, offset, includeArchived: ctx.values["include-archived"] })
  },
});

const addCommand = define({
  name: "add",
  description: "Add a subscription",
  args: {
    name: { type: "string", description: "Subscription name" },
    price: { type: "string", description: "Monthly payment amount" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    tags: { type: "string", description: "Comma-separated tags" },
    billingDay: { type: "string", description: "Billing day of month (1-31)" },
    status: {
      type: "string",
      description: "Status: active, paused, cancelled (default: active)",
    },
    paymentMethod: {
      type: "string",
      description: "Payment method (e.g. credit_card, paypal)",
    },
  },
  run: (ctx) => handleAdd(ctx.values),
});

const editCommand = define({
  name: "edit",
  description: "Edit a subscription",
  args: {
    id: {
      type: "positional",
      description: "Subscription ID (omit for interactive selection)",
      required: false,
    },
    name: { type: "string", description: "Subscription name" },
    price: { type: "string", description: "Monthly payment amount" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    tags: { type: "string", description: "Comma-separated tags" },
    status: {
      type: "string",
      description: "Status: active, paused, cancelled",
    },
    billingDay: { type: "string", description: "Billing day of month (1-31)" },
    paymentMethod: { type: "string", description: "Payment method" },
  },
  run: (ctx) =>
    handleEdit(ctx.values.id ? Number(ctx.values.id) : undefined, ctx.values),
});

const deleteCommand = define({
  name: "delete",
  description: "Delete subscriptions",
  args: {
    id: {
      type: "positional",
      array: true,
      description:
        "Subscription ID(s) to delete (omit for interactive selection)",
      required: false,
    },
  },
  run: (ctx) => {
    const ids = ctx.positionals
      .slice(1)
      .map(Number)
      .filter((n) => !isNaN(n));
    handleDelete(ids.length > 0 ? ids : undefined);
  },
});

const cloneCommand = define({
  name: "clone",
  description: "Clone an existing subscription",
  args: {
    id: { type: "positional", description: "Subscription ID to clone" },
    name: { type: "string", description: "New name (default: '<original> (copy)')" },
    price: { type: "string", description: "Override price" },
    currency: { type: "string", description: "Override currency" },
    cycle: { type: "string", description: "Override cycle" },
    tags: { type: "string", description: "Override tags (comma-separated)" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id === undefined || isNaN(id) || !Number.isInteger(id) || id < 1) {
      consola.error("Valid subscription ID is required")
      return
    }
    handleClone(id, ctx.values)
  },
})

const archiveCommand = define({
  name: "archive",
  description: "Archive a subscription (set status to archived)",
  args: {
    id: { type: "positional", description: "Subscription ID to archive" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id === undefined || isNaN(id) || !Number.isInteger(id) || id < 1) {
      consola.error("Valid subscription ID is required")
      return
    }
    handleArchive(id)
  },
})

const unarchiveCommand = define({
  name: "unarchive",
  description: "Unarchive a subscription (set status back to active)",
  args: {
    id: { type: "positional", description: "Subscription ID to unarchive" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id === undefined || isNaN(id) || !Number.isInteger(id) || id < 1) {
      consola.error("Valid subscription ID is required")
      return
    }
    handleUnarchive(id)
  },
})

const tagsCommand = define({
  name: "tags",
  description: "Filter subscriptions by tags (AND logic)",
  args: {
    names: {
      type: "positional",
      array: true,
      description: "Tag names",
      required: false,
    },
  },
  run: (ctx) => {
    const tagNames = (ctx.values.names as string[] | undefined) ?? [];
    if (tagNames.length === 0) {
      consola.error("Please specify at least one tag");
      return;
    }
    handleTags(tagNames);
  },
});

const tagListCmd = define({
  name: "list",
  description: "List all tags with usage count",
  run: () => handleTagList(),
});

const tagRenameCmd = define({
  name: "rename",
  description: "Rename a tag",
  args: {
    old: { type: "positional", description: "Current tag name" },
    new: { type: "positional", description: "New tag name" },
  },
  run: (ctx) => handleTagRename(ctx.values.old, ctx.values["new"]),
});

const tagDeleteCmd = define({
  name: "delete",
  description: "Delete a tag and its associations",
  args: {
    name: { type: "positional", description: "Tag name to delete" },
  },
  run: (ctx) => handleTagDelete(ctx.values.name),
});

const tagPruneCmd = define({
  name: "prune",
  description: "Remove orphaned tags",
  run: () => handleTagPrune(),
});

const tagMergeCmd = define({
  name: "merge",
  description: "Merge source tag into target tag",
  args: {
    source: { type: "positional", description: "Source tag name to merge from" },
    target: { type: "positional", description: "Target tag name to merge into" },
  },
  run: (ctx) => handleTagMerge(ctx.values.source, ctx.values.target),
});

const tagCommand = define({
  name: "tag",
  description: "Manage tags",
  subCommands: {
    list: tagListCmd,
    rename: tagRenameCmd,
    delete: tagDeleteCmd,
    prune: tagPruneCmd,
    merge: tagMergeCmd,
  },
  run: () => consola.info("Usage: subtrack tag list|rename|delete|prune|merge"),
});

// ── Search ──────────────────────────────────────────────

const searchCommand = define({
  name: "search",
  description: "Search subscriptions by name, notes, or tags",
  args: {
    query: { type: "positional", description: "Search query", required: false },
    names: { type: "boolean", description: "Search in names only" },
    notes: { type: "boolean", description: "Search in notes only" },
    tags: { type: "boolean", description: "Search in tags only" },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[];
    const query = ctx.values.query ?? positionals[1];
    handleSearch(query, {
      names: ctx.values.names,
      notes: ctx.values.notes,
      tags: ctx.values.tags,
      json: ctx.values.json,
    });
  },
});

// ── Trial ──────────────────────────────────────────────

const trialAddCmd = define({
  name: "add",
  description: "Add a free trial",
  toKebab: true,
  args: {
    name: { type: "string", description: "Trial name" },
    expiresAt: { type: "string", description: "Expiration date (YYYY-MM-DD)" },
    price: { type: "string", description: "Price after trial ends" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    notes: { type: "string", description: "Notes" },
  },
  run: (ctx) => handleTrialAdd(ctx.values),
});

const trialListCmd = define({
  name: "list",
  description: "List all free trials",
  run: () => handleTrialList(),
});

const trialExpiringCmd = define({
  name: "expiring",
  description: "Show trials expiring within a number of days",
  args: {
    days: {
      type: "positional",
      description: "Number of days (default: 7)",
      required: false,
    },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : 7;
    handleTrialExpiring(days);
  },
});

const trialDeleteCmd = define({
  name: "delete",
  description: "Delete free trials",
  args: {
    id: {
      type: "positional",
      array: true,
      description: "Trial ID(s) to delete (omit for interactive selection)",
      required: false,
    },
  },
  run: (ctx) => {
    const ids = ctx.positionals
      .slice(1)
      .map(Number)
      .filter((n: number) => !isNaN(n));
    handleTrialDelete(ids.length > 0 ? ids : undefined);
  },
});

const trialCommand = define({
  name: "trial",
  description: "Manage free trials",
  subCommands: {
    add: trialAddCmd,
    list: trialListCmd,
    expiring: trialExpiringCmd,
    delete: trialDeleteCmd,
  },
  run: () => consola.info("Usage: subtrack trial add|list|expiring|delete"),
});

// ── Bulk ───────────────────────────────────────────────

const bulkStatusCmd = define({
  name: "status",
  description: "Bulk change subscription status",
  args: {
    set: {
      type: "string",
      description: "Target status: active, paused, cancelled",
      required: true,
    },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) =>
    handleBulkStatus(
      ctx.values.set,
      { tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name },
      { force: ctx.values.force },
    ),
});

const bulkDeleteCmd = define({
  name: "delete",
  description: "Bulk delete subscriptions",
  args: {
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) =>
    handleBulkDelete(
      { tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name },
      { force: ctx.values.force },
    ),
});

const bulkTagAddCmd = define({
  name: "add",
  description: "Bulk add tag to matching subscriptions",
  args: {
    add: { type: "string", description: "Tag to add", required: true },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
  },
  run: (ctx) =>
    handleBulkTagAdd(ctx.values.add, {
      tag: ctx.values.tag,
      status: ctx.values.status,
      name: ctx.values.name,
    }),
});

const bulkTagRemoveCmd = define({
  name: "remove",
  description: "Bulk remove tag from matching subscriptions",
  args: {
    remove: { type: "string", description: "Tag to remove", required: true },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
  },
  run: (ctx) =>
    handleBulkTagRemove(ctx.values.remove, {
      tag: ctx.values.tag,
      status: ctx.values.status,
      name: ctx.values.name,
    }),
});

const bulkTagCmd = define({
  name: "tag",
  description: "Bulk add/remove tags",
  subCommands: {
    add: bulkTagAddCmd,
    remove: bulkTagRemoveCmd,
  },
  run: () => consola.info("Usage: subtrack bulk tag add|remove"),
});

const bulkCommand = define({
  name: "bulk",
  description: "Bulk operations on subscriptions",
  subCommands: {
    status: bulkStatusCmd,
    delete: bulkDeleteCmd,
    tag: bulkTagCmd,
  },
  run: () => consola.info("Usage: subtrack bulk status|delete|tag"),
});

// ── Calendar ──────────────────────────────────────────

const calendarCommand = define({
  name: "calendar",
  description: "Show a monthly calendar with billing days marked",
  args: {
    month: {
      type: "string",
      description: "Month (1-12, default: current)",
    },
    year: {
      type: "string",
      description: "Year (default: current)",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const rawMonth = ctx.values.month !== undefined ? Number(ctx.values.month) : undefined
    if (rawMonth !== undefined && (isNaN(rawMonth) || rawMonth < 1 || rawMonth > 12 || !Number.isInteger(rawMonth))) {
      consola.error("month must be an integer between 1 and 12")
      return
    }
    const rawYear = ctx.values.year !== undefined ? Number(ctx.values.year) : undefined
    if (rawYear !== undefined && (isNaN(rawYear) || rawYear < 1 || !Number.isInteger(rawYear))) {
      consola.error("year must be a positive integer")
      return
    }
    handleCalendar({
      month: rawMonth,
      year: rawYear,
      json: ctx.values.json,
    })
  },
})

// ── TUI ────────────────────────────────────────────────

const tuiCommand = define({
  name: "tui",
  description: "Interactive terminal UI",
  run: () => handleTui(),
});

// ── Forecast ──────────────────────────────────────────

const forecastCommand = define({
  name: "forecast",
  description: "Show spending forecast and what-if scenarios",
  args: {
    months: {
      type: "string",
      description: "Number of months to forecast (default: 12)",
    },
    cancel: {
      type: "string",
      description: "Comma-separated subscription names to exclude",
    },
    addName: {
      type: "string",
      description: "Hypothetical subscription name to add",
    },
    addPrice: {
      type: "string",
      description: "Hypothetical subscription price",
    },
    addCurrency: {
      type: "string",
      description: "Hypothetical subscription currency",
    },
    addCycle: {
      type: "string",
      description: "Hypothetical subscription cycle",
    },
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
  },
  run: (ctx) =>
    handleForecast({
      months: ctx.values.months ? Number(ctx.values.months) : undefined,
      cancel: ctx.values.cancel
        ?.split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      addName: ctx.values.addName,
      addPrice: ctx.values.addPrice,
      addCurrency: ctx.values.addCurrency,
      addCycle: ctx.values.addCycle,
      currency: ctx.values.currency,
    }),
});

const exportCommand = define({
  name: "export",
  description: "Export subscriptions",
  args: {
    format: { type: "positional", description: "Export format: csv, json, md, excel, ics" },
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
    tags: { type: "string", description: "Filter by comma-separated tags" },
    status: {
      type: "string",
      description: "Filter by status: active, paused, cancelled (comma-separated)",
    },
    output: {
      type: "string",
      short: "o",
      description: "Output file path (default: stdout)",
    },
  },
  run: (ctx) =>
    handleExport(ctx.values.format, {
      currency: ctx.values.currency,
      tags: ctx.values.tags,
      status: ctx.values.status,
      output: ctx.values.output,
    }),
});

const importCommand = define({
  name: "import",
  description: "Import subscriptions from CSV",
  toKebab: true,
  args: {
    file: { type: "positional", description: "CSV file to import" },
    dryRun: { type: "boolean", description: "Validate without importing" },
    deduplicate: {
      type: "boolean",
      description: "Skip or update existing subscriptions with the same name",
    },
  },
  run: (ctx) => handleImport(ctx.values.file, {
    dryRun: ctx.values.dryRun,
    deduplicate: ctx.values.deduplicate,
  }),
});

const summaryCommand = define({
  name: "summary",
  description: "Show subscription summary statistics",
  args: {
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => handleSummary({ json: ctx.values.json }),
});

const backupCommand = define({
  name: "backup",
  description: "Backup database (gzip compressed)",
  args: {
    destination: {
      type: "positional",
      description:
        "Backup destination directory (default: ~/.config/subtrack/backups/)",
      required: false,
    },
    encrypt: {
      type: "boolean",
      short: "e",
      description: "Encrypt the backup with your database key",
    },
  },
  run: (ctx) => {
    handleBackup(ctx.values.destination, { encrypt: ctx.values.encrypt });
  },
});

const restoreCommand = define({
  name: "restore",
  description: "Restore database from a backup",
  args: {
    file: {
      type: "positional",
      description: "Backup file to restore (omit for interactive selection)",
      required: false,
    },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
    dir: { type: "string", description: "Directory to scan for backup files" },
  },
  run: (ctx) =>
    handleRestore(ctx.values.file, {
      force: ctx.values.force,
      dir: ctx.values.dir,
    }),
});

const paymentCommand = define({
  name: "payment",
  description: "Show payment totals",
  args: {
    period: {
      type: "positional",
      description: "Billing period (default: monthly)",
      required: false,
    },
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
    api: {
      type: "boolean",
      short: "a",
      description: "Include LLM API usage costs",
    },
    method: {
      type: "boolean",
      short: "m",
      description: "Group by payment method",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle;
    return handlePayment(period, {
      currency: ctx.values.currency,
      api: ctx.values.api,
      method: ctx.values.method,
      json: ctx.values.json,
    });
  },
});

// ── Upcoming ──────────────────────────────────────────────

const upcomingCommand = define({
  name: "upcoming",
  description: "Show upcoming bills within a number of days",
  args: {
    days: {
      type: "positional",
      description: "Number of days (default: 7)",
      required: false,
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined;
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      consola.error("days must be a non-negative integer");
      return;
    }
    handleUpcoming(days, { json: ctx.values.json });
  },
});

// ── Analytics ─────────────────────────────────────────────

const analyticsCommand = define({
  name: "analytics",
  description: "Show detailed subscription analytics",
  run: () => handleAnalytics(),
});

// ── Compare ────────────────────────────────────────────────

const compareCommand = define({
  name: "compare",
  description: "Compare spending between current and previous period",
  args: {
    period: {
      type: "positional",
      description: "Period: monthly, quarterly, yearly (default: monthly)",
      required: false,
    },
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
    api: {
      type: "boolean",
      short: "a",
      description: "Include LLM API usage costs",
    },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle;
    handleCompare(period, {
      currency: ctx.values.currency,
      api: ctx.values.api,
    });
  },
});

// ── Config ────────────────────────────────────────────────

const configListCmd = define({
  name: "list",
  description: "List all config values",
  run: () => handleConfigList(),
});

const configGetCmd = define({
  name: "get",
  description: "Get a config value",
  args: {
    key: { type: "positional", description: "Config key" },
  },
  run: (ctx) => handleConfigGet(ctx.values.key),
});

const configSetCmd = define({
  name: "set",
  description: "Set a config value",
  args: {
    key: { type: "positional", description: "Config key" },
    value: { type: "positional", description: "Config value" },
  },
  run: (ctx) => handleConfigSet(ctx.values.key, ctx.values.value),
});

const configResetCmd = define({
  name: "reset",
  description: "Reset config to defaults",
  run: () => handleConfigReset(),
});

const configCommand = define({
  name: "config",
  description: "Manage configuration",
  subCommands: {
    list: configListCmd,
    get: configGetCmd,
    set: configSetCmd,
    reset: configResetCmd,
  },
  run: () => consola.info("Usage: subtrack config list|get|set|reset"),
});

// ── Usage commands ───────────────────────────────────────

const usageAddCommand = define({
  name: "add",
  description: "Add an LLM API usage entry",
  toKebab: true,
  args: {
    provider: {
      type: "string",
      description: "Provider name (openai, anthropic, ...)",
    },
    model: { type: "string", description: "Model name (e.g. gpt-4o)" },
    inputTokens: { type: "string", description: "Input tokens used" },
    outputTokens: { type: "string", description: "Output tokens used" },
    date: { type: "string", description: "Date (YYYY-MM-DD, default: today)" },
    description: { type: "string", description: "Optional description" },
    cost: {
      type: "string",
      description:
        "Total cost in USD (e.g. 0.50 for 50 cents; overrides auto-pricing)",
    },
  },
  run: (ctx) => handleUsageAdd(ctx.values),
});

const usageListCommand = define({
  name: "list",
  description: "List LLM API usage entries",
  args: {
    provider: { type: "string", description: "Filter by provider" },
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => handleUsageList(ctx.values),
});

const usageDeleteCommand = define({
  name: "delete",
  description: "Delete LLM API usage entries",
  args: {
    id: {
      type: "positional",
      array: true,
      description: "Entry ID(s) to delete (omit for interactive selection)",
      required: false,
    },
  },
  run: (ctx) => {
    const ids = ctx.positionals
      .slice(1)
      .map(Number)
      .filter((n) => !isNaN(n));
    handleUsageDelete(ids.length > 0 ? ids : undefined);
  },
});

const usageImportCommand = define({
  name: "import",
  description: "Import LLM API usage from JSONL/JSON response log files",
  toKebab: true,
  args: {
    file: {
      type: "positional",
      description: "JSONL/JSON file to import (use - for stdin)",
    },
    dryRun: { type: "boolean", description: "Validate without importing" },
  },
  run: (ctx) => handleUsageImport(ctx.values),
});

const usageRefreshCommand = define({
  name: "refresh",
  description:
    "Auto-scan known sources (OpenCode DB, Claude Code, Codex CLI, Cursor, Copilot, Windsurf) and import usage data — defaults to current month",
  args: {
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    all: {
      type: "boolean",
      description: "Scan all historical data (ignore date range)",
    },
  },
  run: (ctx) => handleUsageRefresh(ctx.values as UsageRefreshFlags),
});

const usageTotalCommand = define({
  name: "total",
  description: "Show aggregated LLM API usage costs for a period",
  args: {
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    period: {
      type: "string",
      description: "Period: monthly, quarterly, yearly (default: monthly)",
    },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle
    handleUsageTotal({
      from: ctx.values.from,
      to: ctx.values.to,
      period,
      json: ctx.values.json,
    })
  },
})

const usageCommand = define({
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
  run: () =>
    consola.info("Usage: subtrack usage add|list|delete|import|refresh|total"),
});

// ── History ───────────────────────────────────────────────

const historyCommand = define({
  name: "history",
  description: "Show price change history for a subscription",
  args: {
    id: {
      type: "positional",
      description: "Subscription ID",
      required: false,
    },
    all: {
      type: "boolean",
      description: "Show all price changes across all subscriptions",
    },
    days: {
      type: "string",
      description: "Filter to recent N days (used with --all)",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id !== undefined && (isNaN(id) || !Number.isInteger(id) || id < 1)) {
      consola.error("id must be a positive integer")
      return
    }
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 1 || !Number.isInteger(days))) {
      consola.error("days must be a positive integer")
      return
    }
    handleHistory(id, {
      all: ctx.values.all,
      json: ctx.values.json,
      days,
    })
  },
})

// ── Notify ────────────────────────────────────────────────

const notifyCommand = define({
  name: "notify",
  description: "Send desktop notification for upcoming bills",
  args: {
    days: {
      type: "string",
      description: "Number of days (default: config notifyDays or 7)",
    },
    "dry-run": {
      type: "boolean",
      description: "Show upcoming bills without sending notification",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: async (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      consola.error("days must be a non-negative integer")
      return
    }
    await handleNotify({
      days,
      dryRun: ctx.values["dry-run"],
      json: ctx.values.json,
    })
  },
})

// ── Profile ──────────────────────────────────────────────

const profileSaveCmd = define({
  name: "save",
  description: "Save a filter profile",
  toKebab: true,
  args: {
    name: { type: "positional", description: "Profile name" },
    tag: {
      type: "string",
      array: true,
      description: "Filter by tags (comma-separated or multiple flags)",
    },
    status: { type: "string", description: "Filter by status: active, paused, cancelled" },
    "payment-method": { type: "string", description: "Filter by payment method" },
  },
  run: (ctx) => {
    const name = ctx.values.name
    if (!name) {
      consola.error("Profile name required")
      return
    }
    const rawTag = ctx.values.tag as string | string[] | undefined
    const tagValues = Array.isArray(rawTag) ? rawTag : rawTag ? [rawTag] : []
    const tags = tagValues.length > 0
      ? tagValues.flatMap((t: string) => t.split(",").map((s: string) => s.trim()).filter(Boolean))
      : undefined
    handleProfile("save", name, {
      tags: tags && tags.length > 0 ? tags : undefined,
      status: ctx.values.status as Status | undefined,
      paymentMethod: ctx.values["payment-method"],
    })
  },
})

const profileSwitchCmd = define({
  name: "switch",
  description: "Switch to a saved profile",
  args: {
    name: { type: "positional", description: "Profile name" },
  },
  run: (ctx) => {
    handleProfile("switch", ctx.values.name)
  },
})

const profileListCmd = define({
  name: "list",
  description: "List saved profiles",
  run: () => handleProfile("list"),
})

const profileShowCmd = define({
  name: "show",
  description: "Show profile details",
  args: {
    name: { type: "positional", description: "Profile name", required: false },
  },
  run: (ctx) => {
    handleProfile("show", ctx.values.name)
  },
})

const profileDeleteCmd = define({
  name: "delete",
  description: "Delete a profile",
  args: {
    name: { type: "positional", description: "Profile name" },
  },
  run: (ctx) => {
    handleProfile("delete", ctx.values.name)
  },
})

const profileCommand = define({
  name: "profile",
  description: "Manage filter profiles",
  subCommands: {
    save: profileSaveCmd,
    switch: profileSwitchCmd,
    list: profileListCmd,
    show: profileShowCmd,
    delete: profileDeleteCmd,
  },
  run: () => consola.info("Usage: subtrack profile save|switch|list|show|delete"),
})

// ── Optimize ─────────────────────────────────────────────

const optimizeCommand = define({
  name: "optimize",
  description: "Analyze subscriptions and suggest cost optimizations",
  args: {
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    "min-savings": {
      type: "string",
      description: "Minimum yearly savings to show (default: 0)",
    },
  },
  run: (ctx) => {
    const minSavings = ctx.values["min-savings"] !== undefined ? Number(ctx.values["min-savings"]) : undefined
    if (minSavings !== undefined && (isNaN(minSavings) || minSavings < 0)) {
      consola.error("min-savings must be a non-negative number")
      return
    }
    handleOptimize({
      json: ctx.values.json,
      minSavings,
    })
  },
})

// ── Timeline ─────────────────────────────────────────────

const timelineCommand = define({
  name: "timeline",
  description: "Show monthly spending timeline with bar chart",
  args: {
    months: {
      type: "string",
      description: "Number of months (default: 12)",
    },
    categories: {
      type: "boolean",
      short: "c",
      description: "Show breakdown by category (first tag)",
    },
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const months = ctx.values.months !== undefined ? Number(ctx.values.months) : undefined
    if (months !== undefined && (isNaN(months) || months < 1 || !Number.isInteger(months))) {
      consola.error("months must be a positive integer")
      return
    }
    handleTimeline({
      months,
      categories: ctx.values.categories,
      json: ctx.values.json,
    })
  },
})

// ── Audit ────────────────────────────────────────────────

const auditListCmd = define({
  name: "list",
  description: "List audit log entries",
  args: {
    action: { type: "string", description: "Filter by action type" },
    limit: { type: "string", description: "Max entries (default: 50)" },
    from: { type: "string", description: "Start date (YYYY-MM-DD)" },
    to: { type: "string", description: "End date (YYYY-MM-DD)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const limit = ctx.values.limit !== undefined ? Number(ctx.values.limit) : 50
    if (limit !== undefined && (isNaN(limit) || limit < 1 || !Number.isInteger(limit))) {
      consola.error("limit must be a positive integer")
      return
    }
    handleAuditList({
      action: ctx.values.action,
      limit,
      json: ctx.values.json,
      from: ctx.values.from,
      to: ctx.values.to,
    })
  },
})

const auditPruneCmd = define({
  name: "prune",
  description: "Prune old audit log entries",
  args: {
    days: { type: "string", description: "Delete entries older than N days (default: 90)" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : 90
    if (days !== undefined && (isNaN(days) || days < 1 || !Number.isInteger(days))) {
      consola.error("days must be a positive integer")
      return
    }
    handleAuditPrune({ days, force: ctx.values.force, json: ctx.values.json })
  },
})

const auditCommand = define({
  name: "audit",
  description: "View and manage the audit log",
  subCommands: {
    list: auditListCmd,
    prune: auditPruneCmd,
  },
  run: () => consola.info("Usage: subtrack audit list|prune"),
})

// ── Maintenance ───────────────────────────────────────────

const maintenanceCommand = define({
  name: "maintenance",
  description: "Run database maintenance (VACUUM, integrity check)",
  args: {
    vacuum: { type: "boolean", description: "Run VACUUM to reclaim space" },
    check: { type: "boolean", description: "Run integrity check (default)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    handleMaintenance({
      vacuum: ctx.values.vacuum,
      check: ctx.values.check,
      json: ctx.values.json,
    })
  },
})

// ── Cleanup ───────────────────────────────────────────────

const cleanupCommand = define({
  name: "cleanup",
  description: "Run all maintenance tasks (integrity check, VACUUM, prune audit/tags)",
  args: {
    vacuum: { type: "boolean", description: "Run VACUUM (default: true)" },
    "audit-days": {
      type: "string",
      description: "Prune audit entries older than N days (default: 90)",
    },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const auditDays = ctx.values["audit-days"] !== undefined ? Number(ctx.values["audit-days"]) : 90
    if (auditDays !== undefined && (isNaN(auditDays) || auditDays < 1 || !Number.isInteger(auditDays))) {
      consola.error("audit-days must be a positive integer")
      return
    }
    handleCleanup({
      vacuum: ctx.values.vacuum,
      auditDays,
      json: ctx.values.json,
    })
  },
})

// ── Stats ─────────────────────────────────────────────────

const statsCommand = define({
  name: "stats",
  description: "Show database statistics",
  args: {
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => handleStats({ json: ctx.values.json }),
})

// ── Currency ──────────────────────────────────────────────

const currencyCommand = define({
  name: "currency",
  description: "List supported currencies",
  args: {
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => handleCurrencyList({ json: ctx.values.json }),
})

// ── MCP ──────────────────────────────────────────────────

const mcpCommand = define({
  name: "mcp",
  description: "Start MCP server for AI agent integration (stdio transport)",
  run: () => handleMcp(),
});

const mainCommand = define({
  name: "subtrack",
  description: "Manage subscription services from your terminal",
  run: () => consola.info('Run "subtrack --help" for available commands'),
});

// Signal handlers for clean shutdown
let exiting = false;
const handleSignal = (signal: string) => {
  if (exiting) return;
  exiting = true;
  consola.info(`Received ${signal}, saving data...`);
  try {
    saveDb();
  } catch {
    /* best-effort */
  }
  process.exit(0);
};
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

// Restrict file permissions for all created files
process.umask(0o077);

try {
  await cli(process.argv.slice(2), mainCommand, {
    name: "subtrack",
    version: "7.0.8",
    subCommands: {
      list: listCommand,
      add: addCommand,
      edit: editCommand,
      delete: deleteCommand,
      clone: cloneCommand,
      archive: archiveCommand,
      unarchive: unarchiveCommand,
      tags: tagsCommand,
      tag: tagCommand,
      search: searchCommand,
      trial: trialCommand,
      bulk: bulkCommand,
      tui: tuiCommand,
      forecast: forecastCommand,
      export: exportCommand,
      import: importCommand,
      summary: summaryCommand,
      backup: backupCommand,
      restore: restoreCommand,
      payment: paymentCommand,
      upcoming: upcomingCommand,
      calendar: calendarCommand,
      history: historyCommand,
      notify: notifyCommand,
      profile: profileCommand,
      optimize: optimizeCommand,
      timeline: timelineCommand,
      audit: auditCommand,
      maintenance: maintenanceCommand,
      cleanup: cleanupCommand,
      stats: statsCommand,
      currency: currencyCommand,
      mcp: mcpCommand,
      analytics: analyticsCommand,
      compare: compareCommand,
      config: configCommand,
      usage: usageCommand,
    },
  });
} catch (error) {
  if (error instanceof Error && error.name === "ExitPromptError") {
    // User cancelled the prompt (Ctrl+C/D) — exit gracefully
    process.exit(0);
  }
  if (error instanceof AggregateError) {
    for (const e of error.errors) {
      consola.error(String(e));
    }
    process.exit(1);
  }
  throw error;
}
