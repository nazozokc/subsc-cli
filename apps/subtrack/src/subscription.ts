/**
 * Subscription command handlers barrel.
 * Re-exports from subscription/core.ts, subscription/add.ts, subscription/edit.ts.
 * This file preserves backward compatibility for consumers importing from "./subscription.ts".
 */

export {
  handleList,
  handleDelete,
  handleTags,
  handleClone,
  handleArchive,
  handleUnarchive,
} from "./subscription/core.ts"

export { handleAdd, resolveAddOptions } from "./subscription/add.ts"

export { handleEdit } from "./subscription/edit.ts"
