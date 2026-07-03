import { consola } from "consola"
import { select, input, confirm } from "@inquirer/prompts"
import { getTagsWithCount, renameTag, deleteTag, pruneTags } from "./db.ts"
import type { TagListFlags } from "./types.ts"

export function handleTagList(options: TagListFlags = {}) {
  let tags = getTagsWithCount()
  if (tags.length === 0) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ tags: [] }, null, 2) + "\n")
      return
    }
    consola.info("No tags found")
    return
  }

  // Sort
  if (options.sort === "count") {
    tags = [...tags].sort((a, b) => b.count - a.count)
  } else {
    tags = [...tags].sort((a, b) => a.name.localeCompare(b.name))
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ tags }, null, 2) + "\n")
    return
  }

  const maxNameLen = Math.max(...tags.map((t) => t.name.length), 4)
  consola.log(`${"Name".padEnd(maxNameLen)}  Subscriptions`)
  consola.log("─".repeat(maxNameLen + 14))
  for (const t of tags) {
    consola.log(`${t.name.padEnd(maxNameLen)}  ${t.count}`)
  }
}

export async function handleTagRename(oldName?: string, newName?: string) {
  // If explicitly provided empty, show usage (backward compat with tests)
  if (oldName === "" && newName === "") {
    consola.error("Usage: subtrack tag rename <old> <new>")
    return
  }
  if (!oldName || !newName) {
    // Interactive mode
    const tags = getTagsWithCount()
    if (tags.length === 0) {
      consola.info("No tags found")
      return
    }
    if (!oldName) {
      oldName = await select({
        message: "Select tag to rename:",
        choices: tags.map((t) => ({ name: `${t.name} (${t.count} sub${t.count !== 1 ? "s" : ""})`, value: t.name })),
      })
    }
    if (!newName) {
      newName = await input({
        message: `New name for "${oldName}":`,
        validate: (v: string) => v.trim().length > 0 ? true : "Name cannot be empty",
      })
    }
  }
  try {
    if (renameTag(oldName, newName)) {
      consola.success(`Renamed tag: "${oldName}" → "${newName}"`)
    } else {
      consola.error(`Tag "${oldName}" not found`)
    }
  } catch (e) {
    consola.error(`Failed to rename tag: ${String(e)}`)
  }
}

export async function handleTagDelete(name?: string) {
  // If explicitly provided empty, show usage (backward compat with tests)
  if (name === "") {
    consola.error("Usage: subtrack tag delete <name>")
    return
  }
  if (!name) {
    // Interactive mode
    const tags = getTagsWithCount()
    if (tags.length === 0) {
      consola.info("No tags found")
      return
    }
    name = await select({
      message: "Select tag to delete:",
      choices: tags.map((t) => ({ name: `${t.name} (${t.count} sub${t.count !== 1 ? "s" : ""})`, value: t.name })),
    })
    const ok = await confirm({ message: `Delete tag "${name}"?`, default: false })
    if (!ok) {
      consola.info("Cancelled")
      return
    }
  }
  if (deleteTag(name)) {
    consola.success(`Deleted tag: "${name}"`)
  } else {
    consola.error(`Tag "${name}" not found`)
  }
}

export function handleTagPrune() {
  const count = pruneTags()
  if (count > 0) {
    consola.success(`Removed ${count} orphaned tag${count > 1 ? "s" : ""}`)
  } else {
    consola.info("No orphaned tags found")
  }
}
