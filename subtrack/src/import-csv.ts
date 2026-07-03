import { consola } from "consola"
import { statSync, readFileSync } from "node:fs"
import { writeSubscription } from "./db.ts"
import {
  validateName, validatePrice, validateTags,
  isValidCurrency, isValidCycle, isValidStatus,
  validateBillingDay, validateNotes, validatePaymentMethod,
  validateDateString, validateVendorName, validateVendorUrl,
  validatePlanTier, validateDiscountValue,
} from "./prompts.ts"
import os from "node:os"
import { resolveSafePath } from "./path-utils.ts"
import type { Status, Cycle, Currency } from "./types.ts"

const MAX_CSV_SIZE = 10 * 1024 * 1024 // 10 MB

// ── CSV Parser ────────────────────────────────────────────

export function parseCsvLine(line: string, delimiter = ","): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === delimiter) {
      fields.push(current)
      current = ""
    } else if (ch === '"') {
      inQuotes = true
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ── Column mapping ─────────────────────────────────────────

const KNOWN_FIELDS = [
  "name", "price", "currency", "cycle", "tags",
  "notes", "status", "payment_method", "billing_day", "billingDay",
  "contract_start", "contract_end", "auto_renewal",
  "vendor_name", "vendor_url", "plan_tier",
  "discount_amount", "discount_type",
] as const

type FieldMap = Record<string, string> // CSV header -> field name

function parseFieldMap(mapStr: string): FieldMap {
  const map: FieldMap = {}
  for (const pair of mapStr.split(",")) {
    const [csvCol, field] = pair.split(":").map((s) => s.trim().toLowerCase())
    if (csvCol && field && (KNOWN_FIELDS as readonly string[]).includes(field)) {
      map[csvCol] = field
    }
  }
  return map
}

function autoDetectFieldMap(header: string[]): FieldMap {
  const map: FieldMap = {}
  const lowerHeaders = header.map((h) => h.toLowerCase().trim())

  // Try exact match first
  const headerToField: Record<string, string> = {
    "name": "name",
    "service": "name",
    "subscription": "name",
    "price": "price",
    "amount": "price",
    "cost": "price",
    "currency": "currency",
    "ccy": "currency",
    "cycle": "cycle",
    "billing cycle": "cycle",
    "interval": "cycle",
    "period": "cycle",
    "frequency": "cycle",
    "tags": "tags",
    "tag": "tags",
    "category": "tags",
    "notes": "notes",
    "note": "notes",
    "description": "notes",
    "status": "status",
    "payment method": "payment_method",
    "payment_method": "payment_method",
    "method": "payment_method",
    "billing day": "billing_day",
    "billing_day": "billingDay",
    "billingday": "billingDay",
    "contract start": "contract_start",
    "contract_start": "contract_start",
    "contract end": "contract_end",
    "contract_end": "contract_end",
    "auto renewal": "auto_renewal",
    "auto_renewal": "auto_renewal",
    "vendor": "vendor_name",
    "vendor name": "vendor_name",
    "vendor_name": "vendor_name",
    "vendor url": "vendor_url",
    "vendor_url": "vendor_url",
    "plan": "plan_tier",
    "plan tier": "plan_tier",
    "plan_tier": "plan_tier",
    "discount": "discount_amount",
    "discount amount": "discount_amount",
    "discount_amount": "discount_amount",
    "discount type": "discount_type",
    "discount_type": "discount_type",
  }

  for (const h of lowerHeaders) {
    if (headerToField[h]) {
      map[h] = headerToField[h]
    }
  }

  return map
}

// ── Import Handler ────────────────────────────────────────

export type ImportOptions = {
  dryRun?: boolean
  map?: string
  delimiter?: string
}

export async function handleImport(
  file: string,
  options: ImportOptions = {},
) {
  if (!file) {
    consola.error("Usage: subtrack import <file> [--dry-run] [--map cols] [--delimiter]")
    return
  }

  // Validate path is within allowed base directories (also verifies existence)
  const safeFile = resolveSafePath([os.homedir(), os.tmpdir()], file)
  if (!safeFile) {
    consola.error(`File not found or path not allowed — must be within home or temp directory`)
    return
  }

  let content: string
  try {
    const st = statSync(safeFile)
    if (st.size > MAX_CSV_SIZE) {
      consola.error(
        `File too large (${(st.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_CSV_SIZE / 1024 / 1024} MB`,
      )
      return
    }
    content = readFileSync(safeFile, "utf-8")
  } catch (err) {
    consola.error(`Failed to read file: ${String(err)}`)
    return
  }
  // Strip BOM
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const delimiter = options.delimiter ?? ","
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    consola.error("CSV file must have a header row and at least one data row")
    return
  }

  // Parse header and determine column mapping
  const header = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().trim())
  let fieldMap: FieldMap

  if (options.map) {
    fieldMap = parseFieldMap(options.map)
    if (Object.keys(fieldMap).length === 0) {
      consola.error("Invalid column mapping. Use format: --map 'name:Name,price:Amount,currency:Curr'")
      return
    }
  } else {
    fieldMap = autoDetectFieldMap(header)
  }

  // Verify required fields are mapped
  if (!fieldMap["name"] && !Object.values(fieldMap).includes("name")) {
    consola.error("CSV must have a 'name' column (or use --map to specify mapping)")
    return
  }
  const hasAutoName = Object.values(fieldMap).includes("name")

  // Build column index: field name -> column index
  const colIndex: Record<string, number> = {}
  for (const [csvCol, field] of Object.entries(fieldMap)) {
    const idx = header.indexOf(csvCol)
    if (idx !== -1) {
      colIndex[field] = idx
    }
  }

  if (Object.keys(colIndex).length < 2) {
    consola.error("Could not map enough columns. Use --map to specify: --map 'name:Name,price:Amount,currency:Curr'")
    return
  }

  // Check if we have a mapped name
  const nameCol = colIndex["name"]
  if (nameCol === undefined) {
    consola.error("Failed to locate 'name' column in CSV header")
    return
  }

  let success = 0
  let failed = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter)
    if (fields.length < Math.max(...Object.values(colIndex)) + 1) {
      consola.warn(`Line ${i + 1}: skipping (not enough columns)`)
      failed++
      continue
    }

    const getField = (field: string): string | undefined => {
      const idx = colIndex[field]
      return idx !== undefined ? fields[idx]?.trim() : undefined
    }

    const name = getField("name") ?? ""
    if (!name) {
      consola.warn(`Line ${i + 1}: name is required`)
      failed++
      continue
    }

    const nameErr = validateName(name)
    if (nameErr !== true) { consola.warn(`Line ${i + 1}: ${nameErr}`); failed++; continue }

    // Price: try price column, or fallback to 0
    let price: number | undefined
    const priceStr = getField("price")
    if (priceStr) {
      const priceErr = validatePrice(priceStr)
      if (priceErr !== true) { consola.warn(`Line ${i + 1}: ${priceErr}`); failed++; continue }
      price = Number(priceStr)
    }

    // Currency
    let currency = getField("currency") ?? ""
    if (currency && !isValidCurrency(currency)) {
      consola.warn(`Line ${i + 1}: invalid currency "${currency}"`)
      failed++
      continue
    }

    // Cycle
    let cycle = getField("cycle") ?? ""
    if (cycle && !isValidCycle(cycle)) {
      consola.warn(`Line ${i + 1}: invalid cycle "${cycle}"`)
      failed++
      continue
    }

    // Tags
    const tagsStr = getField("tags") ?? ""
    const tags = tagsStr.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
    if (tags.length > 0) {
      const tagsErr = validateTags(tags.join(","))
      if (tagsErr !== true) { consola.warn(`Line ${i + 1}: ${tagsErr}`); failed++; continue }
    }

    // Optional fields
    const notes = getField("notes") ?? undefined
    const status = getField("status") as Status | undefined
    const paymentMethod = getField("payment_method") ?? undefined
    const billingDayStr = getField("billingDay") ?? getField("billing_day") ?? undefined
    const contractStart = getField("contract_start") ?? undefined
    const contractEnd = getField("contract_end") ?? undefined
    const autoRenewalStr = getField("auto_renewal") ?? undefined
    const vendorName = getField("vendor_name") ?? undefined
    const vendorUrl = getField("vendor_url") ?? undefined
    const planTier = getField("plan_tier") ?? undefined
    const discountAmountStr = getField("discount_amount") ?? undefined
    const discountType = getField("discount_type") as "percentage" | "fixed" | undefined

    // Validate optional fields
    if (status && status !== "active" && status !== "paused" && status !== "cancelled") {
      consola.warn(`Line ${i + 1}: invalid status "${status}"`)
      failed++
      continue
    }

    if (billingDayStr) {
      const bdErr = validateBillingDay(billingDayStr)
      if (bdErr !== true) { consola.warn(`Line ${i + 1}: ${bdErr}`); failed++; continue }
    }

    if (contractStart) {
      const csErr = validateDateString(contractStart)
      if (csErr !== true) { consola.warn(`Line ${i + 1}: ${csErr}`); failed++; continue }
    }
    if (contractEnd) {
      const ceErr = validateDateString(contractEnd)
      if (ceErr !== true) { consola.warn(`Line ${i + 1}: ${ceErr}`); failed++; continue }
    }

    if (notes) {
      const nErr = validateNotes(notes)
      if (nErr !== true) { consola.warn(`Line ${i + 1}: ${nErr}`); failed++; continue }
    }
    if (paymentMethod) {
      const pmErr = validatePaymentMethod(paymentMethod)
      if (pmErr !== true) { consola.warn(`Line ${i + 1}: ${pmErr}`); failed++; continue }
    }

    if (options.dryRun) {
      const priceDisplay = price ? `${price} ${currency}` : "no price"
      consola.info(`[dry-run] Would import: ${name} (${priceDisplay}, ${cycle || "unknown cycle"})`)
      success++
    } else {
      try {
        writeSubscription({
          name: name.trim(),
          price: price ?? 0,
          currency: currency || "USD",
          cycle: (cycle || "monthly") as Cycle,
          tags,
          notes: notes || null,
          status: (status as Status) ?? "active",
          paymentMethod: paymentMethod || null,
          billingDay: billingDayStr ? Number(billingDayStr) : null,
          contractStart: contractStart || null,
          contractEnd: contractEnd || null,
          autoRenewal: autoRenewalStr ? autoRenewalStr.toLowerCase() !== "false" : true,
          vendorName: vendorName || null,
          vendorUrl: vendorUrl || null,
          planTier: planTier || null,
          discountAmount: discountAmountStr ? Number(discountAmountStr) : null,
          discountType: discountType || null,
        })
        success++
      } catch (e) {
        consola.warn(`Line ${i + 1}: failed to import: ${String(e)}`)
        failed++
      }
    }
  }

  if (options.dryRun) {
    consola.success(`Dry-run complete: ${success} valid, ${failed} invalid`)
  } else {
    consola.success(`Import complete: ${success} imported, ${failed} failed`)
  }
}
