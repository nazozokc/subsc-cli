/**
 * Auto-scan orchestration.
 *
 * Manages scan cooldown (1 hour), triggers IMAP connection, parses emails,
 * and stores results in the database.
 */

import { consola } from "consola"
import { fail } from "../error.ts"
import { loadConfig, saveConfig } from "../config.ts"
import { writeSuggestionBatch } from "../db/suggestions.ts"
import { connectAndSearch } from "./imap.ts"
import { parseEmail } from "./parser/index.ts"
import type { SuggestionCandidate } from "./types.ts"

const SCAN_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour
const SCAN_TIMEOUT_MS = 20 * 1000 // 20 seconds

/**
 * Called at the start of display commands.
 * Checks if a scan is needed (cooldown passed) and IMAP is configured.
 * If stale, triggers a scan silently on failure.
 */
export async function autoScan(): Promise<void> {
  const config = loadConfig()

  // Skip if no IMAP configured
  if (!config.imap?.host || !config.imap?.username) return

  // Check cooldown
  const lastScan = config.suggestLastScan
  if (lastScan) {
    const elapsed = Date.now() - new Date(lastScan).getTime()
    if (elapsed < SCAN_COOLDOWN_MS) return
  }

  // Skip if password not set
  const password = process.env.SUBTRACK_IMAP_PASSWORD
  if (!password) return

  // Perform scan
  consola.info("Checking emails for new subscription suggestions...")
  try {
    const count = await scanEmails(config.imap, password, SCAN_TIMEOUT_MS)
    if (count > 0) {
      consola.success(`Found ${count} new suggestion${count > 1 ? "s" : ""}`)
    }
  } catch {
    // Silent failure — don't block user command with IMAP errors
  }
}

/**
 * Force a scan (ignores cooldown). Returns the number of new suggestions found.
 */
export async function handleSuggestScan(): Promise<number> {
  const config = loadConfig()

  if (!config.imap?.host || !config.imap?.username) {
    fail("IMAP not configured. Run:\n  subtrack config set imapHost <host>\n  subtrack config set imapUsername <email>\n  export SUBTRACK_IMAP_PASSWORD=<password>")
    return 0
  }

  const password = process.env.SUBTRACK_IMAP_PASSWORD
  if (!password) {
    fail("IMAP password not set. Run:\n  export SUBTRACK_IMAP_PASSWORD=<password>")
    consola.info("For Gmail, use an App Password (not your regular password)")
    return 0
  }

  consola.info("Scanning emails for subscription suggestions... (this may take a moment)")
  try {
    const count = await scanEmails(config.imap, password, 60000)
    consola.success(`Scan complete. ${count} new suggestion${count !== 1 ? "s" : ""} found.`)
    return count
  } catch (err) {
    fail(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  }
}

/**
 * Core scan logic: connect IMAP → fetch emails → parse → store in DB.
 * Returns the number of new suggestions stored.
 */
async function scanEmails(
  imapConfig: NonNullable<ReturnType<typeof loadConfig>["imap"]>,
  password: string,
  timeoutMs: number,
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const emails = await connectAndSearch(imapConfig, password, { signal: controller.signal })

    if (emails.length === 0) {
      consola.info("No relevant emails found in the last 30 days.")
      return 0
    }

    const candidates: SuggestionCandidate[] = []
    for (const email of emails) {
      const result = parseEmail(email)
      if (result) {
        candidates.push(result)
      }
    }

    if (candidates.length === 0) {
      // Save scan timestamp even if no candidates found
      updateLastScan()
      return 0
    }

    const inserted = writeSuggestionBatch(
      candidates.map((c) => ({
        name: c.name,
        price: c.price,
        currency: c.currency,
        cycle: c.cycle,
        vendorName: c.vendorName,
        source: c.source,
        sourceDetail: c.sourceDetail,
        confidence: c.confidence,
      })),
    )

    updateLastScan()
    return inserted
  } finally {
    clearTimeout(timer)
  }
}

/** Update the last scan timestamp in config. */
function updateLastScan(): void {
  const config = loadConfig()
  config.suggestLastScan = new Date().toISOString()
  saveConfig(config)
}
