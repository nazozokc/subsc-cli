import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { consola } from "consola"
import type { AddLlmUsageFromLogArgs } from "./types.ts"
import { defineScanner, type ScanResult } from "./scanner-types.ts"
import { safeJsonParse } from "./safe-json.ts"
import { isInDateRange } from "./date-utils.ts"

/**
 * Find all Claude Code session JSONL files.
 * Located at ~/.claude/projects/<project>/<session-id>.jsonl
 */
function findSessionFiles(): string[] {
  const base = join(homedir(), ".claude", "projects")
  if (!existsSync(base)) return []

  const files: string[] = []
  try {
    const projects = readdirSync(base)
    for (const project of projects) {
      const projectDir = join(base, project)
      if (!statSync(projectDir).isDirectory()) continue
      const entries = readdirSync(projectDir)
      for (const entry of entries) {
        if (entry.endsWith(".jsonl")) {
          files.push(join(projectDir, entry))
        }
      }
    }
  } catch {
    return []
  }
  return files
}

/**
 * Parse a single line from a Claude Code session JSONL file.
 * Returns the extracted usage data or null if not an assistant message with usage.
 */
function parseSessionLine(
  line: string,
  sessionId: string,
): AddLlmUsageFromLogArgs | null {
  let data: Record<string, unknown>
  try {
    data = safeJsonParse<Record<string, unknown>>(line)
  } catch {
    return null
  }

  // Only assistant messages with usage data
  if (data.type !== "assistant") return null

  const msg = data.message as Record<string, unknown> | undefined
  if (!msg) return null
  const usage = msg.usage as Record<string, unknown> | undefined
  if (!usage || typeof usage.input_tokens !== "number") return null

  const inputTokens = usage.input_tokens as number
  const outputTokens = (usage.output_tokens as number) ?? 0
  const model = (data.model as string) ?? (msg.model as string) ?? "unknown"
  const uuid = (data.uuid as string) ?? ""
  const timestamp = data.timestamp as string | undefined

  // Skip entries with no meaningful usage
  if (inputTokens === 0 && outputTokens === 0) return null

  // Use uuid as generation_id (or deterministic fallback based on content)
  const generationId = uuid || computeFallbackGenId(sessionId, inputTokens, outputTokens, model)

  // Extract date from ISO timestamp
  const date = timestamp && !Number.isNaN(new Date(timestamp).getTime())
    ? new Date(timestamp).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0]

  // Claude Code doesn't store cost — leave as 0, pricing module can estimate later
  return {
    provider: "anthropic",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost: 0,
    date,
    description: null,
    generation_id: generationId,
  }
}

/**
 * Get the timestamp in ms from a Claude Code session line for date filtering.
 */
function getLineTimestampMs(line: string): number | null {
  try {
    const data = safeJsonParse<Record<string, unknown>>(line)
    const ts = data.timestamp as string | undefined
    if (ts) {
      const ms = new Date(ts).getTime()
      return Number.isNaN(ms) ? null : ms
    }
    return null
  } catch {
    return null
  }
}

/**
 * Generate a deterministic fallback generation_id from available fields.
 */
function computeFallbackGenId(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  model: string,
): string {
  // Use a simple hash-like approach: combine session + model + token counts
  // This ensures the same content always produces the same id within a session
  return `claude-${sessionId}-${model}-${inputTokens}-${outputTokens}`
}

/**
 * Scan Claude Code session files and extract LLM usage entries.
 */
export function scanClaudeCode(from?: string, to?: string): ScanResult {
  const files = findSessionFiles()

  if (files.length === 0) {
    consola.info("Claude Code session files not found — skip")
    return { source: "claude", entries: [] }
  }

  consola.info(`Found ${files.length} Claude Code session file${files.length === 1 ? "" : "s"}`)

  const entries: AddLlmUsageFromLogArgs[] = []

  for (const filePath of files) {
    // Extract session ID from filename (basename without .jsonl)
    const basename = filePath.split("/").pop() ?? ""
    const sessionId = basename.replace(/\.jsonl$/, "")

    let content: string
    try {
      content = readFileSync(filePath, "utf-8")
    } catch {
      continue
    }

    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Date filter: check timestamp before full parse
      if (from || to) {
        const ts = getLineTimestampMs(trimmed)
        if (ts !== null && !isInDateRange(ts, from, to)) continue
      }

      const parsed = parseSessionLine(trimmed, sessionId)
      if (parsed) entries.push(parsed)
    }
  }

  consola.info(`Found ${entries.length} usage entr${entries.length === 1 ? "y" : "ies"} in Claude Code sessions`)
  return { source: "claude", entries }
}

/**
 * Scanner instance for Claude Code.
 */
export const createClaudeScanner = defineScanner("claude", scanClaudeCode)
