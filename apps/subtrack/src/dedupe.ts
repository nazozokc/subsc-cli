import { consola } from "consola"
import pc from "picocolors"
import { getSubscriptions, getNonCancelledSubscriptions, getSubscription, mergeSubscriptions } from "./db.ts"
import { logAudit } from "./audit.ts"
import { fail } from "./error.ts"
import { formatPrice } from "./price.ts"
import type { SharedArgs } from "./types.ts"

export type DedupeOptions = {
  /** Similarity threshold 0-1 (default: 0.8) */
  threshold?: number
  /** Output as JSON */
  json?: boolean
}

export type DuplicatePair = {
  a: SharedArgs
  b: SharedArgs
  score: number
  vendorUrlMatch: boolean
}

/**
 * Normalize a name for comparison: lowercase, strip all non-letter/non-digit
 * characters (spaces, punctuation, hyphens).
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

/** Levenshtein edit distance between two strings (O(m*n) with rolling arrays). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

/**
 * Similarity score between two names in [0, 1].
 * 1 = identical after normalization, 0 = completely different.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0
  const dist = levenshtein(na, nb)
  return 1 - dist / Math.max(na.length, nb.length)
}

/**
 * Find potential duplicate pairs among subscriptions.
 * A pair is reported when the normalized-name similarity is at or above
 * the threshold, or when vendor URLs match exactly (boosted to >= 0.9).
 */
export function findDuplicates(subs: SharedArgs[], threshold = 0.8): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      const a = subs[i]!
      const b = subs[j]!
      const nameScore = similarity(a.name, b.name)
      const vendorUrlMatch = !!(a.vendorUrl && a.vendorUrl === b.vendorUrl)
      const score = vendorUrlMatch ? Math.max(nameScore, 0.9) : nameScore
      if (score >= threshold) {
        pairs.push({ a, b, score, vendorUrlMatch })
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score)
}

export function handleDedupe(options: DedupeOptions = {}): void {
  const threshold = options.threshold ?? 0.8
  if (threshold < 0 || threshold > 1) {
    fail("threshold must be between 0 and 1")
    return
  }

  const subs = getNonCancelledSubscriptions()
  const pairs = findDuplicates(subs, threshold)

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        pairs.map((p) => ({
          a: { id: p.a.id, name: p.a.name, price: p.a.price, currency: p.a.currency },
          b: { id: p.b.id, name: p.b.name, price: p.b.price, currency: p.b.currency },
          score: Number(p.score.toFixed(3)),
          vendorUrlMatch: p.vendorUrlMatch,
        })),
        null,
        2,
      ) + "\n",
    )
    return
  }

  if (pairs.length === 0) {
    consola.info("No duplicate subscriptions found")
    return
  }

  consola.log(pc.bold(`Potential duplicates (threshold: ${threshold}):`))
  consola.log("")
  for (const p of pairs) {
    const scoreStr = pc.cyan(`${Math.round(p.score * 100)}%`)
    const vendor = p.vendorUrlMatch ? pc.dim(" [same vendor URL]") : ""
    consola.log(
      `  ${pc.bold(`#${p.a.id} ${p.a.name}`)}  ${formatPrice(p.a.price, p.a.currency)}/${p.a.cycle}`,
    )
    consola.log(
      `  ${pc.bold(`#${p.b.id} ${p.b.name}`)}  ${formatPrice(p.b.price, p.b.currency)}/${p.b.cycle}  ${scoreStr}${vendor}`,
    )
    consola.log("")
  }
  consola.info("Merge with: subtrack dedupe merge <keepId> <removeId>")
}

export function handleDedupeMerge(keepId: number, removeId: number): void {
  if (keepId === removeId) {
    fail("keep and remove IDs must differ")
    return
  }
  const keep = getSubscription(keepId)
  const remove = getSubscription(removeId)
  if (!keep) {
    fail(`Subscription with id ${keepId} not found`)
    return
  }
  if (!remove) {
    fail(`Subscription with id ${removeId} not found`)
    return
  }

  try {
    if (mergeSubscriptions(keepId, removeId)) {
      logAudit("subscription.merge", {
        targetType: "subscription",
        targetId: keepId,
        details: `Merged #${removeId} "${remove.name}" into "${keep.name}"`,
      })
      consola.success(`Merged: "${remove.name}" (#${removeId}) → "${keep.name}" (#${keepId})`)
    } else {
      fail(`Failed to merge: subscription #${removeId} not found`)
    }
  } catch (error) {
    fail(`Failed to merge subscriptions: ${String(error)}`)
  }
}