import { consola } from "consola"
import { loadConfig, saveConfig } from "./config.ts"
import { fail } from "./error.ts"
import { logAudit } from "./audit.ts"
import { writeSubscription } from "./db.ts"
import type { AddSharedArgs, SubscriptionTemplate } from "./types.ts"

/** Manage configuration-backed subscription templates. */
export function handleTemplate(action: "list" | "add" | "edit" | "delete" | "use", name?: string, flags: Partial<SubscriptionTemplate> = {}): void {
  const config = loadConfig()
  const templates = config.templates ?? {}
  if (action === "list") { if (!Object.keys(templates).length) consola.info("No templates found"); else for (const [key, template] of Object.entries(templates)) consola.log(`${key}: ${template.price} ${template.currency}/${template.cycle}`); return }
  if (!name) { fail("Template name is required"); return }
  if (action === "delete") { if (!templates[name]) { fail(`Template not found: ${name}`); return }; delete templates[name]; persist(config, templates); logAudit("template.delete", { details: name }); consola.success(`Deleted template: ${name}`); return }
  if (action === "use") { const template = templates[name]; if (!template) { fail(`Template not found: ${name}`); return }; writeSubscription({ ...template, ...flags, name: String(flags.name ?? template.name), price: Number(flags.price ?? template.price), currency: String(flags.currency ?? template.currency), cycle: (flags.cycle ?? template.cycle) as AddSharedArgs["cycle"], tags: flags.tags ?? template.tags }); logAudit("template.use", { details: name }); consola.success(`Added subscription from template: ${name}`); return }
  if (action === "add" && templates[name]) { fail(`Template already exists: ${name}`); return }
  const old = templates[name]
  const template = { ...old, ...flags, name, price: Number(flags.price ?? old?.price ?? 0), currency: String(flags.currency ?? old?.currency ?? "USD"), cycle: (flags.cycle ?? old?.cycle ?? "monthly") as AddSharedArgs["cycle"], tags: flags.tags ?? old?.tags ?? [] } as SubscriptionTemplate
  if (template.price <= 0) { fail("Template price must be positive"); return }
  templates[name] = template
  persist(config, templates)
  logAudit(action === "add" ? "template.add" : "template.edit", { details: name })
  consola.success(`${action === "add" ? "Added" : "Updated"} template: ${name}`)
}

function persist(config: ReturnType<typeof loadConfig>, templates: Record<string, SubscriptionTemplate>): void { config.templates = templates; saveConfig(config) }
