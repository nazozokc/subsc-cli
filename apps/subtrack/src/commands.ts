// ── Barrel: re-exports all command handlers from domain modules ──
// This file exists for backward compatibility — new code should import directly
// from the domain module.

export { handleList, handleDelete, handleTags, handleClone, handleArchive, handleUnarchive } from "./subscription/core.ts"
export { handleAdd } from "./subscription/add.ts"
export { handleEdit } from "./subscription/edit.ts"
export { handleSearch } from "./search.ts"
export { handleTrialAdd, handleTrialList, handleTrialExpiring, handleTrialDelete } from "./trial.ts"
export { handleBulkStatus, handleBulkDelete, handleBulkTagAdd, handleBulkTagRemove } from "./bulk.ts"
export { handleForecast } from "./forecast.ts"
export { handleHistory } from "./history.ts"
export { handleNotify } from "./notify.ts"
export { handleTimeline } from "./timeline.ts"
export { handleOptimize } from "./optimize.ts"
export { handleProfile } from "./profile.ts"
export { handleBackup, handleRestore } from "./backup.ts"
export { handleTagList, handleTagRename, handleTagDelete, handleTagPrune, handleTagMerge } from "./tag.ts"
export { handleExport } from "./export.ts"
export { handlePayment, handleSummary } from "./payment.ts"
export { handleUpcoming } from "./upcoming.ts"
export { handleAnalytics } from "./analytics.ts"
export { handleCompare } from "./compare.ts"
export { handleCalendar } from "./calendar.ts"
export { handleAuditList, handleAuditPrune } from "./audit.ts"
export { handleMaintenance } from "./maintenance.ts"
export { handleCleanup } from "./cleanup.ts"
export { handleStats } from "./stats.ts"
export { handleCurrencyList } from "./currency.ts"
export { handleConfigList, handleConfigGet, handleConfigSet, handleConfigReset } from "./config.ts"
export { handlePause, handleResume, handleRenew, handleReview, handleYearly, handleCheck, handleChanges, handleReceipt, handleTemplate } from "./features.ts"

// Lazy-import wrappers to avoid loading MCP SDK WASM at module load time
export async function handleMcp(): Promise<void> {
  const { startMcpServer } = await import("./mcp.ts")
  await startMcpServer()
}
