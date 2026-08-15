// ── Barrel: re-exports all command definitions and builds the subCommands map ──

import {
  listCommand, addCommand, editCommand, deleteCommand,
  cloneCommand, archiveCommand, unarchiveCommand, searchCommand,
} from "./core.ts"
import { tagsCommand, tagCommand } from "./tag.ts"
import { trialCommand } from "./trial.ts"
import { bulkCommand } from "./bulk.ts"
import { exportCommand, importCommand } from "./io.ts"
import { backupCommand, restoreCommand } from "./backup.ts"
import { configCommand } from "./config.ts"
import { usageCommand } from "./usage.ts"
import {
  summaryCommand, paymentCommand, upcomingCommand,
  analyticsCommand, compareCommand, calendarCommand,
  forecastCommand, historyCommand, notifyCommand,
  timelineCommand, optimizeCommand, statsCommand,
} from "./report.ts"
import {
  mcpCommand, profileCommand,
  auditCommand, auditListCmd, auditPruneCmd,
  maintenanceCommand, cleanupCommand, currencyCommand,
} from "./misc.ts"
import { suggestCommand } from "./suggest.ts"

export {
  listCommand, addCommand, editCommand, deleteCommand,
  cloneCommand, archiveCommand, unarchiveCommand, searchCommand,
  tagsCommand, tagCommand,
  trialCommand,
  bulkCommand,
  exportCommand, importCommand,
  backupCommand, restoreCommand,
  configCommand,
  usageCommand,
  summaryCommand, paymentCommand, upcomingCommand,
  analyticsCommand, compareCommand, calendarCommand,
  forecastCommand, historyCommand, notifyCommand,
  timelineCommand, optimizeCommand, statsCommand,
  mcpCommand, profileCommand,
  auditCommand, auditListCmd, auditPruneCmd,
  maintenanceCommand, cleanupCommand, currencyCommand,
  suggestCommand,
}

/** The flat sub-commands map for the main CLI */
export const subCommands = {
  list: listCommand,
  add: addCommand,
  edit: editCommand,
  delete: deleteCommand,
  clone: cloneCommand,
  archive: archiveCommand,
  unarchive: unarchiveCommand,
  tags: tagsCommand,
  tag: tagCommand,
  search: searchCommand,
  trial: trialCommand,
  bulk: bulkCommand,
  forecast: forecastCommand,
  export: exportCommand,
  import: importCommand,
  summary: summaryCommand,
  backup: backupCommand,
  restore: restoreCommand,
  payment: paymentCommand,
  upcoming: upcomingCommand,
  calendar: calendarCommand,
  history: historyCommand,
  notify: notifyCommand,
  profile: profileCommand,
  optimize: optimizeCommand,
  timeline: timelineCommand,
  audit: auditCommand,
  maintenance: maintenanceCommand,
  cleanup: cleanupCommand,
  stats: statsCommand,
  currency: currencyCommand,
  mcp: mcpCommand,
  analytics: analyticsCommand,
  compare: compareCommand,
  config: configCommand,
  usage: usageCommand,
  suggest: suggestCommand,
}
