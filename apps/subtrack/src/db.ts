// Re-export all db modules from a single entry point for backward compatibility.
export {
  getDbDir, getDefaultBackupDir, saveDb, getDbPath, getDb, __setDb,
  getBackupFiles, restoreDb, getBackupHashPath, writeBackupHash, verifyBackupHash,
} from "./db/connection.ts"
export { runMigrations } from "./db/schema.ts"
export {
  getSubscriptions, getSubscription, writeSubscription, updateSubscription, deleteSubscription, archiveSubscription, unarchiveSubscription, mapTags, findSubscriptionByName,
} from "./db/subscriptions.ts"
export {
  getAllTags, tagsSubscription, getTagsWithCount, renameTag, deleteTag, pruneTags, mergeTag,
} from "./db/tags.ts"
export {
  addLlmUsage, addLlmUsageFromLog, batchAddLlmUsageFromLog,
  getLlmUsage, deleteLlmUsage, getLlmUsageTotal, getLlmUsageTotalByProvider,
} from "./db/usage.ts"
export {
  writeTrial, getTrials, getTrial, deleteTrial, getTrialsExpiringSoon,
} from "./db/trials.ts"
export {
  writePriceHistory, getPriceHistory, getAllPriceChanges,
} from "./db/price-history.ts"
export type { PriceHistoryEntry } from "./db/price-history.ts"
export {
  addAuditLog, getAuditLogs, getAuditLogCount, pruneAuditLogs,
} from "./db/audit.ts"
export type { AuditEntry, AuditAction, AddAuditArgs } from "./db/audit.ts"
