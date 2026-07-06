import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"
import { safeJsonParse } from "./safe-json.ts"

export type ModelPricingEntry = {
  input_cost_per_token?: number
  output_cost_per_token?: number
  output_cost_per_reasoning_token?: number
  litellm_provider?: string
  mode?: string
  [key: string]: unknown
}

export type PricingCache = Record<string, ModelPricingEntry>

let _cache: PricingCache | null = null
let _cachePromise: Promise<PricingCache | null> | null = null

const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const MAX_PRICING_JSON_BYTES = 10 * 1024 * 1024 // 10 MB
const MIN_PRICING_KEYS = 10 // sanity check: at least 10 model entries
const GITHUB_JSON_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

function getConfigDir(): string {
  return process.env.SUBSC_CLI_DB_DIR ?? path.join(homedir(), ".config", "subtrack")
}

function getCachePath(): string {
  return path.join(getConfigDir(), "litellm_cache.json")
}

/**
 * Load pricing cache: try fresh on-disk cache first, fall back to GitHub fetch.
 * Returns `null` only when both cache and fetch fail.
 */
export async function ensurePricingCache(): Promise<PricingCache | null> {
  if (_cache) return _cache
  if (_cachePromise) return _cachePromise

  _cachePromise = (async () => {
    const cachePath = getCachePath()
    let staleCache: PricingCache | null = null

    if (existsSync(cachePath)) {
      try {
        const data = readFileSync(cachePath, "utf-8")
        staleCache = safeJsonParse<PricingCache>(data)
        const st = statSync(cachePath)
        const age = Date.now() - st.mtimeMs
        if (age < CACHE_FRESHNESS_MS) {
          _cache = staleCache
          return staleCache
        }
      } catch {
        // corrupt cache — will refetch
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let data: PricingCache
      try {
        const res = await fetch(GITHUB_JSON_URL, { signal: controller.signal })
        if (!res.ok) throw new Error(`GitHub responded with ${res.status}`)

        // Read with size limit to prevent memory exhaustion
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")
        const chunks: Uint8Array[] = []
        let totalBytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.length
          if (totalBytes > MAX_PRICING_JSON_BYTES) {
            reader.cancel().catch(() => {})
            throw new Error(`Pricing data too large (exceeded ${MAX_PRICING_JSON_BYTES / 1024 / 1024} MB)`)
          }
          chunks.push(value)
        }
        const allBytes = new Uint8Array(totalBytes)
        let offset = 0
        for (const chunk of chunks) {
          allBytes.set(chunk, offset)
          offset += chunk.length
        }
        const text = new TextDecoder().decode(allBytes)
        data = safeJsonParse<PricingCache>(text)

        // Validate structure: must be an object with at least MIN_PRICING_KEYS entries
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          throw new Error("Pricing data is not a valid JSON object")
        }
        const keys = Object.keys(data)
        if (keys.length < MIN_PRICING_KEYS) {
          throw new Error(`Pricing data has only ${keys.length} entries (expected >= ${MIN_PRICING_KEYS})`)
        }
      } finally {
        clearTimeout(timer)
      }
      mkdirSync(getConfigDir(), { recursive: true })
      writeFileSync(cachePath, JSON.stringify(data), { mode: 0o600 })
      _cache = data
      return data
    } catch (fetchErr) {
      if (staleCache) {
        _cache = staleCache
        return staleCache
      }
      return null
    }
  })()

  return _cachePromise
}

/**
 * Format a pricing entry into a short human-readable cost description.
 */
function formatPricingInfo(entry: ModelPricingEntry): string {
  const inCost = entry.input_cost_per_token
  const outCost = entry.output_cost_per_token
  if (inCost == null && outCost == null) return ""
  const parts: string[] = []
  if (inCost != null) parts.push(`$${(inCost * 1_000_000).toFixed(2)}/1M in`)
  if (outCost != null) parts.push(`$${(outCost * 1_000_000).toFixed(2)}/1M out`)
  return parts.join(" · ")
}

/**
 * Search model pricing cache by query string.
 * Optionally filtered by provider (`litellm_provider` field).
 * Returns choices suitable for `@inquirer/search` prompt.
 */
export function searchPricingModels(
  cache: PricingCache,
  query: string,
  provider?: string,
): { name: string; value: string; description: string }[] {
  const lower = query.toLowerCase()
  const entries = Object.entries(cache)

  const filtered = entries.filter(([key, val]) => {
    if (provider && val.litellm_provider !== provider) return false
    return key.toLowerCase().includes(lower)
  })

  return filtered.map(([key, val]) => ({
    name: key,
    value: key,
    description: formatPricingInfo(val),
  }))
}

/**
 * Look up a model key in the pricing cache with simple fallbacks.
 * Tries exact match, then provider-prefixed match, then case-insensitive match.
 * This is for non-interactive (--model flag) lookups.
 */
export function lookupModelKey(
  cache: PricingCache,
  model: string,
  provider?: string,
): string | null {
  // Exact match
  if (cache[model]) return model

  const lower = model.toLowerCase()

  // Provider-prefixed exact match
  if (provider) {
    const prefixed = `${provider}/${model}`
    if (cache[prefixed]) return prefixed
    const lowerPrefixed = `${provider}/${lower}`
    if (cache[lowerPrefixed]) return lowerPrefixed
  }

  // Case-insensitive key match
  for (const key of Object.keys(cache)) {
    if (key.toLowerCase() === lower) return key
    if (provider && key.toLowerCase() === `${provider}/${lower}`) return key
  }

  return null
}

/**
 * Get pricing entry for a specific model key.
 */
export function getModelPricing(
  cache: PricingCache,
  modelKey: string,
): ModelPricingEntry | null {
  return cache[modelKey] ?? null
}

/**
 * Calculate cost in USD cents from token counts and pricing entry.
 * Returns a float (fractional cents are preserved).
 */
export function calculateCostCents(
  pricing: ModelPricingEntry,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (pricing.input_cost_per_token ?? 0) * inputTokens
  const outputCost = (pricing.output_cost_per_token ?? 0) * outputTokens
  const reasoningCost =
    (pricing.output_cost_per_reasoning_token ?? 0) * outputTokens
  return (inputCost + outputCost + reasoningCost) * 100
}
