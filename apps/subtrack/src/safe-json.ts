/**
 * Safe JSON parsing utilities to prevent prototype pollution
 * from untrusted external data sources.
 */

/**
 * Recursively strip keys that could cause prototype pollution
 * (`__proto__`, `constructor.prototype`, `prototype`).
 */
function stripProtoKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripProtoKeys)
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip dangerous keys
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue
      sanitized[key] = stripProtoKeys(value)
    }
    return sanitized
  }
  return obj
}

/**
 * Parse JSON with prototype pollution protection.
 * Works like `JSON.parse()` but strips `__proto__`, `constructor`, and `prototype` keys.
 */
export function safeJsonParse<T = unknown>(text: string): T {
  const parsed = JSON.parse(text)
  return stripProtoKeys(parsed) as T
}

/**
 * Safe response JSON extraction for fetch responses.
 * Works like `res.json()` but strips prototype pollution keys.
 */
export async function safeResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  return safeJsonParse<T>(text)
}
