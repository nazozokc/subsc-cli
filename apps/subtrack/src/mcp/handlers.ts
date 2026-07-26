/**
 * MCP tool handler implementations.
 * Each exported function handles one tool and returns an McpResponse.
 */

import type { SharedArgs, AddSharedArgs, Cycle, Status, Currency } from "../types.ts"
import type { FxRates } from "../fx.ts"
import type { McpResponse } from "./types.ts"
import {
  getSubscriptions,
  getSubscription,
  writeSubscription,
  deleteSubscription,
  updateSubscription,
  getPriceHistory,
  getAllPriceChanges,
  getTrials,
  getTrialsExpiringSoon,
} from "../db.ts"
import { calcSummary, calcSubTotal, calcPreviousTotals } from "../payment.ts"
import { getPeriodDateRange, getPreviousPeriodDateRange, periodFactor } from "../date-utils.ts"
import { calcCalendarEntries } from "../calendar.ts"
import { exportCsv, exportJson, exportMd } from "../export.ts"
import { fetchFxRates, convertPrice } from "../fx.ts"
import { searchSubscriptions } from "../search.ts"
import { calcUpcoming } from "../upcoming.ts"

export async function handleListSubscriptions(args?: Record<string, unknown>): Promise<McpResponse> {
  const subs = getSubscriptions({
    sort: args?.sort as string | undefined,
    desc: args?.desc as boolean | undefined,
  })
  return { content: [{ type: "text", text: JSON.stringify(subs) }] }
}

export async function handleGetSubscription(args?: Record<string, unknown>): Promise<McpResponse> {
  if (args?.id === undefined) {
    return { content: [{ type: "text", text: "id is required" }], isError: true }
  }
  const sub = getSubscription(Number(args.id))
  return { content: [{ type: "text", text: JSON.stringify(sub ?? null) }] }
}

export async function handleSearchSubscriptions(args?: Record<string, unknown>): Promise<McpResponse> {
  if (!args?.query) {
    return { content: [{ type: "text", text: "query is required" }], isError: true }
  }
  const results = searchSubscriptions(String(args.query), {
    names: args.names as boolean | undefined,
    notes: args.notes as boolean | undefined,
    tags: args.tags as boolean | undefined,
  })
  return { content: [{ type: "text", text: JSON.stringify(results) }] }
}

export async function handleAddSubscription(args?: Record<string, unknown>): Promise<McpResponse> {
  if (!args?.name || args?.price === undefined || !args?.currency || !args?.cycle) {
    return { content: [{ type: "text", text: "name, price, currency, and cycle are required" }], isError: true }
  }
  const tags = args.tags
    ? String(args.tags).split(",").map((t: string) => t.trim()).filter(Boolean)
    : []
  const addArgs: AddSharedArgs = {
    name: String(args.name),
    price: Number(args.price),
    currency: String(args.currency),
    cycle: String(args.cycle) as Cycle,
    tags,
    status: (args.status as Status | undefined) ?? "active",
    billingDay: args.billingDay !== undefined ? Number(args.billingDay) : null,
    paymentMethod: args.paymentMethod as string | undefined,
    notes: args.notes as string | undefined,
  }
  const id = writeSubscription(addArgs)
  return { content: [{ type: "text", text: JSON.stringify({ id }) }] }
}

export async function handleDeleteSubscription(args?: Record<string, unknown>): Promise<McpResponse> {
  if (args?.id === undefined) {
    return { content: [{ type: "text", text: "id is required" }], isError: true }
  }
  const success = deleteSubscription(Number(args.id))
  return { content: [{ type: "text", text: JSON.stringify({ success }) }] }
}

export async function handleGetSummary(_args?: Record<string, unknown>): Promise<McpResponse> {
  const subs = getSubscriptions()
  const summary = calcSummary(subs)
  return { content: [{ type: "text", text: JSON.stringify(summary) }] }
}

export async function handleGetUpcoming(args?: Record<string, unknown>): Promise<McpResponse> {
  const days = (args?.days as number | undefined) ?? 7
  const entries = calcUpcoming(days)
  return { content: [{ type: "text", text: JSON.stringify(entries) }] }
}

export async function handleGetCalendar(args?: Record<string, unknown>): Promise<McpResponse> {
  const now = new Date()
  const month = (args?.month as number | undefined) ?? now.getMonth() + 1
  const year = (args?.year as number | undefined) ?? now.getFullYear()
  const entries = calcCalendarEntries(month, year)
  return { content: [{ type: "text", text: JSON.stringify(entries) }] }
}

export async function handleExportData(args?: Record<string, unknown>): Promise<McpResponse> {
  const format = String(args?.format ?? "json")
  const subs = getSubscriptions()
  let output: string
  switch (format) {
    case "csv":
      output = exportCsv(subs)
      break
    case "json":
      output = exportJson(subs)
      break
    case "md":
      output = exportMd(subs)
      break
    default:
      return {
        content: [{ type: "text", text: `Unsupported format: ${format}. Supported formats: csv, json, md` }],
        isError: true,
      }
  }
  return { content: [{ type: "text", text: output }] }
}

export async function handleEditSubscription(args?: Record<string, unknown>): Promise<McpResponse> {
  if (args?.id === undefined) {
    return { content: [{ type: "text", text: "id is required" }], isError: true }
  }
  const editFields: Partial<AddSharedArgs> = {}
  if (args.name !== undefined) editFields.name = String(args.name)
  if (args.price !== undefined) editFields.price = Number(args.price)
  if (args.currency !== undefined) editFields.currency = String(args.currency)
  if (args.cycle !== undefined) editFields.cycle = String(args.cycle) as Cycle
  if (args.status !== undefined) editFields.status = String(args.status) as Status
  if (args.billingDay !== undefined) editFields.billingDay = Number(args.billingDay)
  if (args.paymentMethod !== undefined) editFields.paymentMethod = String(args.paymentMethod)
  if (args.notes !== undefined) editFields.notes = String(args.notes)
  if (args.tags !== undefined) {
    editFields.tags = String(args.tags).split(",").map((t: string) => t.trim()).filter(Boolean)
  }
  const success = updateSubscription(Number(args.id), editFields)
  return { content: [{ type: "text", text: JSON.stringify({ success }) }] }
}

export async function handleGetHistory(args?: Record<string, unknown>): Promise<McpResponse> {
  const id = args?.id as number | undefined
  const days = args?.days as number | undefined
  let entries
  if (id !== undefined) {
    entries = getPriceHistory(id)
  } else {
    entries = getAllPriceChanges(days)
  }
  return { content: [{ type: "text", text: JSON.stringify(entries) }] }
}

export async function handleGetAnalytics(_args?: Record<string, unknown>): Promise<McpResponse> {
  const subs = getSubscriptions()
  const summary = calcSummary(subs)
  return { content: [{ type: "text", text: JSON.stringify(summary) }] }
}

export async function handleGetForecast(args?: Record<string, unknown>): Promise<McpResponse> {
  const months = (args?.months as number | undefined) ?? 12
  const targetCurrency = args?.currency as string | undefined
  const cancelNames = args?.cancel
    ? String(args.cancel).split(",").map((n: string) => n.trim()).filter(Boolean)
    : []

  let rates: FxRates | null = null
  if (targetCurrency) {
    try { rates = await fetchFxRates() } catch { /* fall through */ }
  }

  const subs = getSubscriptions()
  const activeSubs = subs.filter(
    (s) => s.status !== "cancelled" && !cancelNames.includes(s.name),
  )

  const entries: { name: string; price: number; currency: string; cycle: string; monthly: number; monthlyConverted?: number }[] = []

  for (const sub of activeSubs) {
    const monthly = sub.price * periodFactor(sub.cycle, "monthly")
    let monthlyConverted: number | undefined
    if (targetCurrency && rates) {
      try {
        monthlyConverted = Math.round(convertPrice(monthly, sub.currency, targetCurrency, rates.rates))
      } catch { /* keep original */ }
    }
    entries.push({
      name: sub.name,
      price: sub.price,
      currency: sub.currency,
      cycle: sub.cycle,
      monthly,
      ...(monthlyConverted !== undefined ? { monthlyConverted } : {}),
    })
  }

  const displayCcy = targetCurrency || "mixed"
  const monthlyTotal = targetCurrency && rates
    ? entries.reduce((sum: number, e) => sum + (e.monthlyConverted ?? e.monthly), 0)
    : entries.reduce((sum: number, e) => sum + e.monthly, 0)

  const yearlyTotal = monthlyTotal * 12

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        months,
        currency: displayCcy,
        monthlyTotal: Math.round(monthlyTotal),
        yearlyTotal: Math.round(yearlyTotal),
        totalSubscriptions: entries.length,
        entries,
      }),
    }],
  }
}

export async function handleCompare(args?: Record<string, unknown>): Promise<McpResponse> {
  const period = (args?.period as Cycle | undefined) ?? "monthly"
  const targetCurrency = args?.currency as Currency | undefined

  let rates: FxRates | null = null
  if (targetCurrency) {
    try { rates = await fetchFxRates() } catch { /* fall through */ }
  }

  const subs = getSubscriptions()
  const activeSubs = subs.filter((s) => s.status !== "cancelled")

  const currentTotals = calcSubTotal(activeSubs, rates, targetCurrency, period)
  const previousTotals = calcPreviousTotals(activeSubs, rates, targetCurrency, period)

  const allCurrencies = [...new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)])].sort()

  const currencyRows = allCurrencies.map((ccy) => ({
    currency: ccy,
    current: Math.round(currentTotals[ccy] ?? 0),
    previous: Math.round(previousTotals[ccy] ?? 0),
  }))

  const grandCurrent = currencyRows.reduce((s, r) => s + r.current, 0)
  const grandPrevious = currencyRows.reduce((s, r) => s + r.previous, 0)

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        period,
        currency: targetCurrency || null,
        rows: currencyRows,
        grandTotal: {
          current: grandCurrent,
          previous: grandPrevious,
          change: grandCurrent - grandPrevious,
          changePercent: grandPrevious > 0
            ? Math.round(((grandCurrent - grandPrevious) / grandPrevious) * 10000) / 100
            : 0,
        },
      }),
    }],
  }
}

export async function handleBulkOperations(args?: Record<string, unknown>): Promise<McpResponse> {
  const action = String(args?.action ?? "")
  const filters: { tag?: string; status?: string; name?: string } = {}
  if (args?.filter_tag) filters.tag = String(args.filter_tag)
  if (args?.filter_status) filters.status = String(args.filter_status)
  if (args?.filter_name) filters.name = String(args.filter_name)

  const subs = getSubscriptions()
  let matched = subs

  if (filters.tag) {
    const tagSet = new Set(filters.tag.split(",").map((t: string) => t.trim()))
    matched = matched.filter((s) => s.tags?.some((t) => tagSet.has(t)))
  }
  if (filters.status) {
    matched = matched.filter((s) => s.status === filters.status)
  }
  if (filters.name) {
    matched = matched.filter((s) => s.name.toLowerCase().includes(filters.name!.toLowerCase()))
  }

  let affected = matched
  if (action === "status") {
    affected = matched.filter((s) => s.status !== "cancelled")
  }

  const affectedIds = affected.map((s) => s.id)
  let resultCount = 0

  switch (action) {
    case "status": {
      const targetStatus = String(args?.status ?? "active")
      for (const id of affectedIds) {
        try { updateSubscription(id, { status: targetStatus as Status }); resultCount++ } catch { /* skip */ }
      }
      break
    }
    case "delete": {
      for (const id of affectedIds) {
        try { deleteSubscription(id); resultCount++ } catch { /* skip */ }
      }
      break
    }
    case "tag_add": {
      const tagName = String(args?.tag_name ?? "")
      if (!tagName) {
        return { content: [{ type: "text", text: "tag_name is required for tag_add action" }], isError: true }
      }
      for (const s of affected) {
        const currentTags = s.tags ?? []
        if (!currentTags.includes(tagName)) {
          try { updateSubscription(s.id, { tags: [...currentTags, tagName] }); resultCount++ } catch { /* skip */ }
        }
      }
      break
    }
    case "tag_remove": {
      const tagName = String(args?.tag_name ?? "")
      if (!tagName) {
        return { content: [{ type: "text", text: "tag_name is required for tag_remove action" }], isError: true }
      }
      for (const s of affected) {
        const currentTags = s.tags ?? []
        if (currentTags.includes(tagName)) {
          try { updateSubscription(s.id, { tags: currentTags.filter((t) => t !== tagName) }); resultCount++ } catch { /* skip */ }
        }
      }
      break
    }
    default:
      return { content: [{ type: "text", text: `Unknown bulk action: ${action}. Use: status, delete, tag_add, tag_remove` }], isError: true }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ action, filters, matchedCount: affected.length, affectedCount: resultCount, affectedIds }),
    }],
  }
}

export async function handleGetTrials(args?: Record<string, unknown>): Promise<McpResponse> {
  const expiringSoon = args?.expiring_soon as number | undefined
  let entries
  if (expiringSoon !== undefined) {
    entries = getTrialsExpiringSoon(expiringSoon)
  } else {
    entries = getTrials()
  }
  return { content: [{ type: "text", text: JSON.stringify(entries) }] }
}

/** Map of tool name to handler function. */
export const HANDLER_MAP: Record<string, (args?: Record<string, unknown>) => Promise<McpResponse>> = {
  list_subscriptions: handleListSubscriptions,
  get_subscription: handleGetSubscription,
  search_subscriptions: handleSearchSubscriptions,
  add_subscription: handleAddSubscription,
  delete_subscription: handleDeleteSubscription,
  get_summary: handleGetSummary,
  get_upcoming: handleGetUpcoming,
  get_calendar: handleGetCalendar,
  export_data: handleExportData,
  edit_subscription: handleEditSubscription,
  get_history: handleGetHistory,
  get_analytics: handleGetAnalytics,
  get_forecast: handleGetForecast,
  compare: handleCompare,
  bulk_operations: handleBulkOperations,
  get_trials: handleGetTrials,
}
