/**
 * Credit card usage email parser.
 *
 * Targets:
 * - Rakuten Card (楽天カード)
 * - SMBC Card (三井住友カード)
 * - JCB
 * - American Express
 * - Visa/Mastercard generic
 * - Other Japanese credit card notifications
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"

type CardPattern = {
  name: string
  detect: RegExp
  namePattern: RegExp
  amountPattern: RegExp
  datePattern: RegExp
}

const CARD_PATTERNS: CardPattern[] = [
  // Rakuten Card
  {
    name: "Rakuten Card",
    detect: /楽天カード|Rakuten Card/i,
    namePattern: /(?:ご利用先|加盟店)[：:]\s*(.+)/,
    amountPattern: /(?:ご利用金額|お支払金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:ご利用日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // SMBC Card / Vpass
  {
    name: "SMBC Card",
    detect: /三井住友|Vpass|SMBC Card/i,
    namePattern: /(?:ご利用先|加盟店名)[：:]\s*(.+)/,
    amountPattern: /(?:ご利用金額|お支払金額|ご利用額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:ご利用日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // JCB
  {
    name: "JCB",
    detect: /JCB|ジェーシービー/i,
    namePattern: /(?:ご利用先|ショップ名)[：:]\s*(.+)/,
    amountPattern: /(?:ご利用金額|お支払金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:ご利用日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // American Express
  {
    name: "American Express",
    detect: /American Express|AMEX|アメックス/i,
    namePattern: /(?:Merchant|商家?)[：:]\s*(.+)/i,
    amountPattern: /(?:Amount|金額)[：:]\s*[¥$￥€£]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    datePattern: /(?:Date|日付)[：:]\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}\/\d{1,2}\/\d{1,2})/i,
  },
  // Generic Visa/Mastercard
  {
    name: "Credit Card",
    detect: /VISA|MasterCard|マスターカード|クレジットカード/i,
    namePattern: /(?:ご利用先|加盟店|Merchant|Vendor)[：:]\s*(.+)/i,
    amountPattern: /(?:ご利用金額|金額|Amount)[：:]\s*[¥￥$€£]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    datePattern: /(?:ご利用日|日付|Date)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/i,
  },
]

/**
 * Parse a credit card usage notification email.
 * Returns a high-confidence suggestion if patterns match.
 */
export function parseCreditCardEmail(email: RawEmail): SuggestionCandidate | null {
  const text = `${email.subject ?? ""}\n${email.textBody}`

  for (const pattern of CARD_PATTERNS) {
    if (!pattern.detect.test(text)) continue

    const nameMatch = text.match(pattern.namePattern)
    const amountMatch = text.match(pattern.amountPattern)
    const dateMatch = text.match(pattern.datePattern)

    if (!nameMatch || !amountMatch) continue

    let name = nameMatch[1].trim()
    name = name.replace(/<[^>]+>/g, "").trim()
    if (!name || name.length > 100) continue

    const rawAmount = amountMatch[1].replace(/,/g, "")
    const isDecimal = rawAmount.includes(".")
    const amount = isDecimal
      ? Math.round(parseFloat(rawAmount) * 100) // USD cents
      : parseInt(rawAmount, 10) // JPY

    if (isNaN(amount) || amount <= 0 || amount > 99999999) continue

    // Determine currency from amount format
    const currency = isDecimal ? "USD" : "JPY"

    let date: string | null = null
    if (dateMatch) {
      const d = dateMatch[1]
      if (d.includes("/")) {
        const parts = d.split("/")
        if (parts[0].length === 4) {
          date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`
        } else if (parts[2].length === 4) {
          date = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`
        }
      }
    }

    return {
      name,
      price: amount,
      currency,
      cycle: "monthly",
      source: "email",
      sourceDetail: `Credit card notification (${pattern.name})`,
      confidence: 0.8,
    }
  }

  return null
}
