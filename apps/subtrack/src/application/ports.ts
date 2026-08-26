import type { AddLlmUsageArgs, AddLlmUsageFromLogArgs, AddSharedArgs, GetLlmUsageOptions, LlmUsageEntry, SharedArgs } from "../types.ts"

/** Application-facing persistence contracts. Implementations stay in infrastructure. */
export interface SubscriptionRepository {
  list(options?: import("../db/subscriptions.ts").SubscriptionQueryOptions): SharedArgs[]
  get(id: number): SharedArgs | undefined
  add(data: AddSharedArgs): number
  update(id: number, fields: Partial<AddSharedArgs>): boolean
  remove(id: number): boolean
  archive(id: number): boolean
  unarchive(id: number): boolean
}

export interface UsageRepository {
  list(options?: GetLlmUsageOptions): LlmUsageEntry[]
  add(data: AddLlmUsageArgs): void
  update(id: number, fields: Partial<AddLlmUsageArgs>): boolean
  addFromLog(data: AddLlmUsageFromLogArgs): boolean
  addBatch(entries: AddLlmUsageFromLogArgs[]): { added: number; skipped: number }
  remove(id: number): boolean
}
