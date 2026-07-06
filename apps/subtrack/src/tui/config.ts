/**
 * TUI-specific configuration (column visibility, etc).
 * Persisted to the same config.json as CLI settings (under the `tui` key).
 */
import { loadConfig, saveConfig } from "../config.ts"

export type TuiColumnSettings = {
  showTagsCol: boolean
  showNotesCol: boolean
  showMethodCol: boolean
}

export function loadTuiColumns(): TuiColumnSettings {
  const config = loadConfig()
  return {
    showTagsCol: config.tui?.showTagsCol ?? false,
    showNotesCol: config.tui?.showNotesCol ?? false,
    showMethodCol: config.tui?.showMethodCol ?? false,
  }
}

export function saveTuiColumns(settings: TuiColumnSettings): void {
  const config = loadConfig()
  config.tui = {
    showTagsCol: settings.showTagsCol,
    showNotesCol: settings.showNotesCol,
    showMethodCol: settings.showMethodCol,
  }
  saveConfig(config)
}
