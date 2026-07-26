/**
 * Generic email parser — fallback that extracts any amount + name pattern.
 *
 * Always returns a result (low confidence) for any email with a recognizable
 * amount. Uses the email subject/sender as the service name hint.
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"

// Common currency symbols and their ISO codes
const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "¥": "JPY",
  "€": "EUR",
  "£": "GBP",
  "A$": "AUD",
  "C$": "CAD",
  "HK$": "HKD",
  "S$": "SGD",
  "kr": "SEK",
  "R$": "BRL",
}

// Abbreviated month names for date parsing
const MONTHS_SHORT = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
]

/**
 * Extract a name from email subject/sender or body.
 */
function extractName(email: RawEmail): string {
  // Try subject first
  const subject = email.subject ?? ""
  const cleaned = subject
    .replace(/^(?:Re|Fwd?|Thank you for your|Receipt|Invoice|Payment|Your)\s*/i, "")
    .replace(/receipt|payment|invoice|confirmation|notification/i, "")
    .replace(/[\[\]【】「」『』]/g, "")
    .trim()

  if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned

  // Try from address domain
  const from = email.from ?? ""
  const domainMatch = from.match(/@([^.]+)/)
  if (domainMatch) {
    const domain = domainMatch[1]
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  }

  return "Unknown Service"
}

/**
 * Extract a price from text. Returns { amount, currency } or null.
 */
function extractPrice(text: string): { amount: number; currency: string } | null {
  // Try patterns like: ¥1,234 / $9.99 / €10.00 / 1,234円 / 1,234 円
  const patterns = [
    // Japanese yen: ¥1,234 or 1,234円 or 1,234 円
    { re: /¥\s*([0-9,]+)/, ccy: "JPY" },
    { re: /([0-9,]+)\s*円/, ccy: "JPY" },
    // USD: $9.99
    { re: /\$\s*([0-9]+(?:\.[0-9]{1,2})?)/, ccy: "USD" },
    // EUR: €10.00
    { re: /€\s*([0-9]+(?:\.[0-9]{1,2})?)/, ccy: "EUR" },
    // GBP: £10.00
    { re: /£\s*([0-9]+(?:\.[0-9]{1,2})?)/, ccy: "GBP" },
    // Amount keyword: "amount: $9.99", "total: $19.99", "価格: ¥1,000"
    { re: /(?:amount|total|price|charge|cost|payment|金額|価格|料金)\s*[:：]?\s*([¥$€£])\s*([0-9,]+(?:\.[0-9]{1,2})?)/i, ccy: null },
  ]

  for (const { re, ccy } of patterns) {
    const match = text.match(re)
    if (match) {
      if (ccy) {
        const rawAmount = parseFloat(match[1].replace(/,/g, ""))
        if (rawAmount > 0 && rawAmount < 99999999) {
          // Scale: JPY is zero-decimal, others are fractional
          const amount = ccy === "JPY" ? Math.round(rawAmount) : Math.round(rawAmount * 100)
          return { amount, currency: ccy }
        }
      } else {
        // Symbol-based
        const symbol = match[1]
        const rawAmount = parseFloat(match[2].replace(/,/g, ""))
        const currency = CURRENCY_SYMBOLS[symbol] ?? "USD"
        if (rawAmount > 0 && rawAmount < 99999999) {
          const amount = currency === "JPY" ? Math.round(rawAmount) : Math.round(rawAmount * 100)
          return { amount, currency }
        }
      }
    }
  }

  return null
}

/**
 * Extract a date from text. Returns YYYY-MM-DD string or null.
 */
function extractDate(text: string): string | null {
  // Try various date patterns
  const patterns = [
    // YYYY/MM/DD
    { re: /(\d{4})\/(\d{1,2})\/(\d{1,2})/ },
    // YYYY-MM-DD
    { re: /(\d{4})-(\d{1,2})-(\d{1,2})/ },
    // MM/DD/YYYY or DD/MM/YYYY
    { re: /(\d{1,2})\/(\d{1,2})\/(\d{4})/ },
    // "July 20, 2026" or "20 July 2026"
    { re: new RegExp(`(${MONTHS_SHORT.join("|")})[a-z]*\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i") },
  ]

  for (const { re } of patterns) {
    const match = text.match(re)
    if (match) {
      if (match[0].includes("/") && match[0].length === 10) {
        // YYYY/MM/DD or MM/DD/YYYY
        if (match[1].length === 4) {
          return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
        }
        return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
      }
      if (match[0].includes("-")) {
        return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
      }
      // Month name format
      if (isNaN(Number(match[1]))) {
        const monthIdx = MONTHS_SHORT.indexOf(match[1].toLowerCase().slice(0, 3))
        if (monthIdx !== -1) {
          return `${match[3]}-${String(monthIdx + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`
        }
      }
    }
  }

  // Fallback: use email date
  return null
}

/**
 * Estimated cycle from amount context clues.
 */
function guessCycle(text: string): string | null {
  if (/\b(monthly|per month|mo|month|月額|毎月)\b/i.test(text)) return "monthly"
  if (/\b(yearly|annual|per year|yr|年額|年間|毎年)\b/i.test(text)) return "yearly"
  if (/\b(weekly|per week|毎週)\b/i.test(text)) return "weekly"
  if (/\b(quarterly|四半期)\b/i.test(text)) return "quarterly"
  return null
}

/**
 * Generic fallback parser. Tries to extract name + price + date from any email.
 * Always returns a result if a price is found.
 */
export function parseGenericEmail(email: RawEmail): SuggestionCandidate | null {
  const body = email.textBody
  const subject = email.subject ?? ""
  const text = `${subject}\n${body}`

  const price = extractPrice(text)
  if (!price) return null

  const name = extractName(email)
  const date = extractDate(text)
  const cycle = guessCycle(text)

  return {
    name,
    price: price.amount,
    currency: price.currency,
    cycle,
    source: "email",
    sourceDetail: `Parsed from email${email.subject ? `: ${email.subject}` : ""}`,
    confidence: 0.4, // Low confidence — generic extraction
  }
}
