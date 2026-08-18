import { consola } from "consola"
import { fail } from "./error.ts"
import { statSync, readFileSync } from "node:fs"
import { writeSubscription, findSubscriptionByName } from "./db.ts"
import { logAudit } from "./audit.ts"
import {
  validateName,
  validatePrice,
  validateTags,
  isValidCurrency,
  isValidCycle,
  isValidStatus,
  validateDiscountValue,
  validateDiscountType,
  validateAutoRenewal,
  validateDateString,
} from "./prompts.ts"
import os from "node:os"
import { safePath } from "./path-utils.ts"
import type { Status, DiscountType } from "./types.ts"

const MAX_CSV_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_CSV_ROWS = 10_000           // max data rows to prevent DoS
const MAX_FIELD_LENGTH = 500          // max length per field

// ── CSV Parser ────────────────────────────────────────────

export function parseCsvLine(line: string): string[] {
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
    } else if (ch === ",") {
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

// ── Import Handler ────────────────────────────────────────

export async function handleImport(
  file: string,
  options: { dryRun?: boolean; deduplicate?: boolean },
) {
  if (!file) {
    fail("Usage: subtrack import <file> [--dry-run]")
    return
  }

  // Validate path is within allowed base directories (also verifies existence)
  const safeFile = safePath(file)
  if (!safeFile) {
    fail(`File not found or path not allowed — must be within home or temp directory`)
    return
  }

  let content: string
  try {
    const st = statSync(safeFile)
    if (st.size > MAX_CSV_SIZE) {
      fail(
        `File too large (${(st.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_CSV_SIZE / 1024 / 1024} MB`,
      )
      return
    }
    content = readFileSync(safeFile, "utf-8")
  } catch (err) {
    fail(`Failed to read file: ${String(err)}`)
    return
  }
  // Strip BOM and normalize line endings
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const clean = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    fail("CSV file must have a header row and at least one data row")
    return
  }

  const dataLines = lines.slice(1)
  if (dataLines.length > MAX_CSV_ROWS) {
    fail(
      `CSV file has ${dataLines.length} data rows (max ${MAX_CSV_ROWS}). ` +
      "Split the file into smaller batches.",
    )
    return
  }

  // Validate header: column-name based so both the documented format
  // (name,cycle,tags,price,currency[,notes]) and the export format
  // (name,status,cycle,tags,price,currency,notes,payment_method,contract_start,
  //  contract_end,auto_renewal,vendor_name,vendor_url,plan_tier,discount_amount,
  //  discount_type) are accepted.
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const colIndex = new Map<string, number>()
  header.forEach((h, i) => { if (h) colIndex.set(h, i) })

  const requiredCols = ["name", "cycle", "tags", "price", "currency"]
  const missing = requiredCols.filter((c) => !colIndex.has(c))
  if (missing.length > 0) {
    fail(
      `Invalid CSV header. Required columns: ${requiredCols.join(", ")} (missing: ${missing.join(", ")})`,
    )
    return
  }

  let fieldsOfRow: string[] = []
  const col = (name: string): string | undefined => {
    const idx = colIndex.get(name)
    return idx === undefined ? undefined : (fieldsOfRow[idx]?.trim() || undefined)
  }

  let success = 0
  let failed = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    fieldsOfRow = fields
    if (fields.length < requiredCols.length) {
      consola.warn(`Line ${i + 1}: skipping (expected ${requiredCols.length} fields, got ${fields.length})`)
      failed++
      continue
    }

    // Field length check (prevent memory exhaustion)
    const fieldTooLong = fields.some((f) => f.length > MAX_FIELD_LENGTH)
    if (fieldTooLong) {
      consola.warn(`Line ${i + 1}: skipping (field exceeds ${MAX_FIELD_LENGTH} characters)`)
      failed++
      continue
    }

    const name = col("name") ?? ""
    const cycle = col("cycle") ?? ""
    const tagsStr = col("tags") ?? ""
    const priceStr = col("price") ?? ""
    const currency = col("currency") ?? ""
    const notes = col("notes") ?? null

    // Optional fields — only read when the column exists in the header
    const status = col("status") ?? "active"
    const paymentMethod = col("payment_method") ?? null
    const contractStart = col("contract_start") ?? null
    const contractEnd = col("contract_end") ?? null
    const autoRenewal = col("auto_renewal")
    const vendorName = col("vendor_name") ?? null
    const vendorUrl = col("vendor_url") ?? null
    const planTier = col("plan_tier") ?? null
    const discountAmount = col("discount_amount") ?? null
    const discountType = col("discount_type") ?? null

    // Sanitize: strip control characters from name/notes (CSV injection defense)
    const sanitized = name.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

    // Validate
    const nameErr = validateName(sanitized)
    if (nameErr !== true) { consola.warn(`Line ${i + 1}: ${nameErr}`); failed++; continue }

    const priceErr = validatePrice(priceStr)
    if (priceErr !== true) { consola.warn(`Line ${i + 1}: ${priceErr}`); failed++; continue }

    if (!isValidCurrency(currency)) {
      consola.warn(`Line ${i + 1}: invalid currency "${currency}"`)
      failed++
      continue
    }
    if (!isValidCycle(cycle)) {
      consola.warn(`Line ${i + 1}: invalid cycle "${cycle}"`)
      failed++
      continue
    }
    if (!isValidStatus(status)) {
      consola.warn(`Line ${i + 1}: invalid status "${status}"`)
      failed++
      continue
    }
    if (discountAmount !== null) {
      const discountErr = validateDiscountValue(discountAmount)
      if (discountErr !== true) { consola.warn(`Line ${i + 1}: ${discountErr}`); failed++; continue }
    }
    if (discountType !== null) {
      const discountTypeErr = validateDiscountType(discountType)
      if (discountTypeErr !== true) { consola.warn(`Line ${i + 1}: ${discountTypeErr}`); failed++; continue }
    }
    if (autoRenewal !== undefined) {
      const autoRenewalErr = validateAutoRenewal(autoRenewal)
      if (autoRenewalErr !== true) { consola.warn(`Line ${i + 1}: ${autoRenewalErr}`); failed++; continue }
    }
    if (contractStart !== null) {
      const csErr = validateDateString(contractStart)
      if (csErr !== true) { consola.warn(`Line ${i + 1}: ${csErr}`); failed++; continue }
    }
    if (contractEnd !== null) {
      const ceErr = validateDateString(contractEnd)
      if (ceErr !== true) { consola.warn(`Line ${i + 1}: ${ceErr}`); failed++; continue }
    }

    const tags = tagsStr.split(";").map((t) => t.trim()).filter(Boolean)
    const tagsErr = validateTags(tags.join(","))
    if (tagsErr !== true) { consola.warn(`Line ${i + 1}: ${tagsErr}`); failed++; continue }

    // Dedup check: skip or warn if same name already exists
    if (options.deduplicate) {
      const existing = findSubscriptionByName(sanitized.trim())
      if (existing) {
        consola.warn(
          `Line ${i + 1}: "${sanitized.trim()}" already exists (id=${existing.id}) — skipping`,
        )
        failed++
        continue
      }
    }

    if (options.dryRun) {
      consola.info(`[dry-run] Would import: ${sanitized} (${priceStr} ${currency}, ${cycle})`)
      success++
    } else {
      try {
        writeSubscription({
          name: sanitized.trim(),
          price: Number(priceStr),
          currency,
          cycle,
          tags,
          notes: notes ?? undefined,
          status: status as Status,
          paymentMethod: paymentMethod ?? undefined,
          contractStart: contractStart ?? undefined,
          contractEnd: contractEnd ?? undefined,
          autoRenewal: autoRenewal === undefined ? undefined : autoRenewal === "true",
          vendorName: vendorName ?? undefined,
          vendorUrl: vendorUrl ?? undefined,
          planTier: planTier ?? undefined,
          discountAmount: discountAmount === null ? undefined : Number(discountAmount),
          discountType: discountType as DiscountType | undefined,
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
    logAudit("subscription.import", {
      details: `${success} imported, ${failed} failed from ${file}`,
    })
    consola.success(`Import complete: ${success} imported, ${failed} failed`)
  }
}
