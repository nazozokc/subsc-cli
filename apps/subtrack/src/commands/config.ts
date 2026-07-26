// ── Config commands ───────────────────────────────────
import { define } from "gunshi"
import { consola } from "consola"
import { handleConfigList, handleConfigGet, handleConfigSet, handleConfigReset } from "../config.ts"

const configListCmd = define({
  name: "list",
  description: "List all config values",
  run: () => handleConfigList(),
})

const configGetCmd = define({
  name: "get",
  description: "Get a config value",
  args: { key: { type: "positional", description: "Config key" } },
  run: (ctx) => handleConfigGet(ctx.values.key),
})

const configSetCmd = define({
  name: "set",
  description: "Set a config value",
  args: {
    key: { type: "positional", description: "Config key" },
    value: { type: "positional", description: "Config value" },
  },
  run: (ctx) => handleConfigSet(ctx.values.key, ctx.values.value),
})

const configResetCmd = define({
  name: "reset",
  description: "Reset config to defaults",
  run: () => handleConfigReset(),
})

export const configCommand = define({
  name: "config",
  description: "Manage configuration",
  subCommands: {
    list: configListCmd,
    get: configGetCmd,
    set: configSetCmd,
    reset: configResetCmd,
  },
  run: () => consola.info("Usage: subtrack config list|get|set|reset"),
})
