/**
 * Service receipt / payment confirmation email parser.
 *
 * Targets:
 * - Netflix
 * - Spotify
 * - Amazon Prime
 * - Apple (App Store, iCloud, Apple Music)
 * - Google (Google One, YouTube Premium, Google Workspace)
 * - Adobe (Creative Cloud)
 * - Microsoft 365
 * - Notion
 * - Slack
 * - GitHub
 * - Figma
 * - Generic receipt patterns
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"

type ReceiptPattern = {
  name: string
  detect: RegExp
  nameExtract: RegExp
  amountExtract: RegExp
  cycleHint: RegExp
}

const RECEIPT_PATTERNS: ReceiptPattern[] = [
  {
    name: "Netflix",
    detect: /netflix/i,
    nameExtract: /Netflix/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /month|monthly/i,
  },
  {
    name: "Spotify",
    detect: /spotify/i,
    nameExtract: /Spotify/i,
    amountExtract: /(?:Amount|Total|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /month|monthly/i,
  },
  {
    name: "Amazon",
    detect: /amazon(?! co uk)(?!\.co\.jp)/i,
    nameExtract: /Amazon\s+(Prime|Music|Kindle|AWS)?/i,
    amountExtract: /(?:Amount|Total|Charged|Price|金額)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Apple",
    detect: /apple|icloud|app\s*store/i,
    nameExtract: /(?:Apple|iCloud|Apple\s+Music|Apple\s+TV|Apple\s+Arcade|Apple\s+One|App\s+Store)/i,
    amountExtract: /(?:Amount|Total|Charged|Price|金額)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Google",
    detect: /google/i,
    nameExtract: /(?:Google\s+One|YouTube\s+(?:Premium|Music)|Google\s+Workspace|Google\s+Play)/i,
    amountExtract: /(?:Amount|Total|Charged|Price|金額)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Adobe",
    detect: /adobe/i,
    nameExtract: /Adobe\s+(Creative\s+Cloud|Photoshop|Illustrator|Lightroom|Acrobat|Premiere)/i,
    amountExtract: /(?:Amount|Total|Charged|Price|小計|合計)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Microsoft",
    detect: /microsoft|office\s*365|m365|ms\s*365/i,
    nameExtract: /(?:Microsoft\s+365|Office\s+365|Microsoft\s+Azure|Xbox|Microsoft\s+Teams)/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Notion",
    detect: /notion/i,
    nameExtract: /Notion/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Slack",
    detect: /slack/i,
    nameExtract: /Slack/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "GitHub",
    detect: /github/i,
    nameExtract: /GitHub\s+(Pro|Team|Enterprise)?/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
  {
    name: "Figma",
    detect: /figma/i,
    nameExtract: /Figma/i,
    amountExtract: /(?:Amount|Total|Charged|Price)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    cycleHint: /(?:month|annual|year)/i,
  },
]

// Generic receipt keywords for fallback detection
const RECEIPT_KEYWORDS = /receipt|invoice|payment confirmation|charge|billing|subscription|purchase|receipt|領収書|請求書|支払|購入|ご利用ありがとう|Thank you for your (purchase|payment|order)/i

/**
 * Parse a service receipt/payment confirmation email.
 * Matches known services first, then falls back to generic receipt detection.
 */
export function parseReceiptEmail(email: RawEmail): SuggestionCandidate | null {
  const text = `${email.subject ?? ""}\n${email.textBody}`
  const subject = email.subject ?? ""

  for (const pattern of RECEIPT_PATTERNS) {
    if (!pattern.detect.test(text)) continue

    const nameMatch = text.match(pattern.nameExtract)
    const amountMatch = text.match(pattern.amountExtract)

    if (!amountMatch) continue

    const name = nameMatch ? nameMatch[0].trim() : pattern.name
    if (name.length > 100) continue

    const symbol = amountMatch[1]
    const rawAmount = amountMatch[2].replace(/,/g, "")
    const isDecimal = rawAmount.includes(".")
    const amount = isDecimal
      ? Math.round(parseFloat(rawAmount) * 100)
      : parseInt(rawAmount, 10)

    if (isNaN(amount) || amount <= 0 || amount > 99999999) continue

    const currencyMap: Record<string, string> = { "$": "USD", "¥": "JPY", "€": "EUR", "£": "GBP" }
    const currency = symbol ? (currencyMap[symbol] ?? "USD") : "USD"

    const cycle = pattern.cycleHint.test(text) ? "monthly" : null

    return {
      name,
      price: amount,
      currency,
      cycle,
      source: "email",
      sourceDetail: `Service receipt (${pattern.name})`,
      confidence: 0.85,
    }
  }

  // Generic receipt detection (lower confidence)
  if (RECEIPT_KEYWORDS.test(subject) || RECEIPT_KEYWORDS.test(email.textBody.slice(0, 500))) {
    return null // Let generic parser handle it with normal confidence
  }

  return null
}
