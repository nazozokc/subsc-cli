import { test, expect, beforeAll, afterAll, afterEach } from "vitest"
import initSqlJs from "sql.js"
import {
  mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { gzipSync } from "node:zlib"
import { decryptBuffer, isEncrypted } from "../crypto.ts"

const conn = await import("../db/connection.ts")

// connection.ts caches _db after the first successful getDb(), so all
// file-backed tests share one persistent directory. Per-test dirs are
// only used where no lasting state is needed (lock conflict).
let mainDir: string
const tempDirs: string[] = []

beforeAll(() => {
  mainDir = mkdtempSync(join(tmpdir(), "subtrack-conn-main-"))
  process.env.SUBSC_CLI_DB_DIR = mainDir
})

afterAll(() => {
  delete process.env.SUBSC_CLI_DB_DIR
  for (const dir of [mainDir, ...tempDirs]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

afterEach(() => {
  delete process.env.SUBSC_CLI_DB_PASSPHRASE
})

// ── Directory validation ───────────────────────────────

test("getDbDir rejects system directories", () => {
  for (const bad of ["/", "/etc", "/dev", "/proc", "/sys", "/tmp"]) {
    process.env.SUBSC_CLI_DB_DIR = bad
    expect(() => conn.getDbDir()).toThrow(/system directory/)
  }
  process.env.SUBSC_CLI_DB_DIR = mainDir
})

test("getDbDir rejects empty env value", () => {
  process.env.SUBSC_CLI_DB_DIR = ""
  expect(() => conn.getDbDir()).toThrow(/non-empty string/)
  process.env.SUBSC_CLI_DB_DIR = mainDir
})

test("getDbDir accepts a valid temp directory", () => {
  expect(conn.getDbDir()).toBe(mainDir)
})

// ── Lock handling ─────────────────────────────────────
// NOTE: must run before any successful getDb() call, because connection.ts
// caches _db and skips lock acquisition afterwards.

test("getDb throws when another instance holds the lock", () => {
  const dir = mkdtempSync(join(tmpdir(), "subtrack-conn-lock-"))
  tempDirs.push(dir)
  process.env.SUBSC_CLI_DB_DIR = dir
  // Simulate a live lock owned by this process
  writeFileSync(join(dir, ".subtrack.lock"), `${process.pid}\n${Date.now()}\n`)

  expect(() => conn.getDb()).toThrow(/another instance may be running/i)
})

test("getDb acquires lock, creates lock file, and sets db path", () => {
  process.env.SUBSC_CLI_DB_DIR = mainDir

  conn.getDb()
  const lockContent = readFileSync(join(mainDir, ".subtrack.lock"), "utf-8")
  const lines = lockContent.trim().split("\n")
  expect(lines[0]).toBe(String(process.pid))
  expect(Number(lines[1])).toBeGreaterThan(0)

  expect(conn.getDbPath()).toBe(join(mainDir, "subtrack.db"))
})

// ── saveDb ────────────────────────────────────────────

test("saveDb writes encrypted database with integrity hash", async () => {
  process.env.SUBSC_CLI_DB_DIR = mainDir

  const db = conn.getDb()
  db.run("CREATE TABLE IF NOT EXISTS t (x INTEGER)")
  db.run("INSERT INTO t VALUES (42)")
  conn.saveDb()

  const dbPath = conn.getDbPath()
  const file = readFileSync(dbPath)
  expect(isEncrypted(file)).toBe(true)

  // Reload the encrypted file and verify contents
  const SQL = await initSqlJs()
  const loaded = new SQL.Database(decryptBuffer(file))
  const res = loaded.exec("SELECT x FROM t")
  expect(Number(res[0].values[0][0])).toBe(42)
  loaded.close()

  // Integrity sidecar exists and verifies
  const { verifyDbHash } = await import("../db/integrity.ts")
  expect(existsSync(`${dbPath}.sha256`)).toBe(true)
  expect(verifyDbHash(file, dbPath).ok).toBe(true)

  // Tampering is detected
  const tampered = Buffer.from(file)
  tampered[tampered.length - 1] = (tampered[tampered.length - 1]! ^ 0xff) as number
  expect(verifyDbHash(tampered, dbPath).ok).toBe(false)
})

// ── restoreDb variants ────────────────────────────────

async function makeBackupBytes(): Promise<Buffer> {
  const SQL = await initSqlJs()
  const backup = new SQL.Database()
  backup.run("CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, currency TEXT NOT NULL, cycle TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', billing_day INTEGER, created_at TEXT NOT NULL DEFAULT (date('now')), notes TEXT)")
  backup.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)")
  backup.run("CREATE TABLE subscription_tags (subscription_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (subscription_id, tag_id))")
  backup.run("INSERT INTO subscriptions (name, price, currency, cycle) VALUES ('GzService', 999, 'USD', 'monthly')")
  const buf = Buffer.from(backup.export())
  backup.close()
  return buf
}

test("restoreDb restores from a gzipped backup (.db.gz)", async () => {
  process.env.SUBSC_CLI_DB_DIR = mainDir

  const backupBytes = await makeBackupBytes()
  const backupPath = join(mainDir, "backup.db.gz")
  writeFileSync(backupPath, gzipSync(backupBytes))

  conn.restoreDb(backupPath)

  const res = conn.getDb().exec("SELECT name FROM subscriptions WHERE name = 'GzService'")
  expect(res.length).toBeGreaterThan(0)
  expect(String(res[0].values[0][0])).toBe("GzService")
})

test("restoreDb restores from an encrypted backup (.db.enc)", async () => {
  process.env.SUBSC_CLI_DB_DIR = mainDir

  const backupBytes = await makeBackupBytes()
  const backupPath = join(mainDir, "backup.db.enc")
  writeFileSync(backupPath, Buffer.from((await import("../crypto.ts")).encryptBuffer(backupBytes)))

  conn.restoreDb(backupPath)

  const res = conn.getDb().exec("SELECT name FROM subscriptions WHERE name = 'GzService'")
  expect(res.length).toBeGreaterThan(0)
  expect(String(res[0].values[0][0])).toBe("GzService")
})

test("restoreDb rejects an encrypted backup with the wrong key", async () => {
  process.env.SUBSC_CLI_DB_DIR = mainDir

  const backupBytes = await makeBackupBytes()
  const backupPath = join(mainDir, "backup-wrong-key.db.enc")
  // Encrypt with a passphrase-derived key (different from the .key file)
  process.env.SUBSC_CLI_DB_PASSPHRASE = "wrong-passphrase"
  writeFileSync(backupPath, Buffer.from((await import("../crypto.ts")).encryptBuffer(backupBytes)))

  // Restore with the default key — decryption must fail
  delete process.env.SUBSC_CLI_DB_PASSPHRASE
  expect(() => conn.restoreDb(backupPath)).toThrow(/Failed to decrypt/i)
})
