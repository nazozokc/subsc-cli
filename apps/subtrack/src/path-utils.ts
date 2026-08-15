import { resolve, normalize, isAbsolute, dirname, sep } from "node:path"
import { realpathSync, existsSync } from "node:fs"

/** Check if `child` path starts with `parent` directory, using platform separator. */
function isWithin(child: string, parent: string): boolean {
  const prefix = parent.endsWith(sep) ? parent : `${parent}${sep}`
  return child.startsWith(prefix)
}

/**
 * Resolve a base directory through symlinks (if it exists), falling back
 * to normalized form. This ensures macOS /tmp → /private/tmp mapping is
 * handled correctly.
 */
function resolveBase(basePath: string): string {
  try {
    return realpathSync(basePath)
  } catch {
    return normalize(basePath)
  }
}

/**
 * Check that a user-provided path resolves safely within one of the allowed base directories.
 * Prevents path traversal attacks using `..` or symlinks.
 *
 * @param basePaths - Trusted base directories (must be absolute).
 * @param userPath  - The user-provided path to validate. Must exist on the filesystem.
 * @returns The resolved absolute path if safe, or null if the path attempts escape
 *          or does not exist.
 */
export function resolveSafePath(basePaths: string[], userPath: string): string | null {
  for (const basePath of basePaths) {
    if (!isAbsolute(basePath)) continue

    let resolved: string
    try {
      resolved = realpathSync(userPath)
    } catch {
      continue
    }

    const base = resolveBase(basePath)

    // Must be within the base directory
    if (!isWithin(resolved, base)) {
      continue
    }

    return resolved
  }

  return null
}

/**
 * Validate that a file path (which may not exist yet) resolves within one of the
 * allowed base directories. For non-existent paths, traverses up to the nearest
 * existing parent to check symlink safety.
 *
 * @param basePaths - Trusted base directories (must be absolute).
 * @param targetPath - The user-provided path to validate (file or directory).
 * @returns The resolved absolute path if safe, or null if the path escapes all bases.
 */
export function resolveSafeOutputPath(basePaths: string[], targetPath: string): string | null {
  const absolute = resolve(targetPath)

  for (const basePath of basePaths) {
    if (!isAbsolute(basePath)) continue

    const base = resolveBase(basePath)

    // Walk up from the target to find an existing parent for realpath check
    let checkPath = absolute
    while (checkPath && !existsSync(checkPath)) {
      const parent = dirname(checkPath)
      if (parent === checkPath) break // reached filesystem root
      checkPath = parent
    }

    if (!existsSync(checkPath)) {
      // Nothing in the path exists — check the normalized path syntactically
      if (isWithin(absolute, base) || absolute === base) {
        return absolute
      }
      continue
    }

    // Resolve symlinks from the existing portion
    try {
      const resolved = realpathSync(checkPath)
      if (!isWithin(resolved, base)) {
        continue
      }
      // Reconstruct the full path from the resolved base + remaining components
      const remaining = absolute.slice(checkPath.length)
      return remaining ? resolved + remaining : resolved
    } catch {
      continue
    }
  }

  return null
}
