/**
 * Digital wallet payment notification email parser.
 *
 * Targets:
 * - PayPal
 * - Apple Pay
 * - Google Pay
 * - Stripe receipts
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"

type WalletPattern = {
  name: string
  detect: RegExp
  namePattern: RegExp
  amountPattern: RegExp
}

const WALLET_PATTERNS: WalletPattern[] = [
  // PayPal
  {
    name: "PayPal",
    detect: /paypal/i,
    namePattern: /(?:You sent a payment to|Payment to|Sent to|送金先|支払先)[^0-9]*([A-Za-z0-9\s\.]+?)(?:\s*$|\s*(?:for|から|に|$))/i,
    amountPattern: /(?:Amount|Total|Payment|金額|合計)[^0-9]*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  },
  // Apple Pay
  {
    name: "Apple Pay",
    detect: /Apple\s*Pay/i,
    namePattern: /(?:Merchant|商家?|Business)[：:]\s*(.+)/i,
    amountPattern: /(?:Amount|Total|金額)[：:]?\s*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  },
  // Google Pay
  {
    name: "Google Pay",
    detect: /Google\s*Pay/i,
    namePattern: /(?:Merchant|商家?|Paid to)[：:]\s*(.+)/i,
    amountPattern: /(?:Amount|Total|金額)[：:]?\s*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  },
  // Stripe
  {
    name: "Stripe",
    detect: /stripe/i,
    namePattern: /(?:Merchant|商家?|Business|Amount to)[：:]\s*(.+)/i,
    amountPattern: /(?:Amount|Total|金額)[：:]?\s*([$¥€£]?)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
  },
]

/**
 * Parse a digital wallet payment notification.
 */
export function parseWalletEmail(email: RawEmail): SuggestionCandidate | null {
  const text = `${email.subject ?? ""}\n${email.textBody}`

  for (const pattern of WALLET_PATTERNS) {
    if (!pattern.detect.test(text)) continue

    const nameMatch = text.match(pattern.namePattern)
    const amountMatch = text.match(pattern.amountPattern)

    if (!nameMatch || !amountMatch) continue

    let name = nameMatch[1].trim()
    name = name.replace(/<[^>]+>/g, "").trim()
    if (!name || name.length > 100) continue

    const symbol = amountMatch[1]
    const rawAmount = amountMatch[2].replace(/,/g, "")
    const isDecimal = rawAmount.includes(".")
    const amount = isDecimal
      ? Math.round(parseFloat(rawAmount) * 100)
      : parseInt(rawAmount, 10)

    if (isNaN(amount) || amount <= 0 || amount > 99999999) continue

    const currencyMap: Record<string, string> = { "$": "USD", "¥": "JPY", "€": "EUR", "£": "GBP" }
    const currency = symbol ? (currencyMap[symbol] ?? "USD") : "USD"

    return {
      name,
      price: amount,
      currency,
      cycle: "monthly",
      source: "email",
      sourceDetail: `Wallet notification (${pattern.name})`,
      confidence: 0.7,
    }
  }

  return null
}
