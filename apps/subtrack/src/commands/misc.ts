// ── Misc commands (tui, mcp, audit, maintenance, cleanup, currency, profile) ──
import { define } from "gunshi"
import { consola } from "consola"
import { fail } from "../error.ts"
import { handleProfile } from "../profile.ts"
import { handleAuditList, handleAuditPrune } from "../audit.ts"
import { handleMaintenance } from "../maintenance.ts"
import { handleCleanup } from "../cleanup.ts"
import { handleCurrencyList } from "../currency.ts"
// Lazy imports for TUI and MCP to avoid loading Ink/React/MCP SDK WASM at module load time
import type { Status } from "../types.ts"

// ── TUI ────────────────────────────────────────────────

export const tuiCommand = define({
  name: "tui",
  description: "Interactive terminal UI",
  run: async () => {
    const { handleTui } = await import("../tui.tsx")
    return handleTui()
  },
})

// ── MCP ──────────────────────────────────────────────

export const mcpCommand = define({
  name: "mcp",
  description: "Start MCP server for AI agent integration (stdio transport)",
  run: async () => {
    const { startMcpServer } = await import("../mcp.ts")
    await startMcpServer()
  },
})

// ── Profile ──────────────────────────────────────────

const profileSaveCmd = define({
  name: "save",
  description: "Save a filter profile",
  toKebab: true,
  args: {
    name: { type: "positional", description: "Profile name" },
    tag: { type: "string", array: true, description: "Filter by tags (comma-separated or multiple flags)" },
    status: { type: "string", description: "Filter by status: active, paused, cancelled" },
    "payment-method": { type: "string", description: "Filter by payment method" },
  },
  run: (ctx) => {
    const name = ctx.values.name
    if (!name) { fail("Profile name required"); return }
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
  args: { name: { type: "positional", description: "Profile name" } },
  run: (ctx) => { handleProfile("switch", ctx.values.name) },
})

const profileListCmd = define({
  name: "list",
  description: "List saved profiles",
  run: () => handleProfile("list"),
})

const profileShowCmd = define({
  name: "show",
  description: "Show profile details",
  args: { name: { type: "positional", description: "Profile name", required: false } },
  run: (ctx) => { handleProfile("show", ctx.values.name) },
})

const profileDeleteCmd = define({
  name: "delete",
  description: "Delete a profile",
  args: { name: { type: "positional", description: "Profile name" } },
  run: (ctx) => { handleProfile("delete", ctx.values.name) },
})

export const profileCommand = define({
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

// ── Audit ────────────────────────────────────────────

export const auditListCmd = define({
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
      fail("limit must be a positive integer")
      return
    }
    handleAuditList({ action: ctx.values.action, limit, json: ctx.values.json, from: ctx.values.from, to: ctx.values.to })
  },
})

export const auditPruneCmd = define({
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
      fail("days must be a positive integer")
      return
    }
    handleAuditPrune({ days, force: ctx.values.force, json: ctx.values.json })
  },
})

export const auditCommand = define({
  name: "audit",
  description: "View and manage the audit log",
  subCommands: {
    list: auditListCmd,
    prune: auditPruneCmd,
  },
  run: () => consola.info("Usage: subtrack audit list|prune"),
})

// ── Maintenance ───────────────────────────────────────

export const maintenanceCommand = define({
  name: "maintenance",
  description: "Run database maintenance (VACUUM, integrity check)",
  args: {
    vacuum: { type: "boolean", description: "Run VACUUM to reclaim space" },
    check: { type: "boolean", description: "Run integrity check (default)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => { handleMaintenance({ vacuum: ctx.values.vacuum, check: ctx.values.check, json: ctx.values.json }) },
})

// ── Cleanup ───────────────────────────────────────────

export const cleanupCommand = define({
  name: "cleanup",
  description: "Run all maintenance tasks (integrity check, VACUUM, prune audit/tags)",
  args: {
    vacuum: { type: "boolean", description: "Run VACUUM (default: true)" },
    "audit-days": { type: "string", description: "Prune audit entries older than N days (default: 90)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const auditDays = ctx.values["audit-days"] !== undefined ? Number(ctx.values["audit-days"]) : 90
    if (auditDays !== undefined && (isNaN(auditDays) || auditDays < 1 || !Number.isInteger(auditDays))) {
      fail("audit-days must be a positive integer")
      return
    }
    handleCleanup({ vacuum: ctx.values.vacuum, auditDays, json: ctx.values.json })
  },
})

// ── Currency ──────────────────────────────────────────

export const currencyCommand = define({
  name: "currency",
  description: "List supported currencies",
  args: { json: { type: "boolean", short: "j", description: "Output as JSON" } },
  run: (ctx) => handleCurrencyList({ json: ctx.values.json }),
})
