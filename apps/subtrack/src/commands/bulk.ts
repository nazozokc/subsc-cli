// ── Bulk operation commands ────────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleBulkStatus, handleBulkDelete, handleBulkTagAdd, handleBulkTagRemove } from "../bulk.ts"

const bulkStatusCmd = define({
  name: "status",
  description: "Bulk change subscription status",
  args: {
    set: { type: "string", description: "Target status: active, paused, cancelled", required: true },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) => handleBulkStatus(ctx.values.set, { tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name }, { force: ctx.values.force }),
})

const bulkDeleteCmd = define({
  name: "delete",
  description: "Bulk delete subscriptions",
  args: {
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) => handleBulkDelete({ tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name }, { force: ctx.values.force }),
})

const bulkTagAddCmd = define({
  name: "add",
  description: "Bulk add tag to matching subscriptions",
  args: {
    add: { type: "string", description: "Tag to add", required: true },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) => handleBulkTagAdd(ctx.values.add, { tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name }, { force: ctx.values.force }),
})

const bulkTagRemoveCmd = define({
  name: "remove",
  description: "Bulk remove tag from matching subscriptions",
  args: {
    remove: { type: "string", description: "Tag to remove", required: true },
    tag: { type: "string", description: "Filter by tag" },
    status: { type: "string", description: "Filter by current status" },
    name: { type: "string", description: "Filter by name pattern" },
    force: { type: "boolean", short: "f", description: "Skip confirmation" },
  },
  run: (ctx) => handleBulkTagRemove(ctx.values.remove, { tag: ctx.values.tag, status: ctx.values.status, name: ctx.values.name }, { force: ctx.values.force }),
})

const bulkTagCmd = define({
  name: "tag",
  description: "Bulk add/remove tags",
  subCommands: {
    add: bulkTagAddCmd,
    remove: bulkTagRemoveCmd,
  },
  run: () => consola.info("Usage: subtrack bulk tag add|remove"),
})

export const bulkCommand = define({
  name: "bulk",
  description: "Bulk operations on subscriptions",
  subCommands: {
    status: bulkStatusCmd,
    delete: bulkDeleteCmd,
    tag: bulkTagCmd,
  },
  run: () => consola.info("Usage: subtrack bulk status|delete|tag"),
})
