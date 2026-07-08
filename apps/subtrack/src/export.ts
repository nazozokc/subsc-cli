import { consola } from "consola"
import { writeFileSync } from "node:fs"
import os from "node:os"
import type { SharedArgs, Currency } from "./types.ts"
import { formatPrice } from "./price.ts"
import ExcelJS from "exceljs"
import { calculateNextBilling } from "./upcoming.ts"
import { tagsSubscription, getSubscriptions } from "./db.ts"
import { fetchFxRates, convertPrice } from "./fx.ts"
import { resolveSafeOutputPath } from "./path-utils.ts"

/**
 * Escape a value for CSV output, protecting against CSV injection attacks.
 *
 * - Prefixes leading formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with tab
 * - Wraps in quotes if the value contains quotes, commas, or newlines
 * - Strips control characters (except tab) to prevent hidden payload injection
 */
function escapeCsv(value: string): string {
  // Strip control characters except \t
  let cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  // Detect leading formula injection (including whitespace-prefixed: ` =cmd`)
  if (/^\s*[=+\-@\t\r]/.test(cleaned)) {
    cleaned = "\t" + cleaned
  }
  if (cleaned.includes('"') || cleaned.includes(",") || cleaned.includes("\n") || cleaned.includes("\r")) {
    return `"${cleaned.replace(/"/g, '""')}"`
  }
  return cleaned
}

function csvField(val: unknown): string {
  if (val === null || val === undefined) return ""
  return escapeCsv(String(val))
}

export function exportCsv(subs: SharedArgs[]): string {
  const header = "name,status,cycle,tags,price,currency,notes,payment_method,contract_start,contract_end,auto_renewal,vendor_name,vendor_url,plan_tier,discount_amount,discount_type"
  const rows = subs.map((s) => {
    const tags = s.tags.map((t) => escapeCsv(t)).join(";")
    const name = escapeCsv(s.name)
    const notes = escapeCsv(s.notes ?? "")
    const fields = [
      name, s.status, s.cycle, tags, s.price, s.currency, notes,
      csvField(s.paymentMethod),
      csvField(s.contractStart), csvField(s.contractEnd),
      s.autoRenewal ? "true" : "false",
      csvField(s.vendorName), csvField(s.vendorUrl),
      csvField(s.planTier),
      csvField(s.discountAmount), csvField(s.discountType),
    ]
    return fields.join(",")
  })
  return "\uFEFF" + [header, ...rows].join("\n")
}

export function exportJson(subs: SharedArgs[]): string {
  return JSON.stringify(subs, null, 2) + "\n"
}

function escapeMdCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
}

export function exportMd(subs: SharedArgs[]): string {
  const header = "| name | status | cycle | tags | price | currency | notes | payment_method | contract | vendor | plan | discount |"
  const separator = "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  const rows = subs.map((s) => {
    const tags = s.tags.map(escapeMdCell).join(", ") || "-"
    const price = formatPrice(s.price, s.currency)
    const notes = escapeMdCell(s.notes ?? "") || "-"
    const pm = escapeMdCell(s.paymentMethod ?? "") || "-"
    const contract = s.contractStart
      ? `${s.contractStart}${s.contractEnd ? `~${s.contractEnd}` : "~ongoing"}`
      : "-"
    const vendor = escapeMdCell(s.vendorName ?? "") || "-"
    const tier = escapeMdCell(s.planTier ?? "") || "-"
    const discount = s.discountAmount != null
      ? `${s.discountAmount}${s.discountType === "percentage" ? "%" : ""}`
      : "-"
    return `| ${escapeMdCell(s.name)} | ${s.status} | ${s.cycle} | ${tags} | ${price} | ${s.currency} | ${notes} | ${pm} | ${contract} | ${vendor} | ${tier} | ${discount} |`
  })
  return [header, separator, ...rows].join("\n")
}

export async function exportExcel(subs: SharedArgs[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Subscriptions")

  const headers = [
    "ID",
    "Name",
    "Price",
    "Currency",
    "Cycle",
    "Status",
    "Billing Day",
    "Payment Method",
    "Tags",
    "Notes",
    "Created At",
    "Contract Start",
    "Contract End",
    "Auto Renewal",
    "Vendor Name",
    "Vendor URL",
    "Plan Tier",
    "Discount Amount",
    "Discount Type",
  ]

  const headerRow = sheet.addRow(headers)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    }
  })

  for (const s of subs) {
    const tags = s.tags.join(", ")
    sheet.addRow([
      s.id,
      s.name,
      s.price,
      s.currency,
      s.cycle,
      s.status,
      s.billingDay ?? "",
      s.paymentMethod ?? "",
      tags,
      s.notes ?? "",
      s.createdAt,
      s.contractStart ?? "",
      s.contractEnd ?? "",
      s.autoRenewal ? "Yes" : "No",
      s.vendorName ?? "",
      s.vendorUrl ?? "",
      s.planTier ?? "",
      s.discountAmount ?? "",
      s.discountType ?? "",
    ])
  }

  sheet.columns.forEach((column) => {
    let maxLength = 0
    if (column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value?.toString() ?? ""
        maxLength = Math.max(maxLength, val.length)
      })
    }
    column.width = Math.min(Math.max(maxLength + 2, 10), 50)
  })

  const buf = await workbook.xlsx.writeBuffer()
  return Buffer.from(buf)
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function icsFold(line: string): string {
  const lines: string[] = []
  for (let i = 0; i < line.length; i += 75) {
    if (i === 0) {
      lines.push(line.slice(i, i + 75))
    } else {
      lines.push(" " + line.slice(i, i + 74))
    }
  }
  return lines.join("\r\n")
}

function icsFormatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}`
}

function cycleToRrule(cycle: SharedArgs["cycle"]): string {
  switch (cycle) {
    case "weekly":
      return "FREQ=WEEKLY"
    case "bi-weekly":
      return "FREQ=WEEKLY;INTERVAL=2"
    case "monthly":
      return "FREQ=MONTHLY"
    case "quarterly":
      return "FREQ=MONTHLY;INTERVAL=3"
    case "semi-annual":
      return "FREQ=MONTHLY;INTERVAL=6"
    case "yearly":
      return "FREQ=YEARLY"
  }
}

export function exportIcs(subs: SharedArgs[]): string {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const nowStr = icsFormatDate(now)

  let cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//subtrack//subtrack//EN",
  ]

  for (const s of subs) {
    if (s.status === "cancelled") continue

    const nextDate = calculateNextBilling(s, now)
    const dtStart = icsFormatDate(nextDate)
    const uid = `${s.id}-${dtStart}@subtrack`
    const tags = s.tags.length > 0 ? `Tags: ${s.tags.join(", ")}` : ""
    const notes = s.notes ? `Notes: ${s.notes}` : ""
    const descParts = [tags, notes].filter(Boolean)
    const description = descParts.length > 0 ? descParts.join("\\n") : ""
    const summary = `${s.name} - ${formatPrice(s.price, s.currency)}/${s.cycle}`

    cal.push("BEGIN:VEVENT")
    cal.push(icsFold(`DTSTART;VALUE=DATE:${dtStart}`))
    cal.push(icsFold(`RRULE:${cycleToRrule(s.cycle)}`))
    cal.push(icsFold(`SUMMARY:${icsEscape(summary)}`))
    if (description) {
      cal.push(icsFold(`DESCRIPTION:${icsEscape(description)}`))
    }
    cal.push(icsFold(`DTSTAMP:${nowStr}T000000`))
    cal.push(icsFold(`UID:${uid}`))
    cal.push("END:VEVENT")
  }

  cal.push("END:VCALENDAR")
  return cal.join("\r\n") + "\r\n"
}

// ── Command handler ───────────────────────────────────────

export async function handleExport(
  format: string,
  options: { currency?: string; tags?: string; output?: string; status?: string },
) {
  const supported = ["csv", "json", "md", "excel", "ics"] as const
  if (!(supported as readonly string[]).includes(format)) {
    consola.error(`Unsupported export format: "${format}". Supported: ${supported.join(", ")}`)
    return
  }

  let list = options.tags
    ? tagsSubscription(options.tags.split(",").map((t) => t.trim()))
    : getSubscriptions({ includeArchived: true })

  if (options.status) {
    const statuses = options.status.split(",").map((s) => s.trim().toLowerCase())
    list = list.filter((s) => statuses.includes(s.status))
  }

  if (list.length === 0) {
    consola.info("No subscriptions found")
    return
  }

  if (options.currency) {
    try {
      const rates = await fetchFxRates()
      const targetCurrency = options.currency as Currency
      list = list.map((sub) => ({
        ...sub,
        price: Math.round(convertPrice(sub.price, sub.currency, targetCurrency, rates.rates)),
        currency: targetCurrency,
      }))
    } catch (e) {
      consola.fail(`Failed to fetch exchange rates; exporting in original currencies: ${String(e)}`)
    }
  }

  if (format === "excel") {
    const buf = await exportExcel(list)
    if (options.output) {
      const safePath = resolveSafeOutputPath([os.homedir(), os.tmpdir()], options.output)
      if (!safePath) { consola.error(`Invalid output path — must be within home directory`); return }
      writeFileSync(safePath, buf, { mode: 0o600 })
      consola.success(`Exported to: ${safePath}`)
    } else {
      process.stdout.write(buf)
    }
    return
  }

  const content = format === "csv"
    ? exportCsv(list)
    : format === "json"
      ? exportJson(list)
      : format === "md"
        ? exportMd(list)
        : exportIcs(list)

  if (options.output) {
    const safePath = resolveSafeOutputPath([os.homedir(), os.tmpdir()], options.output)
    if (!safePath) { consola.error(`Invalid output path — must be within home directory`); return }
    writeFileSync(safePath, content, { mode: 0o600 })
    consola.success(`Exported to: ${safePath}`)
  } else {
    consola.log(content)
  }
}
