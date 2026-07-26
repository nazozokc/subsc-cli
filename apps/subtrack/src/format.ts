/**
 * Shared formatting utilities extracted to eliminate duplication.
 * Used by backup, stats, maintenance, cleanup, and other modules.
 */

import { statSync } from "node:fs"

/**
 * Format bytes to a human-readable string (B, kB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Get file size in bytes, or 0 if not accessible.
 */
export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}
