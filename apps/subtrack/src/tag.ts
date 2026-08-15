import { consola } from "consola"
import { fail } from "./error.ts"
import { getTagsWithCount, renameTag, deleteTag, pruneTags, mergeTag } from "./db.ts"
import { logAudit } from "./audit.ts"

export function handleTagList() {
  const tags = getTagsWithCount()
  if (tags.length === 0) {
    consola.info("No tags found")
    return
  }
  const maxNameLen = Math.max(...tags.map((t) => t.name.length), 4)
  consola.log(`${"Name".padEnd(maxNameLen)}  Subscriptions`)
  consola.log("─".repeat(maxNameLen + 14))
  for (const t of tags) {
    consola.log(`${t.name.padEnd(maxNameLen)}  ${t.count}`)
  }
}

export function handleTagRename(oldName: string, newName: string) {
  if (!oldName || !newName) {
    fail("Usage: subtrack tag rename <old> <new>")
    return
  }
  try {
    if (renameTag(oldName, newName)) {
      logAudit("tag.rename", { details: `"${oldName}" → "${newName}"` })
      consola.success(`Renamed tag: "${oldName}" → "${newName}"`)
    } else {
      fail(`Tag "${oldName}" not found`)
    }
  } catch (e) {
    fail(`Failed to rename tag: ${String(e)}`)
  }
}

export function handleTagDelete(name: string) {
  if (!name) {
    fail("Usage: subtrack tag delete <name>")
    return
  }
  if (deleteTag(name)) {
    logAudit("tag.delete", { details: `"${name}"` })
    consola.success(`Deleted tag: "${name}"`)
  } else {
    fail(`Tag "${name}" not found`)
  }
}

export function handleTagMerge(source: string, target: string) {
  if (!source || !target) {
    fail("Usage: subtrack tag merge <source> <target>")
    return
  }
  try {
    if (mergeTag(source, target)) {
      logAudit("tag.merge", { details: `"${source}" → "${target}"` })
      consola.success(`Merged tag: "${source}" → "${target}"`)
    } else {
      fail(`Tag "${source}" not found`)
    }
  } catch (e) {
    fail(`Failed to merge tag: ${String(e)}`)
  }
}

export function handleTagPrune() {
  const count = pruneTags()
  if (count > 0) {
    logAudit("tag.prune", { details: `${count} orphaned tags removed` })
    consola.success(`Removed ${count} orphaned tag${count > 1 ? "s" : ""}`)
  } else {
    consola.info("No orphaned tags found")
  }
}
