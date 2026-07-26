/**
 * Japanese bank withdrawal email parser.
 *
 * Targets common patterns from:
 * - SMBC (三井住友銀行)
 * - Mizuho (みずほ銀行)
 * - Rakuten Bank (楽天銀行)
 * - Yucho (ゆうちょ銀行)
 * - PayPay Bank
 * - Other Japanese banks
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"

// ── Bank-specific patterns ──────────────────────────────

type BankPattern = {
  name: string
  detect: RegExp
  namePattern: RegExp
  amountPattern: RegExp
  datePattern: RegExp
}

const BANK_PATTERNS: BankPattern[] = [
  // SMBC (三井住友銀行)
  {
    name: "SMBC",
    detect: /三井住友|SMBC/i,
    namePattern: /ご利用先[：:]\s*(.+)/,
    amountPattern: /ご利用金額[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /お引き落とし日[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // Mizuho (みずほ銀行)
  {
    name: "Mizuho",
    detect: /みずほ|Mizuho/i,
    namePattern: /お引落し(?:先|内訳)[：:]\s*(.+)/,
    amountPattern: /(?:お支払|引落)[金額]?[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:引落日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // Rakuten Bank (楽天銀行)
  {
    name: "Rakuten Bank",
    detect: /楽天(?:銀行)?/i,
    namePattern: /(?:ご利用先|明細)[：:]\s*(.+)/,
    amountPattern: /(?:金額|引落金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:引落日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // Yucho / Japan Post Bank (ゆうちょ銀行)
  {
    name: "Yucho",
    detect: /ゆうちょ|Yucho|Japan Post/i,
    namePattern: /(?:払込先|ご利用先|内容)[：:]\s*(.+)/,
    amountPattern: /(?:金額|払込金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:処理日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // PayPay Bank
  {
    name: "PayPay Bank",
    detect: /PayPay銀行/i,
    namePattern: /(?:ご利用先|明細)[：:]\s*(.+)/,
    amountPattern: /(?:金額|引落金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(?:引落日|お取引日)[：:]\s*(\d{4}\/\d{1,2}\/\d{1,2})/,
  },
  // Generic Japanese bank withdrawal
  {
    name: "Generic Bank",
    detect: /お引(?:き)?落とし|引落|口座引落|自動払込/i,
    namePattern: /(?:ご利用先|サービス名|明細|内容)[：:]\s*(.+)/,
    amountPattern: /(?:金額|ご利用金額|お支払金額|引落金額)[：:]\s*[¥￥]?\s*([0-9,]+)/,
    datePattern: /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  },
]

/**
 * Parse a Japanese bank withdrawal email.
 * Returns a high-confidence suggestion if patterns match.
 */
export function parseBankEmail(email: RawEmail): SuggestionCandidate | null {
  const text = `${email.subject ?? ""}\n${email.textBody}`

  for (const pattern of BANK_PATTERNS) {
    if (!pattern.detect.test(text)) continue

    const nameMatch = text.match(pattern.namePattern)
    const amountMatch = text.match(pattern.amountPattern)
    // Date is nice-to-have, not required
    const dateMatch = text.match(pattern.datePattern)

    if (!nameMatch || !amountMatch) continue

    let name = nameMatch[1].trim()
    // Repeatedly strip HTML-like tags to prevent bypass via nested tags
    let prev: string
    do {
      prev = name
      name = name.replace(/<[^>]+>/g, "")
    } while (name !== prev)
    name = name.trim()
    if (!name || name.length > 100) continue

    const rawAmount = amountMatch[1].replace(/,/g, "")
    const amount = parseInt(rawAmount, 10)
    if (isNaN(amount) || amount <= 0 || amount > 99999999) continue

    let date: string | null = null
    if (dateMatch) {
      if (pattern.name === "Generic Bank") {
        // Generic Bank uses separate Y/M/D groups
        const y = dateMatch[1]
        const mo = dateMatch[2]
        const d = dateMatch[3]
        if (y && mo && d) {
          date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
        }
      } else if (dateMatch[1]) {
        // Other banks use unified YYYY/MM/DD in dateMatch[1]
        const parts = dateMatch[1].split("/")
        if (parts.length === 3 && parts[0].length === 4) {
          date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`
        }
      }
    }

    return {
      name,
      price: amount,
      currency: "JPY",
      cycle: "monthly",
      source: "email",
      sourceDetail: `Bank withdrawal email (${pattern.name})`,
      confidence: 0.85,
    }
  }

  return null
}
