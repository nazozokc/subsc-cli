/**
 * Test utilities — creates and manages a native Database instance
 * for use in vitest test files.
 */

import { createRequire } from "node:module"
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
const { Database: NativeDatabase } = require("../../index.cjs")

let _dbDir = ""
let _db: any = null

/**
 * Create a new native Database in a temp directory.
 * Returns the Database instance.
 */
export function createTestDb(): any {
  _dbDir = mkdtempSync(join(tmpdir(), "subtrack-test-"))
  _db = new NativeDatabase(_dbDir, null)
  return _db
}

/**
 * Destroy the current test database (clean up temp directory).
 */
export function destroyTestDb(): void {
  _db = null
  if (_dbDir && existsSync(_dbDir)) {
    rmSync(_dbDir, { recursive: true, force: true })
  }
  _dbDir = ""
}

/**
 * Reset the test database — destroys current and creates a new one.
 * Returns the new Database instance.
 */
export function resetTestDb(): any {
  destroyTestDb()
  return createTestDb()
}

/**
* Get the current test database directory path.
*/
export function getTestDbDir(): string {
  return _dbDir
}

/**
* Get the current test Database instance (for execSql, etc.).
*/
export function getTestDb(): any {
  return _db
}
