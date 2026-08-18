/**
 * Pre-command hooks shared by interactive commands.
 */

/**
 * Run non-blocking pre-command hooks for interactive output:
 * 1. Auto-scan for new suggestions (silent on failure)
 * 2. Show the pending notification banner
 * Skipped entirely for JSON output.
 */
export async function runPreCommandHooks(options: { json?: boolean } = {}): Promise<void> {
  if (options.json) return
  const { autoScan } = await import("./suggest/scan.ts")
  await autoScan()
  const { showNotificationBanner } = await import("./notifications/banner.ts")
  showNotificationBanner()
}