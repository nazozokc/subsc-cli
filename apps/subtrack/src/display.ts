import { consola } from "consola"
import pc from "picocolors"
import CliTable3 from "cli-table3"
import type { SharedArgs, Currency, LlmUsageEntry, Status } from "./types.ts"
import { getSubscriptions } from "./db.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import type { FxRates } from "./fx.ts"

import { formatPrice } from "./price.ts"
import { TABLE_CHARS, TABLE_STYLE } from "./display-constants.ts"

function statusColor(status: Status): string {
  switch (status) {
    case "active": return pc.green("active")
    case "paused": return pc.yellow("paused")
    case "cancelled": return pc.red("cancelled")
    case "archived": return pc.dim("archived")
    default: return status
  }
}

function buildRow(sub: SharedArgs, price: string, showNotes: boolean, showMethod: boolean, showContract?: boolean, showVendor?: boolean): string[] {
  const row = [
    String(sub.name),
    statusColor(sub.status),
    String(sub.cycle),
    sub.tags.length > 0 ? sub.tags.join(", ") : "-",
    price,
  ]

  // Insert columns before price (at index 4, shifting as needed)
  let insertIdx = 4

  if (showMethod) {
    const method = sub.paymentMethod ?? ""
    row.splice(insertIdx++, 0, method.length > 20 ? method.slice(0, 17) + "..." : method)
  }

  if (showContract) {
    const period = sub.contractStart
      ? `${sub.contractStart}${sub.contractEnd ? ` ~ ${sub.contractEnd}` : " ~ ongoing"}`
      : "-"
    const renewal = sub.autoRenewal ? "auto" : "manual"
    row.splice(insertIdx++, 0, period.length > 16 ? period.slice(0, 13) + "..." : period)
    row.splice(insertIdx++, 0, renewal)
  }

  if (showVendor) {
    const vendor = sub.vendorName ?? "-"
    const tier = sub.planTier ?? "-"
    row.splice(insertIdx++, 0, vendor.length > 15 ? vendor.slice(0, 12) + "..." : vendor)
    row.splice(insertIdx++, 0, tier.length > 12 ? tier.slice(0, 9) + "..." : tier)
  }

  // Insert notes column before the last column
  if (showNotes) {
    const insertAt = row.length - 1
    const notes = sub.notes ?? ""
    row.splice(insertAt, 0, notes.length > 40 ? notes.slice(0, 37) + "..." : notes)
  }

  return row
}

type ColumnConfig = {
  headers: readonly string[]
  minWidths: readonly number[]
  maxWidths: readonly number[]
  /** Minimum available width (default 40) */
  minAvail?: number
}

const BASE_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "price"] as const,
  minWidths: [10, 8, 6, 8, 8] as const,
  maxWidths: [40, 12, 20, 60, 20] as const,
}

const NOTES_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "notes", "price"] as const,
  minWidths: [10, 8, 6, 8, 15, 8] as const,
  maxWidths: [40, 12, 20, 60, 50, 20] as const,
}

const METHOD_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "method", "price"] as const,
  minWidths: [10, 8, 6, 8, 10, 8] as const,
  maxWidths: [40, 12, 20, 60, 30, 20] as const,
}

const ALL_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "method", "notes", "price"] as const,
  minWidths: [10, 8, 6, 8, 10, 15, 8] as const,
  maxWidths: [40, 12, 20, 60, 30, 50, 20] as const,
}

const CONTRACT_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "contract", "renewal", "price"] as const,
  minWidths: [10, 8, 6, 8, 18, 6, 8] as const,
  maxWidths: [40, 12, 20, 60, 30, 10, 20] as const,
}

const VENDOR_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "vendor", "plan", "price"] as const,
  minWidths: [10, 8, 6, 8, 10, 8, 8] as const,
  maxWidths: [40, 12, 20, 60, 30, 20, 20] as const,
}

const CONTRACT_VENDOR_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "contract", "renewal", "vendor", "plan", "price"] as const,
  minWidths: [10, 8, 6, 8, 18, 6, 10, 8, 8] as const,
  maxWidths: [40, 12, 20, 60, 30, 10, 30, 20, 20] as const,
}

const ALL_EXTRA_COLS: ColumnConfig = {
  headers: ["name", "status", "cycle", "tags", "method", "contract", "renewal", "vendor", "plan", "notes", "price"] as const,
  minWidths: [8, 8, 6, 8, 10, 18, 6, 10, 8, 15, 8] as const,
  maxWidths: [30, 12, 20, 50, 30, 30, 10, 30, 20, 50, 20] as const,
}

const BORDER_AND_PADDING = 16

function calcColumnWidths(rows: string[][], config: ColumnConfig): number[] {
  const termWidth = process.stdout.columns ?? 80
  const avail = Math.max(config.minAvail ?? 40, termWidth - BORDER_AND_PADDING)

  const weights = config.headers.map((hdr, i) => {
    let max = hdr.length
    for (const row of rows) {
      const len = row[i].length
      if (len > max) max = len
    }
    return Math.min(max, config.maxWidths[i])
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map((w, i) =>
    Math.max(
      config.minWidths[i],
      Math.min(config.maxWidths[i], Math.round((avail * w) / totalWeight)),
    ),
  )

  // Adjust to exactly fit avail
  let sum = widths.reduce((a, b) => a + b, 0)
  let diff = sum - avail
  let iterations = 0

  while (diff > 0 && iterations < 100) {
    let idx = -1
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] > config.minWidths[i] && (idx === -1 || widths[i] > widths[idx]))
        idx = i
    }
    if (idx === -1) break
    widths[idx]--
    diff--
    iterations++
  }

  iterations = 0
  while (diff < 0 && iterations < 100) {
    let idx = -1
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] < config.maxWidths[i] && (idx === -1 || weights[i] > weights[idx]))
        idx = i
    }
    if (idx === -1) break
    widths[idx]++
    diff++
    iterations++
  }

  return widths
}

function renderTable(rows: string[][], config: ColumnConfig): string {
  const widths = calcColumnWidths(rows, config)
  const colAligns = config.headers.map((h, i) =>
    i === config.headers.length - 1 ? "right" : "left",
  ) as ("left" | "right")[]

  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: { ...TABLE_STYLE },
    colWidths: widths,
    head: [...config.headers],
    wordWrap: true,
    wrapOnWordBoundary: true,
    colAligns,
  })

  const colCount = config.headers.length
  const priceCol = colCount - 1
  const labelCol = priceCol - 1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // Total rows have empty strings in first three columns (name, status, cycle)
    const isTotal = row[0] === "" && row[1] === "" && row[2] === ""
    if (isTotal) {
      table.push(row.map((cell, j) => {
        if (j === labelCol || j === priceCol) return pc.bold(pc.yellow(cell))
        return cell
      }))
    } else {
      if (i % 2 === 0) {
        table.push(row.map(cell => `\x1b[48;5;236m${cell}\x1b[0m`))
      } else {
        table.push(row)
      }
    }
  }

  return table.toString()
}

export const spreadSubscription = async (
  get?: SharedArgs[],
  currency?: Currency,
  showNotes?: boolean,
  showMethod?: boolean,
  showContract?: boolean,
  showVendor?: boolean,
): Promise<void> => {
  const list = get ?? getSubscriptions()

  if (list.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  let config = BASE_COLS
  if (showNotes && showMethod && showContract && showVendor) {
    config = ALL_EXTRA_COLS
  } else if (showContract && showVendor) {
    config = CONTRACT_VENDOR_COLS
  } else if (showContract) {
    config = CONTRACT_COLS
  } else if (showVendor) {
    config = VENDOR_COLS
  } else if (showNotes && showMethod) {
    config = ALL_COLS
  } else if (showNotes) {
    config = NOTES_COLS
  } else if (showMethod) {
    config = METHOD_COLS
  }
  const rows: string[][] = []

  if (currency) {
    // --currency specified: fetch rates and convert all to the target currency
    let rates: FxRates | null = null
    try {
      consola.info("Fetching the latest exchange rates...")
      rates = await fetchFxRates()
      consola.success("Exchange rates updated")
    } catch (e) {
      consola.fail(`Failed to fetch exchange rates: ${e}`)
    }

    if (rates) {
      let total = 0
      let hasMissingRate = false

      for (const sub of list) {
        try {
          const converted = convertPrice(
            sub.price,
            sub.currency,
            currency,
            rates.rates,
          )
          total += converted
          rows.push(buildRow(sub, formatPrice(Math.round(converted), currency), showNotes ?? false, showMethod ?? false, showContract, showVendor))
        } catch {
          hasMissingRate = true
          rows.push(
            buildRow(sub, `? (${formatPrice(sub.price, sub.currency)})`, showNotes ?? false, showMethod ?? false, showContract, showVendor),
          )
        }
      }

      const totalRow = new Array<string>(config.headers.length).fill("")
      totalRow[config.headers.length - 2] = `${currency} TOTAL`
      totalRow[config.headers.length - 1] = formatPrice(Math.round(total), currency)
      rows.push(totalRow)

      if (hasMissingRate) {
        consola.warn(
          "Some prices could not be converted (missing rate). They are shown in original currency.",
        )
      }

      consola.log(renderTable(rows, config))
      return
    }
    // fallback: continue to the no-currency path below
  }

  // Display subscriptions grouped by currency
  const groups: Record<string, SharedArgs[]> = {}
  for (const sub of list) {
    ;(groups[sub.currency] ??= []).push(sub)
  }

  const groupEntries = Object.entries(groups)
  for (let i = 0; i < groupEntries.length; i++) {
    const [currencyCode, subs] = groupEntries[i]
    const groupRows: string[][] = []

    let total = 0
    for (const sub of subs) {
      groupRows.push(buildRow(sub, formatPrice(sub.price, sub.currency), showNotes ?? false, showMethod ?? false, showContract, showVendor))
      total += sub.price
    }
    const totalRow = new Array<string>(config.headers.length).fill("")
    totalRow[config.headers.length - 2] = `${currencyCode} TOTAL`
    totalRow[config.headers.length - 1] = formatPrice(total, currencyCode)
    groupRows.push(totalRow)

    consola.log(renderTable(groupRows, config))
    if (i < groupEntries.length - 1) consola.log("")
  }
}

// ── LLM API Usage table ──────────────────────────────────

type UsageRow = [string, string, string, string, string, string, string]

const USAGE_HEADERS = ["Provider", "Model", "Input", "Output", "Cost", "Date", "Description"] as const
const USAGE_MIN_WIDTHS = [10, 20, 10, 10, 10, 12, 15] as const
const USAGE_MAX_WIDTHS = [20, 50, 14, 14, 14, 12, 60] as const

const USAGE_COLS: ColumnConfig = {
  headers: USAGE_HEADERS,
  minWidths: USAGE_MIN_WIDTHS,
  maxWidths: USAGE_MAX_WIDTHS,
  minAvail: 50,
}

function renderUsageTableBody(
  entries: LlmUsageEntry[],
  widths: number[],
): string {
  const table = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: { ...TABLE_STYLE },
    colWidths: widths,
    head: [...USAGE_HEADERS],
    wordWrap: true,
    wrapOnWordBoundary: true,
    colAligns: ["left", "left", "right", "right", "right", "left", "left"],
  })

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const row: string[] = [
      e.provider,
      e.model,
      e.input_tokens.toLocaleString(),
      e.output_tokens.toLocaleString(),
      `$${(e.cost / 100).toFixed(4)}`,
      e.date,
      e.description ?? "",
    ]
    if (i % 2 === 0) {
      table.push(row.map((cell) => `\x1b[48;5;236m${cell}\x1b[0m`))
    } else {
      table.push(row)
    }
  }

  return table.toString()
}

/** TABLE_CHARS with a footer-style top border (used for the total row). */
const TABLE_CHARS_FOOTER = {
  ...TABLE_CHARS,
  "top-mid": "┴",
  "top-left": "├",
  "top-right": "┤",
} as const

export function renderUsageTable(entries: LlmUsageEntry[]): void {
  if (entries.length === 0) {
    consola.info("No paid usage entries found")
    return
  }

  const rows: UsageRow[] = entries.map((e) => [
    e.provider,
    e.model,
    e.input_tokens.toLocaleString(),
    e.output_tokens.toLocaleString(),
    `$${(e.cost / 100).toFixed(4)}`,
    e.date,
    e.description ?? "",
  ])

  // TOTAL row appended for width calculation only
  const totalCost = entries.reduce((sum, e) => sum + e.cost, 0)
  const allRows = [
    ...rows,
    [
      "Total",
      "",
      "",
      "",
      `$${(totalCost / 100).toFixed(2)}`,
      "",
      `(${entries.length} entr${entries.length === 1 ? "y" : "ies"})`,
    ] as UsageRow,
  ]

  const widths = calcColumnWidths(allRows, USAGE_COLS)
  consola.log(renderUsageTableBody(entries, widths))

  // Render TOTAL footer row
  const table = new CliTable3({
    chars: { ...TABLE_CHARS_FOOTER },
    style: { ...TABLE_STYLE },
    colWidths: widths,
    colAligns: ["left", "left", "right", "right", "right", "left", "left"],
  })
  table.push([
    pc.bold(pc.yellow("Total")),
    "",
    "",
    "",
    pc.bold(pc.yellow(`$${(totalCost / 100).toFixed(2)}`)),
    "",
    pc.dim(`(${entries.length} entr${entries.length === 1 ? "y" : "ies"})`),
  ])
  consola.log(table.toString())
}

// ── API Usage summary (list --api) ───────────────────────

export function showApiUsage(
  total: number,
  byProvider: { provider: string; total: number }[],
  periodLabel: string,
): void {
  consola.log("")
  consola.log(pc.bold(pc.cyan(`── API Usage (${periodLabel}) ──`)))

  if (total <= 0) {
    consola.info("No API usage found for this month")
    return
  }

  const apiTable = new CliTable3({
    chars: { ...TABLE_CHARS },
    style: { ...TABLE_STYLE },
    head: ["Provider", "Cost"],
    colAligns: ["left", "right"],
  })

  for (const p of byProvider) {
    apiTable.push([p.provider, `$${(p.total / 100).toFixed(2)}`])
  }
  apiTable.push([
    pc.bold(pc.yellow("Total")),
    pc.bold(pc.yellow(`$${(total / 100).toFixed(2)}`)),
  ])

  consola.log(apiTable.toString())
}
