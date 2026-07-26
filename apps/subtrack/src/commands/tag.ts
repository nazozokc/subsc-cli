// ── Tag commands ───────────────────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleTags } from "../subscription.ts"
import { handleTagList, handleTagRename, handleTagDelete, handleTagPrune, handleTagMerge } from "../tag.ts"

export const tagsCommand = define({
  name: "tags",
  description: "Filter subscriptions by tags (AND logic)",
  args: {
    names: { type: "positional", array: true, description: "Tag names", required: false },
  },
  run: (ctx) => {
    const tagNames = (ctx.values.names as string[] | undefined) ?? []
    if (tagNames.length === 0) {
      consola.error("Please specify at least one tag")
      return
    }
    handleTags(tagNames)
  },
})

const tagListCmd = define({
  name: "list",
  description: "List all tags with usage count",
  run: () => handleTagList(),
})

const tagRenameCmd = define({
  name: "rename",
  description: "Rename a tag",
  args: {
    old: { type: "positional", description: "Current tag name" },
    new: { type: "positional", description: "New tag name" },
  },
  run: (ctx) => handleTagRename(ctx.values.old, ctx.values["new"]),
})

const tagDeleteCmd = define({
  name: "delete",
  description: "Delete a tag and its associations",
  args: {
    name: { type: "positional", description: "Tag name to delete" },
  },
  run: (ctx) => handleTagDelete(ctx.values.name),
})

const tagPruneCmd = define({
  name: "prune",
  description: "Remove orphaned tags",
  run: () => handleTagPrune(),
})

const tagMergeCmd = define({
  name: "merge",
  description: "Merge source tag into target tag",
  args: {
    source: { type: "positional", description: "Source tag name to merge from" },
    target: { type: "positional", description: "Target tag name to merge into" },
  },
  run: (ctx) => handleTagMerge(ctx.values.source, ctx.values.target),
})

export const tagCommand = define({
  name: "tag",
  description: "Manage tags",
  subCommands: {
    list: tagListCmd,
    rename: tagRenameCmd,
    delete: tagDeleteCmd,
    prune: tagPruneCmd,
    merge: tagMergeCmd,
  },
  run: () => consola.info("Usage: subtrack tag list|rename|delete|prune|merge"),
})
