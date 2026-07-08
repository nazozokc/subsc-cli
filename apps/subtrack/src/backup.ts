import { consola } from "consola"
import { mkdirSync, existsSync, statSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import type { BackupFileInfo } from "./types.ts"
import { resolveSafePath, resolveSafeOutputPath } from "./path-utils.ts"
import {
  getSubscriptions,
  getDbPath,
  getDefaultBackupDir,
  getBackupFiles,
  restoreDb,
  backupDb,
  saveDb,
  verifyBackupHash,
} from "./db.ts"
import { input, confirm, select } from "@inquirer/prompts"

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

/**
 * Create a timestamped, gzip-compressed backup of the SQLite database.
 * Delegates to native backupDb which handles compression and encryption.
 * @param destination - Directory to write the backup into (default: `~/.config/subtrack/backups/`)
 * @param options.encrypt - Encrypt the backup with the database encryption key
 */
export async function handleBackup(destination?: string, options: { encrypt?: boolean } = {}) {
  saveDb()

  let dest = destination ?? getDefaultBackupDir()
  try {
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

  try {
    const resultPath = backupDb(dest, options.encrypt ?? false)
    consola.success(`Backup created: ${resultPath}${options.encrypt ? " (encrypted)" : ""}`)
  } catch (err) {
    consola.error(`Backup failed: ${String(err)}`)
  }
}

async function safeAutoBackup(): Promise<string | undefined> {
  saveDb()
  const backupDir = getDefaultBackupDir()
  mkdirSync(backupDir, { recursive: true, mode: 0o700 })

  try {
    return backupDb(backupDir, false)
  } catch {
    consola.warn("Could not create auto-backup, continuing with restore")
    return undefined
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
      consola.success(
        `Restored ${subs.length} subscription${subs.length !== 1 ? "s" : ""} from: ${path.basename(resolvedPath)}`,
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
    consola.success(
      `Restored ${subs.length} subscription${subs.length !== 1 ? "s" : ""} from: ${selected}`,
    )
  } catch (e) {
    consola.error(`Restore failed: ${String(e)}`)
  }
}
