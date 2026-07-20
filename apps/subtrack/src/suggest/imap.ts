/**
 * IMAP email connection and search module.
 *
 * Uses imapflow for modern promise-based IMAP access.
 * Supports password/app-password authentication.
 * Gmail: requires an App Password (not regular password).
 */

import type { ImapConfig, RawEmail } from "./types.ts"
import { parseEmailContent } from "./email-parser.ts"

/**
 * Connect to IMAP server, search for recent emails, and return parsed content.
 * Searches the last N days (default: 30) in the specified mailbox (default: INBOX).
 * Filters for common subscription-related keywords to reduce noise.
 */
export async function connectAndSearch(
  config: ImapConfig,
  password: string,
  options: { sinceDays?: number; mailbox?: string; signal?: AbortSignal } = {},
): Promise<RawEmail[]> {
  const { sinceDays = 30, mailbox = "INBOX", signal } = options

  // Dynamic import to avoid loading imapflow when IMAP is not configured
  const { ImapFlow } = await import("imapflow")

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: {
      user: config.username,
      pass: password,
    },
    logger: false,
  })

  try {
    await client.connect()

    const lock = await client.getMailboxLock(mailbox)
    try {
      // Calculate the date range
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - sinceDays)

      // Build search query for subscription-related keywords
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const searchQuery: any = [
        "OR",
        "OR",
        "OR",
        ["SUBJECT", "receipt"],
        ["SUBJECT", "payment"],
        ["SUBJECT", "subscription"],
        ["SUBJECT", "invoice"],
        "OR",
        "OR",
        "OR",
        ["SUBJECT", "引き落とし"],
        ["SUBJECT", "ご利用"],
        ["SUBJECT", "支払"],
        ["SUBJECT", "領収書"],
        "SINCE", sinceDate,
      ]

      const results: RawEmail[] = []
      const fetchOptions = { source: true }

      for await (const msg of client.fetch(searchQuery, fetchOptions)) {
        if (signal?.aborted) break

        try {
          const raw = msg.source?.toString("utf-8") ?? ""
          if (!raw.trim()) continue

          const email = parseEmailContent(raw, String(msg.uid))
          results.push(email)
        } catch {
          // Skip emails that fail to parse
          continue
        }

        // Limit results to prevent processing too many
        if (results.length >= 50) break
      }

      return results
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}
