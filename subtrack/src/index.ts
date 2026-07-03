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
  handleForecast,
  handleTui,
  handleCalendar,
  handleMcp,
  handleHistory,
  handleNotify,
  handleTimeline,
  handleOptimize,
  handleProfile,
} from "./commands.ts";
import {
  handleUsageAdd,
  handleUsageList,
  handleUsageDelete,
  handleUsageImport,
  handleUsageRefresh,
} from "./usage.ts";
import { handleImport } from "./import-csv.ts"

import type { Cycle, Status, NotifyChannel, UsageRefreshFlags, ListFlags } from "./types.ts";

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
    contract: {
      type: "boolean",
      description: "Show contract dates and auto-renewal",
    },
    vendor: {
      type: "boolean",
      description: "Show vendor name and plan tier",
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
    status: {
      type: "string",
      description: "Filter by status: active, paused, cancelled (comma-separated)",
    },
    all: {
      type: "boolean",
      description: "Include cancelled subscriptions",
    },
    "min-price": {
      type: "string",
      description: "Minimum price filter",
    },
    "max-price": {
      type: "string",
      description: "Maximum price filter",
    },
    limit: {
      type: "string",
      description: "Maximum number of results to show",
    },
  },
  run: (ctx) => {
    const values = ctx.values as Record<string, unknown>
    const minPrice = values["min-price"] !== undefined ? Number(values["min-price"]) : undefined
    const maxPrice = values["max-price"] !== undefined ? Number(values["max-price"]) : undefined
    const limit = values.limit !== undefined ? Number(values.limit) : undefined
    if (minPrice !== undefined && (isNaN(minPrice) || minPrice < 0)) {
      consola.error("min-price must be a non-negative number")
      return
    }
    if (maxPrice !== undefined && (isNaN(maxPrice) || maxPrice < 0)) {
      consola.error("max-price must be a non-negative number")
      return
    }
    if (limit !== undefined && (isNaN(limit) || limit < 1 || !Number.isInteger(limit))) {
      consola.error("limit must be a positive integer")
      return
    }
    handleList({
      ...values,
      showContract: values.contract as boolean,
      showVendor: values.vendor as boolean,
      minPrice,
      maxPrice,
      limit,
    } as ListFlags)
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
    contractStart: { type: "string", description: "Contract start date (YYYY-MM-DD)" },
    contractEnd: { type: "string", description: "Contract end date (YYYY-MM-DD)" },
    autoRenewal: { type: "string", description: "Auto-renewal enabled (true/false, default: true)" },
    vendorName: { type: "string", description: "Vendor/provider name" },
    vendorUrl: { type: "string", description: "Vendor URL/website" },
    planTier: { type: "string", description: "Plan tier (e.g. Pro, Business)" },
    discountAmount: { type: "string", description: "Discount amount" },
    discountType: { type: "string", description: "Discount type: percentage or fixed" },
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
    contractStart: { type: "string", description: "Contract start date (YYYY-MM-DD)" },
    contractEnd: { type: "string", description: "Contract end date (YYYY-MM-DD)" },
    autoRenewal: { type: "string", description: "Auto-renewal enabled (true/false)" },
    vendorName: { type: "string", description: "Vendor/provider name" },
    vendorUrl: { type: "string", description: "Vendor URL/website" },
    planTier: { type: "string", description: "Plan tier (e.g. Pro, Business)" },
    discountAmount: { type: "string", description: "Discount amount" },
    discountType: { type: "string", description: "Discount type: percentage or fixed" },
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
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    status: {
      type: "string",
      description: "Filter by status: active, paused, cancelled (comma-separated)",
    },
  },
  run: (ctx) => {
    const tagNames = (ctx.values.names as string[] | undefined) ?? [];
    if (tagNames.length === 0) {
      consola.error("Please specify at least one tag");
      return;
    }
    handleTags(tagNames, { json: ctx.values.json });
  },
});

const tagListCmd = define({
  name: "list",
  description: "List all tags with usage count",
  args: {
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    sort: {
      type: "string",
      description: "Sort field: name or count (default: name)",
    },
  },
  run: (ctx) => handleTagList({ json: ctx.values.json, sort: ctx.values.sort as "name" | "count" | undefined }),
});

const tagRenameCmd = define({
  name: "rename",
  description: "Rename a tag",
  args: {
    old: { type: "positional", description: "Current tag name", required: false },
    new: { type: "positional", description: "New tag name", required: false },
  },
  run: async (ctx) => handleTagRename(ctx.values.old, ctx.values["new"]),
});

const tagDeleteCmd = define({
  name: "delete",
  description: "Delete a tag and its associations",
  args: {
    name: { type: "positional", description: "Tag name to delete", required: false },
  },
  run: async (ctx) => handleTagDelete(ctx.values.name),
});

const tagPruneCmd = define({
  name: "prune",
  description: "Remove orphaned tags",
  run: () => handleTagPrune(),
});

const tagCommand = define({
  name: "tag",
  description: "Manage tags",
  subCommands: {
    list: tagListCmd,
    rename: tagRenameCmd,
    delete: tagDeleteCmd,
    prune: tagPruneCmd,
  },
  run: () => consola.info("Usage: subtrack tag list|rename|delete|prune"),
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
    status: {
      type: "string",
      description: "Filter by status: active, paused, cancelled (comma-separated)",
    },
    "min-price": {
      type: "string",
      description: "Minimum price filter",
    },
    "max-price": {
      type: "string",
      description: "Maximum price filter",
    },
    limit: {
      type: "string",
      description: "Maximum number of results to show",
    },
  },
  run: (ctx) => {
    const values = ctx.values as Record<string, unknown>
    const positionals = ctx.positionals as string[];
    const query = (typeof values.query === "string" ? values.query : undefined) ?? positionals[1];
    const minPrice = values["min-price"] !== undefined ? Number(values["min-price"]) : undefined
    const maxPrice = values["max-price"] !== undefined ? Number(values["max-price"]) : undefined
    const limit = values.limit !== undefined ? Number(values.limit) : undefined
    if (minPrice !== undefined && (isNaN(minPrice) || minPrice < 0)) {
      consola.error("min-price must be a non-negative number")
      return
    }
    if (maxPrice !== undefined && (isNaN(maxPrice) || maxPrice < 0)) {
      consola.error("max-price must be a non-negative number")
      return
    }
    if (limit !== undefined && (isNaN(limit) || limit < 1 || !Number.isInteger(limit))) {
      consola.error("limit must be a positive integer")
      return
    }
    handleSearch(query, {
      names: values.names as boolean,
      notes: values.notes as boolean,
      tags: values.tags as boolean,
      json: values.json as boolean,
      status: values.status as string | undefined,
      minPrice,
      maxPrice,
      limit,
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
  args: {
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => handleTrialList({ json: ctx.values.json }),
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
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : 7;
    handleTrialExpiring(days, { json: ctx.values.json });
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
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
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
      currency: ctx.values.currency,
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
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    "max-rows": {
      type: "string",
      description: "Maximum rows to display (default: 8)",
    },
  },
  run: (ctx) => {
    const values = ctx.values as Record<string, unknown>
    const months = values.months !== undefined ? Number(values.months) : undefined
    const maxRows = values["max-rows"] !== undefined ? Number(values["max-rows"]) : undefined
    if (months !== undefined && (isNaN(months) || months < 1 || !Number.isInteger(months))) {
      consola.error("months must be a positive integer")
      return
    }
    if (maxRows !== undefined && (isNaN(maxRows) || maxRows < 1 || !Number.isInteger(maxRows))) {
      consola.error("max-rows must be a positive integer")
      return
    }
    handleForecast({
      months,
      cancel: values.cancel
        ?.toString()
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      addName: values.addName as string | undefined,
      addPrice: values.addPrice as string | undefined,
      addCurrency: values.addCurrency as string | undefined,
      addCycle: values.addCycle as string | undefined,
      currency: values.currency as string | undefined,
      json: values.json as boolean,
      maxRows,
    })
  },
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
  description: "Import subscriptions from CSV (supports flexible column mapping)",
  toKebab: true,
  args: {
    file: { type: "positional", description: "CSV file to import" },
    dryRun: { type: "boolean", description: "Validate without importing" },
    map: {
      type: "string",
      description:
        "Column mapping: 'name:Service,price:Cost,currency:Curr,cycle:Interval'",
    },
    delimiter: {
      type: "string",
      short: "d",
      description: "CSV delimiter (default: comma)",
    },
  },
  run: (ctx) =>
    handleImport(ctx.values.file, {
      dryRun: ctx.values.dryRun,
      map: ctx.values.map,
      delimiter: ctx.values.delimiter,
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
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined;
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      consola.error("days must be a non-negative integer");
      return;
    }
    handleUpcoming(days, { json: ctx.values.json, currency: ctx.values.currency });
  },
});

// ── Analytics ─────────────────────────────────────────────

const analyticsCommand = define({
  name: "analytics",
  description: "Show detailed subscription analytics",
  args: {
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
  },
  run: (ctx) => handleAnalytics({ json: ctx.values.json, currency: ctx.values.currency }),
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
    json: {
      type: "boolean",
      short: "j",
      description: "Output as JSON",
    },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle;
    handleCompare(period, {
      currency: ctx.values.currency,
      api: ctx.values.api,
      json: ctx.values.json,
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

const usageCommand = define({
  name: "usage",
  description: "Track LLM API usage costs",
  subCommands: {
    add: usageAddCommand,
    list: usageListCommand,
    delete: usageDeleteCommand,
    import: usageImportCommand,
    refresh: usageRefreshCommand,
  },
  run: () =>
    consola.info("Usage: subtrack usage add|list|delete|import|refresh"),
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
  description:
    "Send desktop notification for upcoming bills (supports OS, email, Slack, webhook)",
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
    channel: {
      type: "string",
      short: "C",
      description:
        "Notification channel: os, email, slack, webhook (default: config notifyChannels or os)",
    },
  },
  run: async (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      consola.error("days must be a non-negative integer")
      return
    }
    const channel = ctx.values.channel as NotifyChannel | undefined
    if (channel && !["os", "email", "slack", "webhook"].includes(channel)) {
      consola.error("channel must be one of: os, email, slack, webhook")
      return
    }
    await handleNotify({
      days,
      dryRun: ctx.values["dry-run"],
      json: ctx.values.json,
      channel,
    })
  },
})

// ── Profile ──────────────────────────────────────────────

const profileSaveCmd = define({
  name: "save",
  description: "Save a filter profile",
  toKebab: true,
  args: {
    name: { type: "positional", description: "Profile name", required: false },
    tag: {
      type: "string",
      array: true,
      description: "Filter by tags (comma-separated or multiple flags)",
    },
    status: { type: "string", description: "Filter by status: active, paused, cancelled" },
    "payment-method": { type: "string", description: "Filter by payment method" },
  },
  run: async (ctx) => {
    const tagValues = ctx.values.tag as string[] | undefined
    const tags = tagValues
      ? tagValues.flatMap((t: string) => t.split(",").map((s: string) => s.trim()).filter(Boolean))
      : undefined
    const filter = {
      tags: tags && tags.length > 0 ? tags : undefined,
      status: ctx.values.status as Status | undefined,
      paymentMethod: ctx.values["payment-method"],
    }
    // If flags provided, use them non-interactively
    if (ctx.values.name || tags || ctx.values.status || ctx.values["payment-method"]) {
      if (!ctx.values.name) {
        consola.error("Profile name required")
        return
      }
      await handleProfile("save", ctx.values.name, filter)
    } else {
      // Interactive mode (no flags)
      await handleProfile("save")
    }
  },
})

const profileSwitchCmd = define({
  name: "switch",
  description: "Switch to a saved profile",
  args: {
    name: { type: "positional", description: "Profile name", required: false },
  },
  run: async (ctx) => {
    await handleProfile("switch", ctx.values.name)
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
    name: { type: "positional", description: "Profile name", required: false },
  },
  run: async (ctx) => {
    await handleProfile("delete", ctx.values.name)
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
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
    },
    "discount-rate": {
      type: "string",
      description: "Annual discount rate % for yearly plans (default: 15)",
    },
    exclude: {
      type: "string",
      description: "Comma-separated subscription names to exclude",
    },
  },
  run: (ctx) => {
    const values = ctx.values as Record<string, unknown>
    const minSavings = values["min-savings"] !== undefined ? Number(values["min-savings"]) : undefined
    const discountRate = values["discount-rate"] !== undefined ? Number(values["discount-rate"]) : undefined
    if (minSavings !== undefined && (isNaN(minSavings) || minSavings < 0)) {
      consola.error("min-savings must be a non-negative number")
      return
    }
    if (discountRate !== undefined && (isNaN(discountRate) || discountRate < 0 || discountRate > 100)) {
      consola.error("discount-rate must be between 0 and 100")
      return
    }
    const exclude = values.exclude
      ?.toString()
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
    handleOptimize({
      json: values.json as boolean,
      minSavings,
      currency: values.currency as string | undefined,
      discountRate,
      exclude,
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
    currency: {
      type: "string",
      short: "c",
      description: "Convert all prices to target currency",
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
      currency: ctx.values.currency,
    })
  },
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
    version: "8.0.3",
    subCommands: {
      list: listCommand,
      add: addCommand,
      edit: editCommand,
      delete: deleteCommand,
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
