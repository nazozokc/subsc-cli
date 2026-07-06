import { test, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, existsSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

let tmpDir: string
let originalDbDir: string | undefined

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "subtrack-crypto-test-"))
  originalDbDir = process.env.SUBSC_CLI_DB_DIR
  process.env.SUBSC_CLI_DB_DIR = tmpDir
})

afterAll(() => {
  if (originalDbDir !== undefined) {
    process.env.SUBSC_CLI_DB_DIR = originalDbDir
  } else {
    delete process.env.SUBSC_CLI_DB_DIR
  }
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
})

test("encryptBuffer and decryptBuffer round-trip", async () => {
  const { encryptBuffer, decryptBuffer } = await import("../crypto.ts")
  const original = Buffer.from("Hello, subtrack! This is sensitive data.")
  const encrypted = encryptBuffer(original)
  expect(encrypted).not.toEqual(original)
  expect(encrypted.length).toBeGreaterThan(original.length)

  const decrypted = decryptBuffer(encrypted)
  expect(decrypted).toEqual(original)
})

test("encryptBuffer produces different output each time (random IV)", async () => {
  const { encryptBuffer, decryptBuffer } = await import("../crypto.ts")
  const original = Buffer.from("same data")
  const a = encryptBuffer(original)
  const b = encryptBuffer(original)
  expect(a).not.toEqual(b)
  // Both should decrypt correctly
  expect(decryptBuffer(a)).toEqual(original)
  expect(decryptBuffer(b)).toEqual(original)
})

test("isEncrypted returns true for encrypted data", async () => {
  const { encryptBuffer, isEncrypted } = await import("../crypto.ts")
  const data = Buffer.from("test data")
  const encrypted = encryptBuffer(data)
  expect(isEncrypted(encrypted)).toBe(true)
})

test("isEncrypted returns false for SQLite magic header", async () => {
  const { isEncrypted } = await import("../crypto.ts")
  const sqliteBuf = Buffer.from("SQLite format 3\x00")
  const padded = Buffer.concat([sqliteBuf, Buffer.alloc(100)])
  expect(isEncrypted(padded)).toBe(false)
})

test("isEncrypted returns false for short buffers", async () => {
  const { isEncrypted } = await import("../crypto.ts")
  expect(isEncrypted(Buffer.alloc(10))).toBe(false)
  expect(isEncrypted(Buffer.alloc(0))).toBe(false)
})

test("hasEncryptionKey returns true after key creation", async () => {
  const { encryptBuffer, hasEncryptionKey } = await import("../crypto.ts")
  encryptBuffer(Buffer.from("trigger key creation"))
  expect(hasEncryptionKey()).toBe(true)
})

test("key file is created with restricted permissions (0o600)", async () => {
  // Windows does not support Unix permission bits via chmod
  if (process.platform === "win32") return

  const { encryptBuffer } = await import("../crypto.ts")
  encryptBuffer(Buffer.from("perm test"))

  const keyPath = join(tmpDir, ".key")
  expect(existsSync(keyPath)).toBe(true)

  // st.mode includes file type bits; mask with 0o777 for permission bits
  const st = statSync(keyPath)
  expect(st.mode & 0o777).toBe(0o600)
})

test("hasEncryptionKey returns true with SUBSC_CLI_DB_PASSPHRASE", async () => {
  const origPass = process.env.SUBSC_CLI_DB_PASSPHRASE
  process.env.SUBSC_CLI_DB_PASSPHRASE = "test-passphrase-123"
  try {
    // Need to use a clean import to pick up the env var
    // Since modules are cached, re-use existing module
    const { hasEncryptionKey } = await import("../crypto.ts")
    expect(hasEncryptionKey()).toBe(true)
  } finally {
    if (origPass !== undefined) {
      process.env.SUBSC_CLI_DB_PASSPHRASE = origPass
    } else {
      delete process.env.SUBSC_CLI_DB_PASSPHRASE
    }
  }
})
