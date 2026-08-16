// ── Report/analytics commands ──────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleSummary } from "../payment.ts"
import { handlePayment } from "../payment.ts"
import { handleUpcoming } from "../upcoming.ts"
import { handleAnalytics } from "../analytics.ts"
import { handleCompare } from "../compare.ts"
import { handleCalendar } from "../calendar.ts"
import { handleForecast } from "../forecast.ts"
import { handleHistory } from "../history.ts"
import { handleNotify } from "../notify.ts"
import { handleTimeline } from "../timeline.ts"
import { handleOptimize } from "../optimize.ts"
import { handleStats } from "../stats.ts"
import type { Cycle, NotifyChannel } from "../types.ts"
import { fail } from "../error.ts"

export const summaryCommand = define({
  name: "summary",
  description: "Show subscription summary statistics",
  args: {
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => handleSummary({ json: ctx.values.json }),
})

export const paymentCommand = define({
  name: "payment",
  description: "Show payment totals",
  args: {
    period: { type: "positional", description: "Billing period (default: monthly)", required: false },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    api: { type: "boolean", short: "a", description: "Include LLM API usage costs" },
    method: { type: "boolean", short: "m", description: "Group by payment method" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle
    return handlePayment(period, {
      currency: ctx.values.currency,
      api: ctx.values.api,
      method: ctx.values.method,
      json: ctx.values.json,
    })
  },
})

export const upcomingCommand = define({
  name: "upcoming",
  description: "Show upcoming bills within a number of days",
  args: {
    days: { type: "positional", description: "Number of days (default: 7)", required: false },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      fail("days must be a non-negative integer")
      return
    }
    handleUpcoming(days, { json: ctx.values.json, currency: ctx.values.currency })
  },
})

export const analyticsCommand = define({
  name: "analytics",
  description: "Show detailed subscription analytics",
  args: {
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    period: { type: "string", description: "Period: monthly, yearly (default: monthly)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const period = ctx.values.period as "monthly" | "yearly" | undefined
    if (period !== undefined && period !== "monthly" && period !== "yearly") {
      fail("period must be one of: monthly, yearly")
      return
    }
    handleAnalytics({ currency: ctx.values.currency, period, json: ctx.values.json })
  },
})

export const compareCommand = define({
  name: "compare",
  description: "Compare spending between current and previous period",
  args: {
    period: { type: "positional", description: "Period: monthly, quarterly, yearly (default: monthly)", required: false },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    api: { type: "boolean", short: "a", description: "Include LLM API usage costs" },
  },
  run: (ctx) => {
    const period = (ctx.values.period || "monthly") as Cycle
    handleCompare(period, { currency: ctx.values.currency, api: ctx.values.api })
  },
})

export const calendarCommand = define({
  name: "calendar",
  description: "Show a monthly calendar with billing days marked",
  args: {
    month: { type: "string", description: "Month (1-12, default: current)" },
    year: { type: "string", description: "Year (default: current)" },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const rawMonth = ctx.values.month !== undefined ? Number(ctx.values.month) : undefined
    if (rawMonth !== undefined && (isNaN(rawMonth) || rawMonth < 1 || rawMonth > 12 || !Number.isInteger(rawMonth))) {
      fail("month must be an integer between 1 and 12")
      return
    }
    const rawYear = ctx.values.year !== undefined ? Number(ctx.values.year) : undefined
    if (rawYear !== undefined && (isNaN(rawYear) || rawYear < 1 || !Number.isInteger(rawYear))) {
      fail("year must be a positive integer")
      return
    }
    handleCalendar({ month: rawMonth, year: rawYear, json: ctx.values.json, currency: ctx.values.currency })
  },
})

export const forecastCommand = define({
  name: "forecast",
  description: "Show spending forecast and what-if scenarios",
  args: {
    months: { type: "string", description: "Number of months to forecast (default: 12)" },
    cancel: { type: "string", description: "Comma-separated subscription names to exclude" },
    addName: { type: "string", description: "Hypothetical subscription name to add" },
    addPrice: { type: "string", description: "Hypothetical subscription price" },
    addCurrency: { type: "string", description: "Hypothetical subscription currency" },
    addCycle: { type: "string", description: "Hypothetical subscription cycle" },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const rawMonths = ctx.values.months !== undefined ? Number(ctx.values.months) : undefined
    if (rawMonths !== undefined && (isNaN(rawMonths) || rawMonths < 1 || !Number.isInteger(rawMonths))) {
      fail("months must be a positive integer")
      return
    }
    return handleForecast({
      months: rawMonths,
      cancel: ctx.values.cancel?.split(",").map((s: string) => s.trim()).filter(Boolean),
      addName: ctx.values.addName,
      addPrice: ctx.values.addPrice,
      addCurrency: ctx.values.addCurrency,
      addCycle: ctx.values.addCycle,
      currency: ctx.values.currency,
      json: ctx.values.json,
    })
  },
})

export const historyCommand = define({
  name: "history",
  description: "Show price change history for a subscription",
  args: {
    id: { type: "positional", description: "Subscription ID", required: false },
    all: { type: "boolean", description: "Show all price changes across all subscriptions" },
    days: { type: "string", description: "Filter to recent N days (used with --all)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const positionals = ctx.positionals as string[]
    const id = ctx.values.id !== undefined ? Number(ctx.values.id) : positionals[1] ? Number(positionals[1]) : undefined
    if (id !== undefined && (isNaN(id) || !Number.isInteger(id) || id < 1)) {
      fail("id must be a positive integer")
      return
    }
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 1 || !Number.isInteger(days))) {
      fail("days must be a positive integer")
      return
    }
    handleHistory(id, { all: ctx.values.all, json: ctx.values.json, days })
  },
})

export const notifyCommand = define({
  name: "notify",
  description: "Send desktop notification for upcoming bills",
  args: {
    days: { type: "string", description: "Number of days (default: config notifyDays or 7)" },
    channel: { type: "string", short: "c", description: "Notification channel: os, slack, webhook (default: config notifyChannels or os)" },
    "dry-run": { type: "boolean", description: "Show upcoming bills without sending notification" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: async (ctx) => {
    const days = ctx.values.days !== undefined ? Number(ctx.values.days) : undefined
    if (days !== undefined && (isNaN(days) || days < 0 || !Number.isInteger(days))) {
      fail("days must be a non-negative integer")
      return
    }
    if (ctx.values.channel !== undefined && !["os", "slack", "webhook"].includes(ctx.values.channel)) {
      fail("channel must be one of: os, slack, webhook")
      return
    }
    await handleNotify({ days, channel: ctx.values.channel as NotifyChannel | undefined, dryRun: ctx.values["dry-run"], json: ctx.values.json })
  },
})

export const timelineCommand = define({
  name: "timeline",
  description: "Show monthly spending timeline with bar chart",
  args: {
    months: { type: "string", description: "Number of months (default: 12)" },
    categories: { type: "boolean", short: "c", description: "Show breakdown by category (first tag)" },
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => {
    const months = ctx.values.months !== undefined ? Number(ctx.values.months) : undefined
    if (months !== undefined && (isNaN(months) || months < 1 || !Number.isInteger(months))) {
      fail("months must be a positive integer")
      return
    }
    handleTimeline({ months, categories: ctx.values.categories, json: ctx.values.json })
  },
})

export const optimizeCommand = define({
  name: "optimize",
  description: "Analyze subscriptions and suggest cost optimizations",
  args: {
    json: { type: "boolean", short: "j", description: "Output as JSON" },
    "min-savings": { type: "string", description: "Minimum yearly savings to show (default: 0)" },
    currency: { type: "string", short: "c", description: "Convert all prices to target currency" },
    "discount-rate": { type: "string", description: "Assumed yearly discount rate for annual plans in % (default: 15)" },
    exclude: { type: "string", description: "Comma-separated subscription names to exclude from analysis" },
  },
  run: (ctx) => {
    const minSavings = ctx.values["min-savings"] !== undefined ? Number(ctx.values["min-savings"]) : undefined
    if (minSavings !== undefined && (isNaN(minSavings) || minSavings < 0)) {
      fail("min-savings must be a non-negative number")
      return
    }
    const discountRate = ctx.values["discount-rate"] !== undefined ? Number(ctx.values["discount-rate"]) : undefined
    if (discountRate !== undefined && (isNaN(discountRate) || discountRate < 0 || discountRate > 100)) {
      fail("discount-rate must be a number between 0 and 100")
      return
    }
    handleOptimize({
      json: ctx.values.json,
      minSavings,
      currency: ctx.values.currency,
      discountRate,
      exclude: ctx.values.exclude?.split(",").map((s: string) => s.trim()).filter(Boolean),
    })
  },
})

export const statsCommand = define({
  name: "stats",
  description: "Show database statistics",
  args: {
    json: { type: "boolean", short: "j", description: "Output as JSON" },
  },
  run: (ctx) => handleStats({ json: ctx.values.json }),
})
