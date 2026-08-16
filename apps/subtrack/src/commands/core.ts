// ── Core subscription commands ──────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import {
  handleList,
  handleAdd,
  handleEdit,
  handleDelete,
  handleClone,
  handleArchive,
  handleUnarchive,
} from "../subscription.ts"
import { handleSearch } from "../search.ts"
import { saveDb } from "../db.ts"
import { fail } from "../error.ts"

export const listCommand = define({
  name: "list",
  description: "List all subscriptions",
  args: {
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    sort: { type: "string", description: "Sort field: name, price, currency, cycle" },
    desc: { type: "boolean", short: "d", description: "Sort descending" },
    api: { type: "boolean", short: "a", description: "Include LLM API usage for current month" },
    notes: { type: "boolean", short: "n", description: "Show notes column" },
    method: { type: "boolean", short: "m", description: "Show payment method column" },
    contract: { type: "boolean", description: "Show contract dates column" },
    vendor: { type: "boolean", description: "Show vendor column" },
    status: { type: "string", description: "Filter by status: active, paused, cancelled, archived" },
    "min-price": { type: "string", description: "Filter by minimum price" },
    "max-price": { type: "string", description: "Filter by maximum price" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
    tags: { type: "string", description: "Comma-separated tag names to filter by (AND logic)" },
    limit: { type: "string", description: "Max number of items to show" },
    offset: { type: "string", description: "Number of items to skip" },
    "include-archived": { type: "boolean", description: "Include archived subscriptions" },
  },
  run: (ctx) => {
    const limit = ctx.values.limit !== undefined ? Number(ctx.values.limit) : undefined
    if (limit !== undefined && (isNaN(limit) || limit < 1 || !Number.isInteger(limit))) {
      fail("limit must be a positive integer")
      return
    }
    const offset = ctx.values.offset !== undefined ? Number(ctx.values.offset) : undefined
    if (offset !== undefined && (isNaN(offset) || offset < 0 || !Number.isInteger(offset))) {
      fail("offset must be a non-negative integer")
      return
    }
    const status = ctx.values.status
    if (status !== undefined && !["active", "paused", "cancelled", "archived"].includes(status)) {
      fail("status must be one of: active, paused, cancelled, archived")
      return
    }
    const minPrice = ctx.values["min-price"] !== undefined ? Number(ctx.values["min-price"]) : undefined
    if (minPrice !== undefined && (isNaN(minPrice) || minPrice < 0)) {
      fail("min-price must be a non-negative number")
      return
    }
    const maxPrice = ctx.values["max-price"] !== undefined ? Number(ctx.values["max-price"]) : undefined
    if (maxPrice !== undefined && (isNaN(maxPrice) || maxPrice < 0)) {
      fail("max-price must be a non-negative number")
      return
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("min-price cannot be greater than max-price")
      return
    }
    handleList({
      ...ctx.values,
      limit,
      offset,
      includeArchived: ctx.values["include-archived"],
      showContract: ctx.values.contract,
      showVendor: ctx.values.vendor,
      minPrice,
      maxPrice,
    })
  },
})

export const addCommand = define({
  name: "add",
  description: "Add a subscription",
  args: {
    name: { type: "string", description: "Subscription name" },
    price: { type: "string", description: "Monthly payment amount" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    tags: { type: "string", description: "Comma-separated tags" },
    billingDay: { type: "string", description: "Billing day of month (1-31)" },
    status: { type: "string", description: "Status: active, paused, cancelled (default: active)" },
    paymentMethod: { type: "string", description: "Payment method (e.g. credit_card, paypal)" },
    vendorName: { type: "string", description: "Vendor name" },
    vendorUrl: { type: "string", description: "Vendor URL" },
    planTier: { type: "string", description: "Plan tier (e.g. Pro, Family)" },
    discountAmount: { type: "string", description: "Discount amount (non-negative integer)" },
    discountType: { type: "string", description: "Discount type: percentage or fixed" },
    contractStart: { type: "string", description: "Contract start date (YYYY-MM-DD)" },
    contractEnd: { type: "string", description: "Contract end date (YYYY-MM-DD)" },
    autoRenewal: { type: "string", description: "Auto renew: true or false (default: true)" },
  },
  run: (ctx) => handleAdd(ctx.values),
})

export const editCommand = define({
  name: "edit",
  description: "Edit a subscription",
  args: {
    id: { type: "positional", description: "Subscription ID (omit for interactive selection)", required: false },
    name: { type: "string", description: "Subscription name" },
    price: { type: "string", description: "Monthly payment amount" },
    currency: { type: "string", description: "Currency" },
    cycle: { type: "string", description: "Billing cycle" },
    tags: { type: "string", description: "Comma-separated tags" },
    status: { type: "string", description: "Status: active, paused, cancelled" },
    billingDay: { type: "string", description: "Billing day of month (1-31)" },
    paymentMethod: { type: "string", description: "Payment method" },
    vendorName: { type: "string", description: "Vendor name" },
    vendorUrl: { type: "string", description: "Vendor URL" },
    planTier: { type: "string", description: "Plan tier (e.g. Pro, Family)" },
    discountAmount: { type: "string", description: "Discount amount (non-negative integer)" },
    discountType: { type: "string", description: "Discount type: percentage or fixed" },
    contractStart: { type: "string", description: "Contract start date (YYYY-MM-DD)" },
    contractEnd: { type: "string", description: "Contract end date (YYYY-MM-DD)" },
    autoRenewal: { type: "string", description: "Auto renew: true or false" },
  },
  run: (ctx) => handleEdit(ctx.values.id ? Number(ctx.values.id) : undefined, ctx.values),
})

export const deleteCommand = define({
  name: "delete",
  description: "Delete subscriptions",
  args: {
    id: { type: "positional", array: true, description: "Subscription ID(s) to delete (omit for interactive selection)", required: false },
  },
  run: (ctx) => {
    const ids = ctx.positionals.slice(1).map(Number).filter((n) => !isNaN(n))
    handleDelete(ids.length > 0 ? ids : undefined)
  },
})

export const cloneCommand = define({
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
      fail("Valid subscription ID is required")
      return
    }
    handleClone(id, ctx.values)
  },
})

export const archiveCommand = define({
  name: "archive",
  description: "Archive a subscription (set status to archived)",
  args: {
    id: { type: "positional", description: "Subscription ID to archive" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id === undefined || isNaN(id) || !Number.isInteger(id) || id < 1) {
      fail("Valid subscription ID is required")
      return
    }
    handleArchive(id)
  },
})

export const unarchiveCommand = define({
  name: "unarchive",
  description: "Unarchive a subscription (set status back to active)",
  args: {
    id: { type: "positional", description: "Subscription ID to unarchive" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id === undefined || isNaN(id) || !Number.isInteger(id) || id < 1) {
      fail("Valid subscription ID is required")
      return
    }
    handleUnarchive(id)
  },
})

export const searchCommand = define({
  name: "search",
  description: "Search subscriptions by name, notes, or tags",
  args: {
    query: { type: "positional", description: "Search query", required: false },
    names: { type: "boolean", description: "Search in names only" },
    notes: { type: "boolean", description: "Search in notes only" },
    tags: { type: "boolean", description: "Search in tags only" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const query = ctx.values.query ?? positionals[1]
    handleSearch(query, {
      names: ctx.values.names,
      notes: ctx.values.notes,
      tags: ctx.values.tags,
      json: ctx.values.json,
    })
  },
})
