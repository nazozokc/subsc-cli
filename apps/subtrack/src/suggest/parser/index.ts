/**
 * Parser registry — routes a RawEmail to the best matching parser.
 *
 * Parsers are tried in order. The first non-null result wins.
 * genericParser is the fallback and always returns a result.
 */

import type { RawEmail, SuggestionCandidate } from "../types.ts"
import { parseBankEmail } from "./bank.ts"
import { parseCreditCardEmail } from "./credit-card.ts"
import { parseReceiptEmail } from "./receipt.ts"
import { parseWalletEmail } from "./wallet.ts"
import { parseGenericEmail } from "./generic.ts"

type EmailParser = (email: RawEmail) => SuggestionCandidate | null

const parsers: EmailParser[] = [
  parseBankEmail,
  parseCreditCardEmail,
  parseReceiptEmail,
  parseWalletEmail,
  parseGenericEmail,
]

/**
 * Try each parser in order and return the first matching result.
 * Returns null only if all parsers return null (which genericParser never does).
 */
export function parseEmail(email: RawEmail): SuggestionCandidate | null {
  for (const parser of parsers) {
    const result = parser(email)
    if (result) return result
  }
  return null
}

export { parseBankEmail } from "./bank.ts"
export { parseCreditCardEmail } from "./credit-card.ts"
export { parseReceiptEmail } from "./receipt.ts"
export { parseWalletEmail } from "./wallet.ts"
export { parseGenericEmail } from "./generic.ts"
