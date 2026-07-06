import { consola } from "consola"
import {
  mkdirSync, existsSync, statSync, openSync, writeSync, closeSync, constants,
} from "node:fs"
import { gzipSync } from "node:zlib"
import { encryptBuffer, decryptBuffer, isEncrypted, hasEncryptionKey } from "./crypto.ts"
import { logAudit } from "./audit.ts"
import path from "node:path"
import os from "node:os"
import type { BackupFileInfo } from "./types.ts"
import { resolveSafePath, resolveSafeOutputPath } from "./path-utils.ts"
import {
  getSubscriptions,
  getDbPath,
  getDb,
  getDbDir,
  getDefaultBackupDir,
  getBackupFiles,
  restoreDb,
  saveDb,
  writeBackupHash,
  verifyBackupHash,
} from "./db.ts"
import { input, confirm, select } from "@inquirer/prompts"

/** Generate a compact timestamp string for backup filenames. */
function getTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * Compress the current DB and write to `destPath` with exclusive-create.
 * Returns true on success, false on failure.
 */
function writeCompressedBackup(destPath: string, encrypt: boolean): boolean {
  const sqliteBuf = Buffer.from(getDb().export())
  const compressed = gzipSync(sqliteBuf)
  const writeBuf = encrypt ? encryptBuffer(compressed) : compressed

  try {
    const fd = openSync(
      destPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    )
    try {
      let offset = 0
      while (offset < writeBuf.length) {
        const written = writeSync(fd, writeBuf, offset, writeBuf.length - offset)
        if (written <= 0) throw new Error(`writeSync wrote ${written} bytes at offset ${offset}`)
        offset += written
      }
    } finally {
      closeSync(fd)
    }
    writeBackupHash(destPath)
    return true
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === "EEXIST") {
      consola.error(`Backup file already exists: ${destPath}`)
    } else {
      consola.error(`Backup failed: ${nodeErr.message}`)
    }
    return false
  }
}

function formatFileSize(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"]
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

async function safeAutoBackup() {
  saveDb()
  const backupDir = getDefaultBackupDir()
  mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const ts = getTimestamp()
  const encrypt = hasEncryptionKey()
  const ext = encrypt ? ".db.enc" : ".db.gz"
  const destPath = path.join(backupDir, `subtrack_${ts}_before_restore${ext}`)

  if (writeCompressedBackup(destPath, encrypt)) {
    consola.info(`Auto-backup created: ${destPath}${encrypt ? " (encrypted)" : ""}`)
  } else {
    consola.warn("Could not create auto-backup, continuing with restore")
  }
}

/**
 * Create a timestamped, gzip-compressed backup of the SQLite database.
 * Optionally encrypts the backup using AES-256-GCM.
 * @param destination - Directory to write the backup into (default: `~/.config/subtrack/backups/`)
 * @param options.encrypt - Encrypt the backup with the database encryption key
 */
export async function handleBackup(destination?: string, options: { encrypt?: boolean } = {}) {
  saveDb()

  let dest = destination ?? getDefaultBackupDir()
  try {
    // Validate the backup destination path (directory may not exist yet)
    if (destination) {
      const safeDest = resolveSafeOutputPath([os.homedir(), os.tmpdir()], destination)
      if (!safeDest) {
        consola.error(`Invalid backup destination — must be within home directory`)
        return
      }
      dest = safeDest
    }
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true, mode: 0o700 })
    }
    if (!statSync(dest).isDirectory()) {
      consola.error(`Backup destination must be a directory: ${dest}`)
      return
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException
    consola.error(`Backup destination is not accessible: ${nodeErr.message}`)
    return
  }

  // Warn when database is encrypted but backup won't be
  if (!options.encrypt && hasEncryptionKey()) {
    consola.warn(
      "Database is encrypted but backup will NOT be encrypted.\n" +
      "  Use --encrypt (-e) to encrypt the backup.",
    )
  }

  const ts = getTimestamp()
  const destPath = options.encrypt
    ? path.join(dest, `subtrack_${ts}.db.enc`)
    : path.join(dest, `subtrack_${ts}.db.gz`)

  if (writeCompressedBackup(destPath, options.encrypt ?? false)) {
    consola.success(
      `Backup created: ${destPath}${options.encrypt ? " (encrypted)" : ""}`,
    )
  }
}

export async function handleRestore(
  file?: string,
  options: { force?: boolean; dir?: string } = {},
) {
  if (file) {
    // ── Non-interactive ──────────────────────────────────
    const safePath = resolveSafePath([os.homedir(), os.tmpdir()], path.resolve(file))
    if (!safePath) {
      consola.error(`Invalid backup file — must be within home directory`)
      return
    }

    const resolvedPath = safePath

    const currentCount = getSubscriptions().length
    if (!options.force) {
      const ok = await confirm({
        message:
          `Restore "${path.basename(resolvedPath)}"? Current data (${currentCount} subscription${currentCount !== 1 ? "s" : ""}) will be backed up automatically.`,
        default: false,
      })
      if (!ok) {
        consola.info("Cancelled")
        return
      }
    }

    if (!verifyBackupHash(resolvedPath)) {
      consola.warn("Backup integrity check failed (SHA256 mismatch)")
      if (!options.force) {
        const ok = await confirm({
          message: "SHA256 mismatch — restore anyway?",
          default: false,
        })
        if (!ok) { consola.info("Cancelled"); return }
      }
    }

    await safeAutoBackup()

    try {
      restoreDb(resolvedPath)
      const subs = getSubscriptions()
      logAudit("backup.restore", {
        details: `Restored ${subs.length} subscriptions from ${path.basename(resolvedPath)}`,
      })
      consola.success(
        `Restored ${subs.length} subscription${subs.length !== 1 ? "s" : ""} from: ${resolvedPath}`,
      )
    } catch (e) {
      consola.error(`Restore failed: ${String(e)}`)
    }
    return
  }

  // ── Interactive ────────────────────────────────────────
  let searchDir: string
  if (options.dir) {
    const safeDir = resolveSafePath([os.homedir(), os.tmpdir()], path.resolve(options.dir))
    if (!safeDir) {
      consola.error(`Invalid search directory — must be within home directory`)
      return
    }
    searchDir = safeDir
  } else {
    searchDir = getDefaultBackupDir()
  }

  let backups: BackupFileInfo[]
  try {
    backups = getBackupFiles(searchDir)
  } catch {
    consola.error(`Cannot read directory: ${searchDir}`)
    return
  }

  if (backups.length === 0) {
    consola.info(`No backup files found in: ${searchDir}`)
    return
  }

  const selected = await select({
    message: "Select a backup to restore:",
    loop: false,
    pageSize: 10,
    choices: backups.map((f) => ({
      name: `${f.name}  (${formatFileSize(f.size)}, ${f.mtime.toLocaleString()})`,
      value: f.path,
    })),
  })

  const currentCount = getSubscriptions().length
  const ok = await confirm({
    message:
      `Restore "${path.basename(selected)}"? Current data (${currentCount} subscription${currentCount !== 1 ? "s" : ""}) will be backed up automatically.`,
    default: false,
  })

  if (!ok) {
    consola.info("Cancelled")
    return
  }

  if (!verifyBackupHash(selected)) {
    consola.warn("Backup integrity check failed (SHA256 mismatch)")
    const proceed = await confirm({
      message: "SHA256 mismatch — restore anyway?",
      default: false,
    })
    if (!proceed) { consola.info("Cancelled"); return }
  }

  await safeAutoBackup()

  try {
    restoreDb(selected)
    const subs = getSubscriptions()
    logAudit("backup.restore", {
      details: `Restored ${subs.length} subscriptions from ${path.basename(selected)}`,
    })
    consola.success(
      `Restored ${subs.length} subscription${subs.length !== 1 ? "s" : ""} from: ${selected}`,
    )
  } catch (e) {
    consola.error(`Restore failed: ${String(e)}`)
  }
}
