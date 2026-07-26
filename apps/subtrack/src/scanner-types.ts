import type { AddLlmUsageFromLogArgs } from "./types.ts"

export type ScanResult = {
  source: string
  entries: AddLlmUsageFromLogArgs[]
}

export interface Scanner {
  readonly name: string
  scan(from?: string, to?: string): ScanResult
}

/**
 * Helper to create a Scanner instance with minimal boilerplate.
 */
export function defineScanner(
  name: string,
  scan: (from?: string, to?: string) => ScanResult,
): Scanner {
  return { name, scan }
}
