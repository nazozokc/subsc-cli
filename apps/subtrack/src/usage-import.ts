import { openSync, fstatSync, readSync, closeSync } from "node:fs"
import os from "node:os"
import { consola } from "consola"
import type { UsageImportFlags } from "./types.ts"
import { addLlmUsageFromLog } from "./db.ts"
import { safeJsonParse } from "./safe-json.ts"
import { resolveSafePath } from "./path-utils.ts"

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const MAX_STDIN_SIZE = 10 * 1024 * 1024 // 10 MB (stdin is unbounded)
const STDIN_TIMEOUT_MS = 30_000 // 30 seconds
import {
  ensurePricingCache,
  lookupModelKey,
  getModelPricing,
  calculateCostCents,
} from "./pricing.ts"

// ── Helpers ──────────────────────────────────────────────

export function todayLocal(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function unixTsToDate(ts: number | undefined): string {
  if (!ts) return todayLocal()
  return new Date(ts * 1000).toISOString().split("T")[0]
}

type ParsedLogEntry = {
  generationId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  costCents: number | null // null = needs pricing lookup
  date: string
}

/**
 * Try to parse a single API response JSON object and extract usage info.
 * Returns null if the object doesn't contain recognizable usage data.
 */
function parseResponseJson(obj: Record<string, unknown>): ParsedLogEntry | null {
  const usage = obj.usage
  if (!usage || typeof usage !== "object") return null

  const id = obj.id
  const model = obj.model
  if (typeof id !== "string" || !id) return null
  if (typeof model !== "string" || !model) return null

  const u = usage as Record<string, unknown>

  // Detect OpenRouter: has usage.cost
  const isOpenRouter = typeof u.cost === "number"
  // Detect OpenAI-style: has usage.prompt_tokens
  const isOpenAi = !isOpenRouter && typeof u.prompt_tokens === "number"
  // Detect Anthropic-style: has usage.input_tokens (but not prompt_tokens)
  const isAnthropic = !isOpenRouter && !isOpenAi && typeof u.input_tokens === "number"

  if (isOpenRouter) {
    // Model format: "openai/gpt-4o" or "anthropis/claude-sonnet-4" or "openai/gpt-4o-2024-08-06"
    const slashIdx = model.indexOf("/")
    const provider = slashIdx >= 0 ? model.slice(0, slashIdx) : "unknown"
    const modelName = slashIdx >= 0 ? model.slice(slashIdx + 1) : model
    const inputTokens = Number(u.prompt_tokens ?? 0)
    const outputTokens = Number(u.completion_tokens ?? 0)

    // OpenRouter cost is already in cents (1 credit = $0.01 = 1¢)
    const costCents = Number(u.cost)

    if (inputTokens === 0 && outputTokens === 0 && costCents === 0) return null

    return {
      generationId: id,
      provider,
      model: modelName,
      inputTokens,
      outputTokens,
      costCents,
      date: todayLocal(),
    }
  }

  if (isOpenAi) {
    const inputTokens = Number(u.prompt_tokens ?? 0)
    const outputTokens = Number(u.completion_tokens ?? 0)
    if (inputTokens === 0 && outputTokens === 0) return null

    return {
      generationId: id,
      provider: "openai",
      model,
      inputTokens,
      outputTokens,
      costCents: null,
      date: unixTsToDate(obj.created as number | undefined),
    }
  }

  if (isAnthropic) {
    const inputTokens = Number(u.input_tokens ?? 0)
    const outputTokens = Number(u.output_tokens ?? 0)
    if (inputTokens === 0 && outputTokens === 0) return null

    return {
      generationId: id,
      provider: "anthropic",
      model,
      inputTokens,
      outputTokens,
      costCents: null,
      date: todayLocal(),
    }
  }

  return null
}

type ImportResult = {
  added: number
  skipped: number
  noCost: number
  errors: number
}

// ── Handler ──────────────────────────────────────────────

export async function handleUsageImport(flags: UsageImportFlags) {
  const filePath = flags.file
  if (!filePath) {
    consola.error("Usage: subtrack usage import <file> [--dry-run]")
    return
  }

  // Read file (or stdin)
  let content: string
  if (filePath === "-") {
    // Read from stdin with size and timeout protection
    const chunks: Buffer[] = []
    let totalBytes = 0
    let stdinDestroyed = false
    const stdinTimer = setTimeout(() => {
      consola.error("Stdin read timed out — exceeded 30 seconds")
      process.stdin.destroy()
      stdinDestroyed = true
    }, STDIN_TIMEOUT_MS)
    try {
      for await (const chunk of process.stdin) {
        const buf = Buffer.from(chunk)
        totalBytes += buf.length
        if (totalBytes > MAX_STDIN_SIZE) {
          process.stdin.destroy()
          consola.error(
            `Stdin input too large (max ${MAX_STDIN_SIZE / 1024 / 1024} MB)`,
          )
          return
        }
        chunks.push(buf)
      }
    } catch {
      // Stream was destroyed (timeout or read error) — partial data in chunks
    } finally {
      clearTimeout(stdinTimer)
    }
    if (stdinDestroyed) return
    content = Buffer.concat(chunks).toString("utf-8")
  } else {
    const safeFile = resolveSafePath([os.homedir(), os.tmpdir()], filePath)
    if (!safeFile) {
      consola.error(
        `File not found or path not allowed — must be within home or temp directory`,
      )
      return
    }
    // Open file once and use the same fd for size check and read (TOCTOU-safe)
    let fd: number | null = null
    try {
      fd = openSync(safeFile, "r")
      const st = fstatSync(fd)
      if (st.size > MAX_FILE_SIZE) {
        consola.error(
          `File too large (${(st.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
        )
        return
      }
      const buffer = Buffer.alloc(st.size)
      readSync(fd, buffer, 0, st.size, 0)
      content = buffer.toString("utf-8")
    } catch (err) {
      consola.error(`Cannot read file: ${safeFile} — ${String(err)}`)
      return
    } finally {
      if (fd !== null) closeSync(fd)
    }
  }

  if (!content.trim()) {
    consola.warn("File is empty")
    return
  }

  // Parse file content into individual JSON objects
  let objects: Record<string, unknown>[]
  const trimmed = content.trim()

  if (trimmed.startsWith("[")) {
    // JSON array
    try {
      const parsed = safeJsonParse(trimmed)
      if (!Array.isArray(parsed)) {
        consola.error("File contains a JSON object, expected an array or JSONL")
        return
      }
      objects = parsed as Record<string, unknown>[]
    } catch {
      consola.error("Failed to parse JSON array")
      return
    }
  } else {
    // JSONL: one JSON per line
    objects = []
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        objects.push(safeJsonParse(line) as Record<string, unknown>)
      } catch {
        consola.warn(`Line ${i + 1}: Failed to parse JSON, skipping`)
      }
    }
  }

  if (objects.length === 0) {
    consola.warn("No JSON objects found in file")
    return
  }

  consola.info(`Found ${objects.length} JSON object${objects.length !== 1 ? "s" : ""} in file`)

  // Load pricing cache for cost calculation
  const cache = flags.dryRun ? null : await ensurePricingCache()

  const result: ImportResult = { added: 0, skipped: 0, noCost: 0, errors: 0 }

  for (let i = 0; i < objects.length; i++) {
    const entry = parseResponseJson(objects[i])
    if (!entry) {
      result.errors++
      continue
    }

    // Resolve cost
    let costCents = entry.costCents
    if (costCents === null) {
      // Try pricing cache
      if (cache) {
        const modelKey = lookupModelKey(cache, entry.model)
        if (modelKey) {
          const pricing = getModelPricing(cache, modelKey)
          if (pricing) {
            costCents = calculateCostCents(pricing, entry.inputTokens, entry.outputTokens)
          }
        }
      }
      if (costCents === null || costCents === undefined) {
        // Can't determine cost: skip
        consola.warn(
          `Entry ${i + 1} (${entry.generationId}): Cannot determine cost for "${entry.provider}/${entry.model}", skipping`,
        )
        result.noCost++
        continue
      }
    }

    if (flags.dryRun) {
      result.added++
      continue
    }

    // Write to DB (dedup by generation_id)
    const added = addLlmUsageFromLog({
      provider: entry.provider,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      cost: costCents,
      date: entry.date,
      description: null,
      generation_id: entry.generationId,
    })

    if (added) {
      result.added++
    } else {
      result.skipped++
    }
  }

  // Report
  if (flags.dryRun) {
    consola.info(
      `Dry run: ${result.added} entries would be added` +
      (result.skipped > 0 ? `, ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""}` : "") +
      (result.noCost > 0 ? `, ${result.noCost} skipped (no cost data)` : "") +
      (result.errors > 0 ? `, ${result.errors} unparsable ${result.errors !== 1 ? "entries" : "entry"}` : ""),
    )
  } else {
    consola.success(
      `Imported: ${result.added} entries added` +
      (result.skipped > 0 ? `, ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""} skipped` : "") +
      (result.noCost > 0 ? `, ${result.noCost} skipped (no cost data)` : "") +
      (result.errors > 0 ? `, ${result.errors} unparsable ${result.errors !== 1 ? "entries" : "entry"}` : ""),
    )
  }
}
