import {
  addLlmUsageFromLog,
  batchAddLlmUsageFromLog,
  deleteSubscription,
  getLlmUsage,
  addLlmUsage,
  updateLlmUsage,
  deleteLlmUsage,
  getSubscription,
  getSubscriptions,
  updateSubscription,
  unarchiveSubscription,
  writeSubscription,
  archiveSubscription,
} from "../db.ts"
import type { SubscriptionRepository, UsageRepository } from "./ports.ts"

/** Default adapters used by the CLI. Tests can provide the ports directly. */
export const subscriptionRepository: SubscriptionRepository = {
  list: getSubscriptions,
  get: getSubscription,
  add: writeSubscription,
  update: updateSubscription,
  remove: deleteSubscription,
  archive: archiveSubscription,
  unarchive: unarchiveSubscription,
}

export const usageRepository: UsageRepository = {
  list: getLlmUsage,
  add: addLlmUsage,
  update: updateLlmUsage,
  addFromLog: addLlmUsageFromLog,
  addBatch: batchAddLlmUsageFromLog,
  remove: deleteLlmUsage,
}
