import { readFileSync } from "node:fs"
import { consola } from "consola"
import { fail } from "./error.ts"
import { logAudit } from "./audit.ts"
import { writeSuggestionBatch } from "./db/suggestions.ts"
import { parseEmail } from "./suggest/parser/index.ts"
import { handleSuggestReview } from "./suggest/suggest.ts"
import type { RawEmail } from "./suggest/types.ts"

function readReceipts(file: string): RawEmail[] {
  const text = readFileSync(file, "utf8")
  if (file.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows.map((value, index) => { const row = value as Record<string, unknown>; return { id: String(index), textBody: String(row.body ?? row.text ?? ""), subject: row.subject ? String(row.subject) : null, from: row.from ? String(row.from) : null, date: row.date ? new Date(String(row.date)) : null } })
  }
  if (file.toLowerCase().endsWith(".csv")) return text.split(/\r?\n/).slice(1).filter(Boolean).map((line) => { const [body, subject, from, date] = line.split(","); return { id: line, textBody: body ?? "", subject: subject ?? null, from: from ?? null, date: date ? new Date(date) : null } })
  return [{ id: file, textBody: text, subject: null, from: null, date: null }]
}

/** Parse a local receipt file into pending subscription suggestions. */
export async function handleReceipt(file: string, options: { dryRun?: boolean; review?: boolean; json?: boolean } = {}): Promise<void> {
  let candidates
  try { candidates = readReceipts(file).map(parseEmail).filter((candidate): candidate is NonNullable<ReturnType<typeof parseEmail>> => !!candidate) }
  catch (error) { fail(`Failed to read receipt: ${error instanceof Error ? error.message : String(error)}`); return }
  if (options.json || options.dryRun) process.stdout.write(JSON.stringify(candidates, null, 2) + "\n")
  if (options.dryRun) return
  if (!candidates.length) { consola.info("No receipt candidates found"); return }
  writeSuggestionBatch(candidates)
  logAudit("suggestion.receipt", { details: `${candidates.length} receipt candidate(s) imported` })
  consola.success(`Imported ${candidates.length} receipt candidate(s)`)
  if (options.review) await handleSuggestReview()
}
