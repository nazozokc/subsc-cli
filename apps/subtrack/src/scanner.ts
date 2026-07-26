import { consola } from "consola"
import type { Scanner, ScanResult } from "./scanner-types.ts"
import type { AddLlmUsageFromLogArgs } from "./types.ts"
import { createOpenCodeScanner } from "./opencode-scanner.ts"
import { createClaudeScanner } from "./claude-scanner.ts"
import { createCodexScanner } from "./codex-scanner.ts"
import { createCursorScanner } from "./cursor-scanner.ts"
import { createCopilotScanner } from "./copilot-scanner.ts"
import { createWindsurfScanner } from "./windsurf-scanner.ts"

const scanners: Scanner[] = []

/**
 * Register a scanner so it runs during `runAllScanners()`.
 * Scanners are called in registration order.
 */
export function registerScanner(scanner: Scanner): void {
  if (scanners.some((s) => s.name === scanner.name)) return
  scanners.push(scanner)
}

/**
 * Get the list of currently registered scanners.
 */
export function getRegisteredScanners(): Scanner[] {
  return [...scanners]
}

/**
 * Clear all registered scanners.
 * Useful in tests to reset state before registering mock scanners.
 */
export function clearScanners(): void {
  scanners.length = 0
}

/**
 * Register all built-in scanners.
 * Called automatically at import time.
 */
function registerBuiltInScanners(): void {
  registerScanner(createOpenCodeScanner)
  registerScanner(createClaudeScanner)
  registerScanner(createCodexScanner)
  registerScanner(createCursorScanner)
  registerScanner(createCopilotScanner)
  registerScanner(createWindsurfScanner)
}

registerBuiltInScanners()

/**
 * Run all registered scanners, optionally filtered by date range.
 * Returns a combined ScanResult with dedup by generation_id (first wins).
 */
export function runAllScanners(from?: string, to?: string): ScanResult {
  const seen = new Set<string>()
  const allEntries: AddLlmUsageFromLogArgs[] = []

  for (const scanner of scanners) {
    let result: ScanResult
    try {
      result = scanner.scan(from, to)
    } catch (err) {
      consola.warn(`Scanner "${scanner.name}" failed: ${String(err)}`)
      continue
    }
    for (const entry of result.entries) {
      if (entry.generation_id && seen.has(entry.generation_id)) continue
      if (entry.generation_id) seen.add(entry.generation_id)
      allEntries.push(entry)
    }
  }

  return { source: "combined", entries: allEntries }
}
