/**
 * Security limits, rate limiter, and input validation for the MCP server.
 */

// ── Security limits ──────────────────────────────────────

export const MAX_REQUEST_SIZE = 1024 * 100 // 100 KB max request payload
export const RATE_LIMIT_TOKENS = 60        // max requests per window
export const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute window
export const MAX_STRING_LENGTH = 500       // max length for string inputs
export const MAX_TAG_COUNT = 20            // max tags per subscription

/** Simple token-bucket rate limiter. */
export class RateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(private maxTokens: number, private windowMs: number) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  tryConsume(): boolean {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    if (elapsed >= this.windowMs) {
      this.tokens = this.maxTokens
      this.lastRefill = now
    }
    if (this.tokens <= 0) return false
    this.tokens--
    return true
  }
}

export const rateLimiter = new RateLimiter(RATE_LIMIT_TOKENS, RATE_LIMIT_WINDOW_MS)

/** Validate argument types and lengths to prevent abuse. */
export function validateArgs(
  args: Record<string, unknown> | undefined,
  schema: Record<string, { type: string; maxLength?: number }>,
): string | null {
  if (!args) return null
  for (const [key, rules] of Object.entries(schema)) {
    const value = args[key]
    if (value === undefined) continue
    if (rules.type === "string") {
      if (typeof value !== "string") return `${key} must be a string`
      const maxLen = rules.maxLength ?? MAX_STRING_LENGTH
      if (value.length > maxLen) return `${key} too long (max ${maxLen} chars)`
    } else if (rules.type === "number") {
      if (typeof value !== "number" || isNaN(value)) return `${key} must be a number`
      if (value < 0) return `${key} must be non-negative`
      if (value > 1_000_000_000) return `${key} value too large`
    }
  }
  return null
}

/** Input validation schemas per tool. */
export const INPUT_VALIDATIONS: Record<string, Record<string, { type: string; maxLength?: number }>> = {
  add_subscription: {
    name: { type: "string", maxLength: 100 },
    price: { type: "number" },
    currency: { type: "string", maxLength: 3 },
    cycle: { type: "string", maxLength: 20 },
    tags: { type: "string", maxLength: 500 },
    billingDay: { type: "number" },
    status: { type: "string", maxLength: 10 },
    paymentMethod: { type: "string", maxLength: 50 },
    notes: { type: "string", maxLength: 500 },
  },
  edit_subscription: {
    id: { type: "number" },
    name: { type: "string", maxLength: 100 },
    price: { type: "number" },
    currency: { type: "string", maxLength: 3 },
    cycle: { type: "string", maxLength: 20 },
    status: { type: "string", maxLength: 10 },
    tags: { type: "string", maxLength: 500 },
    paymentMethod: { type: "string", maxLength: 50 },
    notes: { type: "string", maxLength: 500 },
  },
  delete_subscription: {
    id: { type: "number" },
  },
  search_subscriptions: {
    query: { type: "string", maxLength: 200 },
  },
}
