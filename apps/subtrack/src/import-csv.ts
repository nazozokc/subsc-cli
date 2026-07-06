import { consola } from "consola"
import { statSync, readFileSync } from "node:fs"
import { writeSubscription, findSubscriptionByName } from "./db.ts"
import { logAudit } from "./audit.ts"
import { validateName, validatePrice, validateTags, isValidCurrency, isValidCycle } from "./prompts.ts"
import os from "node:os"
import { resolveSafePath } from "./path-utils.ts"

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
    consola.error("Usage: subtrack import <file> [--dry-run]")
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
  // Strip BOM and normalize line endings
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const clean = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    consola.error("CSV file must have a header row and at least one data row")
    return
  }

  const dataLines = lines.slice(1)
  if (dataLines.length > MAX_CSV_ROWS) {
    consola.error(
      `CSV file has ${dataLines.length} data rows (max ${MAX_CSV_ROWS}). ` +
      "Split the file into smaller batches.",
    )
    return
  }

  // Validate header
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const hasNotes = header.length >= 6 && header[5] === "notes"
  const expectedBase = "name,cycle,tags,price,currency"
  const expectedNotes = "name,cycle,tags,price,currency,notes"
  const actual = header.join(",")
  if (actual !== expectedBase && actual !== expectedNotes) {
    consola.error(
      `Invalid CSV header. Expected: ${expectedBase} or ${expectedNotes}`,
    )
    return
  }

  let success = 0
  let failed = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length < 5) {
      consola.warn(`Line ${i + 1}: skipping (expected 5 fields, got ${fields.length})`)
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

    const name = fields[0]
    const cycle = fields[1]
    const tagsStr = fields[2]
    const priceStr = fields[3]
    const currency = fields[4]
    const notes = hasNotes ? (fields[5]?.trim() || null) : null

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
