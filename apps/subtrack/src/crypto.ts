import { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync, chmodSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"
import { consola } from "consola"

const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32
const SQLITE_MAGIC = Buffer.from("SQLite format 3\x00")

function getConfigDir(): string {
  return process.env.SUBSC_CLI_DB_DIR ?? path.join(homedir(), ".config", "subtrack")
}

function getKeyPath(): string {
  return path.join(getConfigDir(), ".key")
}

function getSaltPath(): string {
  return path.join(getConfigDir(), ".key.salt")
}

// ── Key integrity (SHA-256 sidecar) ─────────────────────────

function getKeyIntegrityPath(): string {
  return path.join(getConfigDir(), ".key.sha256")
}

/** Write a SHA-256 integrity hash for the key file. */
function writeKeyIntegrity(keyContent: Buffer): void {
  const hash = createHash("sha256").update(keyContent).digest("hex")
  writeFileSync(getKeyIntegrityPath(), hash + "\n", { mode: 0o600 })
}

/**
 * Verify the key file's SHA-256 integrity against the stored hash.
 * Returns true if the hash matches or no sidecar exists (first run migration).
 * Returns false if the hash exists but doesn't match (tampered key).
 */
function verifyKeyIntegrity(keyContent: Buffer): boolean {
  const integrityPath = getKeyIntegrityPath()
  if (!existsSync(integrityPath)) {
    // No integrity file yet — create one for future checks
    writeKeyIntegrity(keyContent)
    return true
  }
  try {
    verifySecureFilePermission(integrityPath, "Key integrity file")
    const expected = readFileSync(integrityPath, "utf-8").trim()
    const actual = createHash("sha256").update(keyContent).digest("hex")
    return expected === actual
  } catch {
    return false
  }
}

// ---- Internal helpers ----

/** Verify that a sensitive file is safe to read (regular file, owner-only permissions). Fail-closed. */
function verifySecureFilePermission(filePath: string, name: string): void {
  let st
  try {
    st = lstatSync(filePath)
  } catch {
    throw new Error(`${name} at ${filePath} is not accessible`)
  }

  if (st.isSymbolicLink()) {
    throw new Error(`${name} at ${filePath} is a symbolic link — refusing to read`)
  }

  if (!st.isFile()) {
    throw new Error(`${name} at ${filePath} is not a regular file — refusing to read`)
  }

  // Check for group/others permissions (mode 077 = others rwx)
  if (st.mode & 0o077) {
    consola.warn(
      `${name} has overly permissive permissions (${(st.mode & 0o777).toString(8)}). Fixing to 600.`,
    )
    try {
      chmodSync(filePath, 0o600)
    } catch {
      throw new Error(`Failed to fix permissions on ${name} at ${filePath}`)
    }
  }

  // Check ownership on non-Windows
  if (process.platform !== "win32" && typeof process.getuid === "function") {
    const uid = process.getuid()
    if (uid !== undefined && uid !== null && st.uid !== uid) {
      consola.warn(
        `${name} is not owned by current user (uid ${st.uid}). This may indicate tampering.`,
      )
    }
  }
}

function generateKey(): Buffer {
  return randomBytes(KEY_LENGTH)
}

function deriveKeyFromPassphrase(passphrase: string): Buffer {
  const saltPath = getSaltPath()
  let salt: Buffer
  if (existsSync(saltPath)) {
    verifySecureFilePermission(saltPath, "Key salt file")
    salt = readFileSync(saltPath)
  } else {
    salt = randomBytes(SALT_LENGTH)
    const dir = getConfigDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(saltPath, salt, { mode: 0o600 })
  }
  return scryptSync(passphrase, salt, KEY_LENGTH, { N: 131072, r: 8, p: 1 })
}

function getOrCreateKey(): Buffer {
  const passphrase = process.env.SUBSC_CLI_DB_PASSPHRASE
  if (passphrase) return deriveKeyFromPassphrase(passphrase)

  const keyPath = getKeyPath()
  if (existsSync(keyPath)) {
    verifySecureFilePermission(keyPath, "Encryption key file")
    const keyContent = readFileSync(keyPath)

    // Verify key size
    if (keyContent.length !== KEY_LENGTH) {
      throw new Error(
        `Encryption key has unexpected size (${keyContent.length} bytes, expected ${KEY_LENGTH}). ` +
        "The key file may be corrupted. Restore from backup or delete the key file to generate a new one.",
      )
    }

    // Verify integrity (detect tampering early, before GCM decryption fails)
    if (!verifyKeyIntegrity(keyContent)) {
      consola.error(
        "Encryption key integrity check FAILED. The key file may have been tampered with.\n" +
        "  Restore the original .key file from a backup, or delete it to generate a new key.\n" +
        "  If you generate a new key, encrypted backups will NOT be recoverable.",
      )
      throw new Error("Encryption key integrity check failed — possible tampering detected")
    }

    return keyContent
  }

  const dir = getConfigDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const key = generateKey()
  writeFileSync(keyPath, key, { mode: 0o600 })
  writeKeyIntegrity(key) // Write integrity hash for future verification
  consola.warn(
    `Encryption key created at: ${keyPath}\n` +
    `  !! BACKUP THIS KEY! If lost, your encrypted database cannot be recovered.\n` +
    `  >> Copy the file to a secure location (e.g. password manager).\n` +
    `  >> Or set SUBSC_CLI_DB_PASSPHRASE to derive the key from a passphrase instead.`,
  )
  return key
}

// ---- Public API ----

export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getOrCreateKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

export function decryptBuffer(ciphertext: Buffer): Buffer {
  const minLength = IV_LENGTH + TAG_LENGTH
  if (ciphertext.length < minLength) {
    throw new Error(`Ciphertext too short: expected at least ${minLength} bytes, got ${ciphertext.length}`)
  }
  const key = getOrCreateKey()
  const iv = ciphertext.subarray(0, IV_LENGTH)
  const tag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const data = ciphertext.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/**
 * Returns true if the buffer does NOT start with the SQLite magic header,
 * meaning it is (likely) an encrypted blob.
 */
export function isEncrypted(buffer: Buffer): boolean {
  if (buffer.length < 16) return false
  return !buffer.subarray(0, 16).equals(SQLITE_MAGIC)
}

export function hasEncryptionKey(): boolean {
  if (process.env.SUBSC_CLI_DB_PASSPHRASE) return true
  return existsSync(getKeyPath())
}
