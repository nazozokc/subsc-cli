import { consola } from "consola"
import { calcUpcoming } from "./upcoming.ts"
import { formatPrice } from "./price.ts"
import { loadConfig } from "./config.ts"
import type { Currency, NotifyChannel } from "./types.ts"

export type NotifyOptions = {
  days?: number
  dryRun?: boolean
  json?: boolean
  channel?: NotifyChannel
}

export async function handleNotify(options: NotifyOptions = {}): Promise<void> {
  const config = loadConfig()
  const days = options.days ?? config.notifyDays ?? 7

  const entries = calcUpcoming(days)

  if (options.json) {
    const data = entries.map((e) => ({
      name: e.sub.name,
      price: e.sub.price,
      currency: e.sub.currency,
      cycle: e.sub.cycle,
      nextDate: `${e.nextDate.getFullYear()}-${String(e.nextDate.getMonth() + 1).padStart(2, "0")}-${String(e.nextDate.getDate()).padStart(2, "0")}`,
      tags: e.sub.tags,
    }))
    process.stdout.write(JSON.stringify({ days, count: entries.length, entries: data }, null, 2) + "\n")
    return
  }

  if (entries.length === 0) {
    if (!options.dryRun) return // no notification needed
    consola.info(`No upcoming bills in the next ${days} day${days > 1 ? "s" : ""}`)
    return
  }

  if (options.dryRun) {
    consola.info(`Upcoming bills (next ${days} day${days > 1 ? "s" : ""}):`)
    for (const e of entries) {
      const date = `${e.nextDate.getFullYear()}-${String(e.nextDate.getMonth() + 1).padStart(2, "0")}-${String(e.nextDate.getDate()).padStart(2, "0")}`
      consola.log(`  ${date}  ${e.sub.name}  ${formatPrice(e.sub.price, e.sub.currency)}/${e.sub.cycle}`)
    }
    return
  }

  // ── Determine channels ──
  const channels: NotifyChannel[] = options.channel
    ? [options.channel]
    : (config.notifyChannels?.length ? config.notifyChannels : ["os"])

  for (const channel of channels) {
    switch (channel) {
      case "os":
        await sendOsNotification(entries, days)
        break
      case "email":
        await sendEmailNotification(entries, days, config.notifyEmail)
        break
      case "slack":
        await sendSlackNotification(entries, days, config.slackWebhook)
        break
      case "webhook":
        await sendWebhookNotification(entries, days, config.webhookUrl)
        break
    }
  }
}

// ── OS Notification (node-notifier) ─────────────────────

async function sendOsNotification(
  entries: { sub: { name: string; price: number; currency: string; cycle: string } }[],
  days: number,
): Promise<void> {
  const { default: notifier } = await import("node-notifier")

  const count = entries.length
  let message: string

  if (count <= 5) {
    message = entries
      .map((e) => `${e.sub.name}: ${formatPrice(e.sub.price, e.sub.currency)}/${e.sub.cycle}`)
      .join("\n")
  } else {
    const shown = entries.slice(0, 5)
    message =
      shown
        .map((e) => `${e.sub.name}: ${formatPrice(e.sub.price, e.sub.currency)}/${e.sub.cycle}`)
        .join("\n") + `\n... and ${count - 5} more`
  }

  notifier.notify({
    title: `subtrack: ${count} upcoming bill${count > 1 ? "s" : ""} in ${days} day${days > 1 ? "s" : ""}`,
    message,
    sound: true,
    timeout: 10,
  })
}

// ── Email Notification ──────────────────────────────────

async function sendEmailNotification(
  entries: { sub: { name: string; price: number; currency: string; cycle: string; nextDate?: Date } }[],
  days: number,
  emailTo?: string,
): Promise<void> {
  if (!emailTo) {
    consola.warn("Email notification configured but no notifyEmail set. Use: subtrack config set notifyEmail you@example.com")
    return
  }

  const lines = entries.map((e) => {
    const date = e.sub.nextDate
      ? `${e.sub.nextDate.getFullYear()}-${String(e.sub.nextDate.getMonth() + 1).padStart(2, "0")}-${String(e.sub.nextDate.getDate()).padStart(2, "0")}`
      : "upcoming"
    return `${date}  ${e.sub.name}: ${formatPrice(e.sub.price, e.sub.currency)}/${e.sub.cycle}`
  })

  const subject = `subtrack: ${entries.length} upcoming bill${entries.length > 1 ? "s" : ""} in ${days} day${days > 1 ? "s" : ""}`
  const body = lines.join("\n")

  // Use sendmail via child_process (simple approach, works on most Unix systems)
  try {
    const { execSync } = await import("node:child_process")
    const sendmailPath = process.platform === "linux" ? "/usr/sbin/sendmail" : "/usr/bin/sendmail"
    const msg = `From: subtrack <noreply@subtrack>
To: ${emailTo}
Subject: ${subject}
Content-Type: text/plain; charset=utf-8

${body}
`
    execSync(`${sendmailPath} -t`, { input: msg, timeout: 10000 })
    consola.success(`Email notification sent to ${emailTo}`)
  } catch (err) {
    consola.warn(`Failed to send email: ${err instanceof Error ? err.message : String(err)}`)
    consola.info("To send via SMTP instead, set up a local MTA (postfix/msmtp) or use a webhook.")
  }
}

// ── Slack Webhook ───────────────────────────────────────

async function sendSlackNotification(
  entries: { sub: { name: string; price: number; currency: string; cycle: string } }[],
  days: number,
  webhookUrl?: string,
): Promise<void> {
  if (!webhookUrl) {
    consola.warn("Slack notification configured but no slackWebhook set. Use: subtrack config set slackWebhook https://hooks.slack.com/services/...")
    return
  }

  const attachments = entries.map((e) => ({
    color: "#36a64f",
    text: `${e.sub.name}: ${formatPrice(e.sub.price, e.sub.currency)}/${e.sub.cycle}`,
  }))

  try {
    const response = await globalThis.fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `subtrack: *${entries.length} upcoming bill${entries.length > 1 ? "s" : ""}* in ${days} day${days > 1 ? "s" : ""}`,
        attachments,
      }),
    })
    if (response.ok) {
      consola.success("Slack notification sent")
    } else {
      consola.warn(`Slack webhook returned ${response.status}: ${response.statusText}`)
    }
  } catch (err) {
    consola.warn(`Failed to send Slack notification: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Generic Webhook ─────────────────────────────────────

async function sendWebhookNotification(
  entries: { sub: { name: string; price: number; currency: string; cycle: string } }[],
  days: number,
  webhookUrl?: string,
): Promise<void> {
  if (!webhookUrl) {
    consola.warn("Webhook configured but no webhookUrl set. Use: subtrack config set webhookUrl https://example.com/hook")
    return
  }

  const payload = {
    event: "upcoming_bills",
    days,
    count: entries.length,
    entries: entries.map((e) => ({
      name: e.sub.name,
      price: e.sub.price,
      currency: e.sub.currency,
      cycle: e.sub.cycle,
    })),
  }

  try {
    const response = await globalThis.fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (response.ok) {
      consola.success("Webhook notification sent")
    } else {
      consola.warn(`Webhook returned ${response.status}: ${response.statusText}`)
    }
  } catch (err) {
    consola.warn(`Failed to send webhook notification: ${err instanceof Error ? err.message : String(err)}`)
  }
}
