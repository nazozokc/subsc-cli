/**
 * Types for the suggestion system.
 */

export type SuggestionStatus = "pending" | "dismissed" | "added"

export type SuggestionSource = "email" | "manual"

export type Suggestion = {
  id: number
  name: string
  price: number | null
  currency: string | null
  cycle: string | null
  vendorName: string | null
  vendorUrl: string | null
  planTier: string | null
  paymentMethod: string | null
  source: string
  sourceDetail: string | null
  emailSubject: string | null
  emailFrom: string | null
  emailDate: string | null
  confidence: number
  status: SuggestionStatus
  matchedSubId: number | null
  createdAt: string
}

/** Raw email fetched from IMAP or read from a file. */
export type RawEmail = {
  id: string
  from: string | null
  subject: string | null
  date: Date | null
  textBody: string
}

/** Parsed suggestion candidate before DB insertion. */
export type SuggestionCandidate = {
  name: string
  price: number | null
  currency: string | null
  cycle: string | null
  vendorName?: string | null
  vendorUrl?: string | null
  planTier?: string | null
  paymentMethod?: string | null
  source: string
  sourceDetail?: string | null
  confidence: number
}

/** IMAP connection settings. */
export type ImapConfig = {
  host: string
  port: number
  tls: boolean
  username: string
}

/** Options for the suggest command. */
export type SuggestListFlags = {
  all?: boolean
  json?: boolean
}

export type SuggestDismissFlags = {
  all?: boolean
}
