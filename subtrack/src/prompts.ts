import { input, select } from "@inquirer/prompts"
import { consola } from "consola"
import type { Currency, Cycle, Status } from "./types.ts"

export const CURRENCY_CHOICES: { name: string; value: Currency }[] = [
  { name: "AED (UAE Dirham)", value: "AED" },
  { name: "ARS (Argentine Peso)", value: "ARS" },
  { name: "AUD (Australian Dollar)", value: "AUD" },
  { name: "BRL (Brazilian Real)", value: "BRL" },
  { name: "CAD (Canadian Dollar)", value: "CAD" },
  { name: "CHF (Swiss Franc)", value: "CHF" },
  { name: "CLP (Chilean Peso)", value: "CLP" },
  { name: "CNY (Chinese Yuan)", value: "CNY" },
  { name: "COP (Colombian Peso)", value: "COP" },
  { name: "CZK (Czech Koruna)", value: "CZK" },
  { name: "DKK (Danish Krone)", value: "DKK" },
  { name: "EGP (Egyptian Pound)", value: "EGP" },
  { name: "EUR (Euro)", value: "EUR" },
  { name: "GBP (British Pound)", value: "GBP" },
  { name: "HKD (Hong Kong Dollar)", value: "HKD" },
  { name: "HUF (Hungarian Forint)", value: "HUF" },
  { name: "IDR (Indonesian Rupiah)", value: "IDR" },
  { name: "ILS (Israeli Shekel)", value: "ILS" },
  { name: "INR (Indian Rupee)", value: "INR" },
  { name: "JPY (日本円)", value: "JPY" },
  { name: "KRW (South Korean Won)", value: "KRW" },
  { name: "MXN (Mexican Peso)", value: "MXN" },
  { name: "MYR (Malaysian Ringgit)", value: "MYR" },
  { name: "NGN (Nigerian Naira)", value: "NGN" },
  { name: "NOK (Norwegian Krone)", value: "NOK" },
  { name: "NZD (New Zealand Dollar)", value: "NZD" },
  { name: "PHP (Philippine Peso)", value: "PHP" },
  { name: "PLN (Polish Zloty)", value: "PLN" },
  { name: "SAR (Saudi Riyal)", value: "SAR" },
  { name: "SEK (Swedish Krona)", value: "SEK" },
  { name: "SGD (Singapore Dollar)", value: "SGD" },
  { name: "THB (Thai Baht)", value: "THB" },
  { name: "TRY (Turkish Lira)", value: "TRY" },
  { name: "TWD (Taiwan Dollar)", value: "TWD" },
  { name: "USD (US Dollar)", value: "USD" },
  { name: "VND (Vietnamese Dong)", value: "VND" },
  { name: "ZAR (South African Rand)", value: "ZAR" },
]

export const STATUS_CHOICES: { name: string; value: Status }[] = [
  { name: "active", value: "active" },
  { name: "paused", value: "paused" },
  { name: "cancelled", value: "cancelled" },
]

export const CYCLE_CHOICES: { name: string; value: Cycle }[] = [
  { name: "weekly", value: "weekly" },
  { name: "bi-weekly", value: "bi-weekly" },
  { name: "monthly", value: "monthly" },
  { name: "quarterly", value: "quarterly" },
  { name: "semi-annual", value: "semi-annual" },
  { name: "yearly", value: "yearly" },
]

/**
 * Validate a currency code format (ISO 4217 3-letter).
 * --currency flag accepts any valid 3-letter code; interactive prompt restricts to CURRENCY_CHOICES.
 */
export function isValidCurrency(v: string): v is Currency {
  return /^[A-Z]{3}$/.test(v) && CURRENCY_CHOICES.some((c) => c.value === v)
}

export function isValidCycle(v: string): v is Cycle {
  return CYCLE_CHOICES.some((c) => c.value === v)
}

export function isValidStatus(v: string): v is Status {
  return v === "active" || v === "paused" || v === "cancelled"
}

export function validateBillingDay(v: string): string | true {
  if (!v.trim()) return true // empty = not set
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 31) return "Enter a number between 1 and 31"
  return true
}

export function validateName(v: string): string | true {
  if (!v.trim()) return "Name cannot be empty"
  if (v.length > 100) return "Name too long (max 100 chars)"
  return true
}

export function validatePrice(v: string): string | true {
  if (!v.trim()) return "Please enter a valid number"
  if (isNaN(Number(v)) || Number(v) < 0)
    return "Please enter a valid non-negative number"
  if (Number(v) > 99999999) return "Price too high (max 99,999,999)"
  return true
}

export function validateNotes(v: string): string | true {
  if (v.length > 500) return "Notes too long (max 500 chars)"
  return true
}

export function validatePaymentMethod(v: string): string | true {
  if (v.length > 50) return "Payment method too long (max 50 chars)"
  return true
}

export function validateDateString(v: string): string | true {
  if (!v.trim()) return true // empty = not set
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD format"
  const d = new Date(v + "T00:00:00")
  if (isNaN(d.getTime())) return "Invalid date"
  return true
}

export function validateVendorName(v: string): string | true {
  if (v.length > 100) return "Vendor name too long (max 100 chars)"
  return true
}

export function validateVendorUrl(v: string): string | true {
  if (!v.trim()) return true
  if (v.length > 500) return "URL too long (max 500 chars)"
  try {
    new URL(v)
    return true
  } catch {
    return "Invalid URL (must start with http:// or https://)"
  }
}

export function validatePlanTier(v: string): string | true {
  if (v.length > 100) return "Plan tier too long (max 100 chars)"
  return true
}

export function validateDiscountValue(v: string): string | true {
  if (!v.trim()) return true
  const n = Number(v)
  if (isNaN(n) || n < 0) return "Please enter a non-negative number"
  if (n > 99999999) return "Value too high"
  return true
}

export function validateDiscountType(v: string): string | true {
  if (!v.trim()) return true
  if (v !== "percentage" && v !== "fixed") return 'Must be "percentage" or "fixed"'
  return true
}

export function validateTrialName(v: string): string | true {
  if (!v.trim()) return "Name cannot be empty"
  if (v.length > 100) return "Name too long (max 100 chars)"
  return true
}

export function validateExpiresAt(v: string): string | true {
  if (!v.trim()) return "Expiration date cannot be empty"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD format"
  const d = new Date(v + "T00:00:00")
  if (isNaN(d.getTime())) return "Invalid date"
  return true
}

export function validateTags(v: string): string | true {
  if (!v.trim()) return true
  const tags = v.split(",").map((t) => t.trim()).filter(Boolean)
  if (tags.length > 10) return "Maximum 10 tags allowed"
  for (const tag of tags) {
    if (tag.length > 50) return `Tag too long: "${tag}" (max 50 chars)`
  }
  return true
}

export async function promptString(
  flag: string | undefined,
  message: string,
  validate: (v: string) => string | true,
): Promise<{ value: string; prompted: boolean } | null> {
  if (flag !== undefined) {
    const result = validate(flag)
    if (result !== true) {
      consola.error(result)
      return null
    }
    return { value: flag, prompted: false }
  }
  return { value: await input({ message, validate }), prompted: true }
}

export function validChoices<T>(choices: { value: T }[]): string {
  return choices.map((c) => c.value).join(", ")
}

export async function promptSelect<T extends string>(
  flag: string | undefined,
  message: string,
  choices: { name: string; value: T }[],
  isValid: (v: string) => v is T,
): Promise<{ value: T; prompted: boolean } | null> {
  if (flag !== undefined) {
    if (!isValid(flag)) {
      consola.error(`Invalid "${flag}". Valid: ${validChoices(choices)}`)
      return null
    }
    return { value: flag, prompted: false }
  }
  return { value: await select({ message, choices }), prompted: true }
}

// ── LLM API usage prompts ─────────────────────────────────

export const LLM_PROVIDER_CHOICES: { name: string; value: string }[] = [
  { name: "OpenAI", value: "openai" },
  { name: "Anthropic", value: "anthropic" },
  { name: "Google AI (Gemini)", value: "google-ai" },
  { name: "Mistral AI", value: "mistral" },
  { name: "Groq", value: "groq" },
  { name: "Together AI", value: "together" },
  { name: "DeepSeek", value: "deepseek" },
  { name: "Cohere", value: "cohere" },
  { name: "Other...", value: "__other__" },
]

export function validateTokens(v: string): string | true {
  if (!v.trim()) return "Please enter a number"
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) return "Please enter a non-negative integer"
  if (n > 9_999_999_999) return "Number too large (max 9,999,999,999)"
  return true
}

export function validateDate(v: string): string | true {
  if (!v.trim()) return true // empty means today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD format"
  const d = new Date(v)
  if (isNaN(d.getTime())) return "Invalid date"
  return true
}

export function validateModelName(v: string): string | true {
  if (!v.trim()) return "Model name cannot be empty"
  if (v.length > 200) return "Model name too long (max 200 chars)"
  return true
}
