/**
 * Native addon wrapper — replaces all src/db/ sub-modules.
 *
 * Exposes the same API surface as the old sql.js-based db layer
 * so that all 25+ consumer files (commands.ts, display.ts, etc.)
 * work unchanged. All operations delegate to the Rust native addon.
 */

import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import type {
  SharedArgs,
  AddSharedArgs,
  Currency,
  Cycle,
  Status,
  LlmUsageEntry,
  GetLlmUsageOptions,
  AddLlmUsageArgs,
  AddLlmUsageFromLogArgs,
  TrialEntry,
  AddTrialArgs,
  BackupFileInfo,
  PriceHistoryEntry,
  AuditEntry,
  AuditAction,
  AddAuditArgs,
} from "./types.ts"

// ── Native addon loader ──────────────────────────────────

const require = createRequire(import.meta.url)
const { Database: NativeDatabase } = require("../index.cjs")

// Use `any` for the instance type to avoid TS strict issues with CJS imports
type NativeDb = InstanceType<typeof NativeDatabase>

let _db: NativeDb | null = null

function getOrCreateDb(): NativeDb {
  if (_db) return _db
  const baseDir = getDbDir()
  _db = new NativeDatabase(baseDir, null) as NativeDb
  return _db
}

// ── Directory / Path utilities ──────────────────────────

export function getDbDir(): string {
  return process.env.SUBSC_CLI_DB_DIR ?? path.join(homedir(), ".config", "subtrack")
}

export function getDefaultBackupDir(): string {
  return path.join(getDbDir(), "backups")
}

export function getDbPath(): string {
  return path.join(getDbDir(), "subtrack.db")
}

export function saveDb(): void {
  getOrCreateDb().save()
}

/**
 * Return the native Database instance (replaces old sql.js Database).
 * Consumers that called db.exec() / db.run() directly must be updated.
 */
export function getDb(): NativeDb {
  return getOrCreateDb()
}

/** Test injection — accepts a native Database instance. */
export function __setDb(db: NativeDb | null): void {
  _db = db
}

// ── Schema (no-op — native constructor handles migrations) ──

export function runMigrations(): void {
  /* handled by native constructor */
}

// ── Subscriptions ────────────────────────────────────────

export function getSubscriptions(options?: {
  sort?: string
  desc?: boolean
  limit?: number
  offset?: number
  includeArchived?: boolean
}): SharedArgs[] {
  const db = getOrCreateDb()
  const filter: Record<string, unknown> = {}

  if (options?.sort) filter.sort = options.sort
  if (options?.desc) filter.descending = options.desc

  const all: SharedArgs[] = db.getSubscriptions(filter)

  let results = all
  if (!options?.includeArchived) {
    results = all.filter((s: SharedArgs) => s.status !== "archived")
  }
  if (options?.offset) {
    results = results.slice(options.offset)
  }
  if (options?.limit) {
    results = results.slice(0, options.limit)
  }
  return results
}

export function getSubscription(id: number): SharedArgs | undefined {
  const result = getOrCreateDb().getSubscription(id)
  return result ?? undefined
}

/** Convert snake_case to camelCase. */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Convert object keys from snake_case to camelCase, also stripping nulls. */
function toCamelCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    out[snakeToCamel(key)] = value === null ? undefined : value
  }
  return out
}

/** Strip null values from an object (napi-rs rejects null for Option<T>). */
function stripNull<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>
  for (const key of Object.keys(out)) {
    if (out[key] === null) {
      out[key] = undefined
    }
  }
  return out as T
}

export function writeSubscription(data: AddSharedArgs): number {
  const sub = getOrCreateDb().addSubscription(toCamelCase(data as unknown as Record<string, unknown>))
  return sub.id
}

export function updateSubscription(
  id: number,
  fields: Partial<AddSharedArgs>,
): boolean {
  try {
    getOrCreateDb().updateSubscription(id, toCamelCase(fields as unknown as Record<string, unknown>))
    return true
  } catch {
    return false
  }
}

export function deleteSubscription(id: number): boolean {
  const count = getOrCreateDb().deleteSubscriptions([id])
  return count > 0
}

export function archiveSubscription(id: number): boolean {
  try {
    getOrCreateDb().archiveSubscription(id)
    return true
  } catch {
    return false
  }
}

export function unarchiveSubscription(id: number): boolean {
  try {
    getOrCreateDb().unarchiveSubscription(id)
    return true
  } catch {
    return false
  }
}

export function mapTags(subs: SharedArgs[]): SharedArgs[] {
  // Native getSubscriptions already returns tags populated.
  return subs
}

export function findSubscriptionByName(name: string): SharedArgs | undefined {
  const results: SharedArgs[] = getOrCreateDb().getSubscriptions({
    search: name,
  } as Record<string, unknown>)
  if (results.length === 0) return undefined
  const lower = name.toLowerCase()
  return results.find(
    (s: SharedArgs) => s.name.toLowerCase() === lower,
  )
}

// ── Tags ─────────────────────────────────────────────────

export function getAllTags(): string[] {
  const tags: { name: string }[] = getOrCreateDb().listTags()
  return tags.map((t) => t.name)
}

export function tagsSubscription(tag: string[] | string): SharedArgs[] {
  const tags = Array.isArray(tag) ? tag : [tag]
  return getOrCreateDb().getSubscriptions({ tags } as Record<string, unknown>)
}

export function getTagsWithCount(): { name: string; count: number }[] {
  return getOrCreateDb().listTags()
}

export function renameTag(oldName: string, newName: string): boolean {
  try {
    getOrCreateDb().renameTag(oldName, newName)
    return true
  } catch {
    return false
  }
}

export function deleteTag(name: string): boolean {
  const count = getOrCreateDb().deleteTag(name)
  return count > 0
}

export function mergeTag(source: string, target: string): boolean {
  try {
    getOrCreateDb().mergeTags(source, target)
    return true
  } catch {
    return false
  }
}

export function pruneTags(): number {
  return getOrCreateDb().pruneTags()
}

// ── LLM Usage ────────────────────────────────────────────

export function addLlmUsage(data: AddLlmUsageArgs): void {
  getOrCreateDb().addUsage(toCamelCase(data as unknown as Record<string, unknown>))
}

export function addLlmUsageFromLog(data: AddLlmUsageFromLogArgs): boolean {
  try {
    getOrCreateDb().addUsage(stripNull({
      provider: data.provider,
      model: data.model,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      cost: data.cost,
      date: data.date,
      description: data.description ?? undefined,
      generationId: data.generation_id ?? undefined,
    } as unknown as Record<string, unknown>))
    return true
  } catch {
    return false
  }
}

export function batchAddLlmUsageFromLog(
  entries: AddLlmUsageFromLogArgs[],
): { added: number; skipped: number } {
  let added = 0
  let skipped = 0
  for (const entry of entries) {
    if (addLlmUsageFromLog(entry)) {
      added++
    } else {
      skipped++
    }
  }
  return { added, skipped }
}

export function getLlmUsage(options?: GetLlmUsageOptions): LlmUsageEntry[] {
  const filter: Record<string, unknown> = {}
  if (options?.provider) filter.provider = options.provider
  if (options?.from) filter.from = options.from
  if (options?.to) filter.to = options.to
  if (options?.limit) filter.limit = options.limit
  if (options?.offset) filter.offset = options.offset
  if (options?.minCost) filter.minCost = options.minCost

  const raw: any[] = getOrCreateDb().listUsage(filter)

  // Convert camelCase from native → snake_case for TS
  return raw.map((e: any) => ({
    id: e.id,
    provider: e.provider,
    model: e.model,
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    cost: e.cost,
    date: e.date,
    description: e.description ?? null,
  })) as LlmUsageEntry[]
}

export function deleteLlmUsage(id: number): boolean {
  const count = getOrCreateDb().deleteUsage([id])
  return count > 0
}

export function getLlmUsageTotal(from: string, to: string): number {
  const result: { totalCost: number } = getOrCreateDb().getUsageTotal(from, to)
  return result.totalCost
}

export function getLlmUsageTotalByProvider(
  from: string,
  to: string,
): { provider: string; total: number }[] {
  const result: { providerBreakdown: { provider: string; cost: number }[] } =
    getOrCreateDb().getUsageTotal(from, to)
  return result.providerBreakdown.map((pb) => ({
    provider: pb.provider,
    total: pb.cost,
  }))
}

// ── Trials ───────────────────────────────────────────────

export function writeTrial(data: AddTrialArgs): void {
  getOrCreateDb().addTrial(stripNull(data as unknown as Record<string, unknown>))
}

export function getTrials(): TrialEntry[] {
  return getOrCreateDb().listTrials() as TrialEntry[]
}

export function getTrial(id: number): TrialEntry | undefined {
  const all: TrialEntry[] = getOrCreateDb().listTrials()
  return all.find((t: TrialEntry) => t.id === id)
}

export function deleteTrial(id: number): boolean {
  const count = getOrCreateDb().deleteTrials([id])
  return count > 0
}

export function getTrialsExpiringSoon(days: number): TrialEntry[] {
  return getOrCreateDb().getExpiringTrials(days) as TrialEntry[]
}

// ── Price History ────────────────────────────────────────

export function writePriceHistory(
  subscriptionId: number,
  oldPrice: number | null,
  newPrice: number,
  oldCurrency: string | null,
  newCurrency: string,
): void {
  // price history is tracked automatically by native on updateSubscription
  // manual call is a no-op (native handles it)
}

export function getPriceHistory(subscriptionId: number): PriceHistoryEntry[] {
  return getOrCreateDb().getPriceHistory(subscriptionId, null) as PriceHistoryEntry[]
}

export function getAllPriceChanges(days?: number): PriceHistoryEntry[] {
  return getOrCreateDb().getPriceHistory(null, days ?? null) as PriceHistoryEntry[]
}

export type { PriceHistoryEntry } from "./types.ts"

// ── Audit Log ────────────────────────────────────────────

export function addAuditLog(_args: AddAuditArgs): void {
  // Native operations auto-log audit entries.
  // Manual TS-side addAuditLog calls (e.g. for config/cleanup
  // entries not covered by ops) are informational-only.
}

export function getAuditLogs(options?: {
  action?: string
  limit?: number
  offset?: number
  from?: string
  to?: string
}): AuditEntry[] {
  const filter: Record<string, unknown> = {}
  if (options?.action) filter.action = options.action
  if (options?.limit) filter.limit = options.limit
  if (options?.from) filter.from = options.from
  if (options?.to) filter.to = options.to

  const raw: any[] = getOrCreateDb().getAuditLog(filter)

  // Convert camelCase from native → snake_case for TS
  return raw.map((e: any) => ({
    id: e.id,
    action: e.action,
    target_type: e.entityType ?? null,
    target_id: e.entityId ?? null,
    details: e.details ?? null,
    created_at: e.createdAt,
  })) as AuditEntry[]
}

export function getAuditLogCount(options?: {
  action?: string
  from?: string
  to?: string
}): number {
  const filter: Record<string, unknown> = {}
  if (options?.action) filter.action = options.action
  if (options?.from) filter.from = options.from
  if (options?.to) filter.to = options.to
  filter.limit = 999999

  const raw: any[] = getOrCreateDb().getAuditLog(filter)
  return raw.length
}

export function pruneAuditLogs(before: string): number {
  const beforeDate = new Date(before)
  const now = new Date()
  const diffMs = now.getTime() - beforeDate.getTime()
  const days = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  return getOrCreateDb().pruneAuditLog(days)
}

export type { AuditEntry, AuditAction, AddAuditArgs } from "./types.ts"

// ── Backup / Restore ─────────────────────────────────────

export function getBackupFiles(dir: string): BackupFileInfo[] {
  const raw: any[] = getOrCreateDb().listBackups(dir)
  // Convert mtime from number (epoch ms) → Date for TS type
  return raw.map((f: any) => ({
    name: f.name,
    path: f.path,
    mtime: new Date(f.mtime),
    size: f.size,
  }))
}

export function restoreDb(backupPath: string): void {
  getOrCreateDb().restoreDb(backupPath)
}

// ── Backup integrity (SHA-256 sidecar) ───────────────────

export function getBackupHashPath(backupPath: string): string {
  return `${backupPath}.sha256`
}

export function writeBackupHash(backupPath: string): void {
  const content = readFileSync(backupPath)
  const hash = createHash("sha256").update(content).digest("hex")
  writeFileSync(getBackupHashPath(backupPath), hash + "\n")
}

export function verifyBackupHash(backupPath: string): boolean {
  const hashPath = getBackupHashPath(backupPath)
  if (!existsSync(hashPath)) {
    return true // backward compat: skip if no sidecar
  }
  const expected = readFileSync(hashPath, "utf-8").trim()
  const content = readFileSync(backupPath)
  const actual = createHash("sha256").update(content).digest("hex")
  return expected === actual
}

// ── Stats (native) — used by src/stats.ts ────────────────

export function getStats(): {
  totalSubscriptions: number
  totalTags: number
  totalUsage: number
  totalTrials: number
  dbSizeBytes: number
  oldestEntry: string | null
  newestEntry: string | null
} {
  const stats: any = getOrCreateDb().getStats()
  return {
    totalSubscriptions: stats.totalSubscriptions,
    totalTags: stats.totalTags,
    totalUsage: stats.totalUsage,
    totalTrials: stats.totalTrials,
    dbSizeBytes: stats.dbSizeBytes,
    oldestEntry: stats.oldestEntry ?? null,
    newestEntry: stats.newestEntry ?? null,
  }
}

// ── Maintenance (native) — used by src/cleanup.ts / src/maintenance.ts ──

export function runMaintenance(options?: {
  vacuum?: boolean
  check?: boolean
}): {
  integrityOk?: boolean
  integrityMessage?: string
  vacuumOk?: boolean
  vacuumMessage?: string
} {
  const raw: any = getOrCreateDb().runMaintenance(
    options?.vacuum ?? null,
    options?.check ?? null,
  )
  return {
    integrityOk: raw.integrityOk ?? undefined,
    integrityMessage: raw.integrityMessage ?? undefined,
    vacuumOk: raw.vacuumOk ?? undefined,
    vacuumMessage: raw.vacuumMessage ?? undefined,
  }
}

// ── List currencies (native) — used by src/commands.ts ───

export function listCurrencies(): { code: string; name: string; symbol: string }[] {
  return getOrCreateDb().listCurrencies() as { code: string; name: string; symbol: string }[]
}

// ── Clone (native) — used by src/subscription.ts ─────────

export function cloneSubscription(
  id: number,
  newName?: string | null,
): SharedArgs {
  return getOrCreateDb().cloneSubscription(id, newName ?? null) as SharedArgs
}

// ── Bulk operations (native) — used by src/bulk.ts ───────

export function bulkUpdateStatus(
  newStatus: string,
  filter: { tag?: string; status?: string; name?: string },
): number {
  return getOrCreateDb().bulkUpdateStatus(newStatus, filter)
}

export function bulkDeleteSubs(
  filter: { tag?: string; status?: string; name?: string },
): number {
  return getOrCreateDb().bulkDeleteSubs(filter)
}

export function bulkTagAdd(
  tag: string,
  filter: { tag?: string; status?: string; name?: string },
): number {
  return getOrCreateDb().bulkTagAdd(tag, filter)
}

export function bulkTagRemove(
  tag: string,
  filter: { tag?: string; status?: string; name?: string },
): number {
  return getOrCreateDb().bulkTagRemove(tag, filter)
}

// ── Payment / Forecast / Analytics / Compare (native) ───

export function getPaymentSummary(
  period: string,
  filter?: { currency?: string; tags?: string[]; status?: string } | null,
): any {
  return getOrCreateDb().getPaymentSummary(period, filter ?? null)
}

export function getForecast(input: {
  months?: number
  currency?: string
  tags?: string[]
  growthRate?: number
}): any {
  return getOrCreateDb().getForecast(input)
}

export function getAnalytics(options?: {
  currency?: string
  period?: string
}): any {
  return getOrCreateDb().getAnalytics(options ?? null)
}

export function comparePeriods(input: {
  period1: string
  period2: string
  currency?: string
  tags?: string[]
}): any {
  return getOrCreateDb().comparePeriods(input)
}

// ── Export / Import (native) ─────────────────────────────

export function exportCsv(options?: {
  format?: string
  currency?: string
  tags?: string[]
  status?: string
}): string {
  return getOrCreateDb().exportCsv(options ?? null)
}

export function exportJson(options?: {
  format?: string
  currency?: string
  tags?: string[]
  status?: string
}): string {
  return getOrCreateDb().exportJson(options ?? null)
}

export function exportMd(options?: {
  format?: string
  currency?: string
  tags?: string[]
  status?: string
}): string {
  return getOrCreateDb().exportMd(options ?? null)
}

export function importCsv(
  content: string,
  dryRun?: boolean | null,
  deduplicate?: boolean | null,
): { imported: number; skipped: number; errors: string[] } {
  return getOrCreateDb().importCsv(content, dryRun ?? null, deduplicate ?? null)
}

// ── Upcoming / Calendar / Timeline (native) ──────────────

export function getUpcomingBills(days?: number | null): any[] {
  return getOrCreateDb().getUpcomingBills(days ?? null)
}

export function getCalendarData(
  year?: number | null,
  month?: number | null,
): any {
  return getOrCreateDb().getCalendarData(year ?? null, month ?? null)
}

export function getTimeline(months?: number | null): any[] {
  return getOrCreateDb().getTimeline(months ?? null)
}

// ── Optimization (native) ────────────────────────────────

export function getOptimizationSuggestions(minSavings?: number | null): any[] {
  return getOrCreateDb().getOptimizationSuggestions(minSavings ?? null)
}

// ── Backup natively (used by src/backup.ts) ──────────────

export function backupDb(
  destination: string,
  encrypt?: boolean | null,
): string {
  return getOrCreateDb().backupDb(destination, encrypt ?? null)
}

// ── Config (native JSON file-based) ──────────────────────

export function loadConfig(): any {
  return getOrCreateDb().loadConfig()
}

export function saveConfig(config: any): void {
  getOrCreateDb().saveConfig(config)
}

export function resetConfigFile(): void {
  getOrCreateDb().resetConfigFile()
}

export function listProfiles(): any[] {
  return getOrCreateDb().listProfiles()
}

export function showProfile(name: string): any {
  return getOrCreateDb().showProfile(name) ?? undefined
}

export function saveProfile(name: string, profile: any): void {
  getOrCreateDb().saveProfile(name, profile)
}

export function switchProfile(name: string): any {
  return getOrCreateDb().switchProfile(name)
}

export function deleteProfile(name: string): void {
  getOrCreateDb().deleteProfile(name)
}
