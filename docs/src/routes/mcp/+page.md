---
title: MCP
description: Integrate subtrack with AI assistants via the Model Context Protocol.
---

subtrack implements an MCP (Model Context Protocol) server that allows AI assistants — such as Claude Desktop, Cursor, and Windsurf — to read and manage your subscriptions directly.

## Starting the server

```bash
subtrack mcp
```

The server runs on stdio (`StdioServerTransport`). It prints JSON-RPC messages over stdout and reads from stdin. This is the standard transport used by all MCP hosts.

## Integration examples

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "subtrack": {
      "command": "subtrack",
      "args": ["mcp"]
    }
  }
}
```

### Cursor

In Cursor settings, add an MCP server:

```
Name: subtrack
Type: command
Command: subtrack mcp
```

### Windsurf

In Windsurf settings, add an MCP server pointing to the same command.

## Available tools

The MCP server exposes 17 tools covering all subscription management operations.

### Subscription CRUD

| Tool | Description |
|------|-------------|
| `list_subscriptions` | List all subscriptions with optional sort |
| `get_subscription` | Get a single subscription by ID |
| `add_subscription` | Add a new subscription |
| `edit_subscription` | Edit an existing subscription |
| `delete_subscription` | Delete a subscription by ID |
| `search_subscriptions` | Search by name, notes, or tags |

### Analytics & Reports

| Tool | Description |
|------|-------------|
| `get_summary` | Subscription summary statistics |
| `get_analytics` | Detailed analytics with budget tracking |
| `get_upcoming` | Upcoming bills within N days |
| `get_calendar` | Calendar entries for a month |
| `get_forecast` | Spending forecast with what-if scenarios |
| `compare` | Compare current vs previous period spending |
| `get_history` | Price change history |

### Data Management

| Tool | Description |
|------|-------------|
| `export_data` | Export as CSV, JSON, or Markdown |
| `bulk_operations` | Bulk status change, delete, or tag operations |
| `get_trials` | Trial periods with optional expiring-soon filter |

### Tool schemas

Each tool accepts a JSON object with the following parameters:

**`list_subscriptions`**
- `sort` (string, optional): Sort field — `name`, `price`, `currency`, `cycle`
- `desc` (boolean, optional): Sort descending

**`get_subscription`**
- `id` (number, required): Subscription ID

**`add_subscription`**
- `name` (string, required): Subscription name
- `price` (number, required): Price in smallest currency unit
- `currency` (string, required): Currency code (e.g. `USD`, `JPY`)
- `cycle` (string, required): Billing cycle — `weekly`, `bi-weekly`, `monthly`, `quarterly`, `semi-annual`, `yearly`
- `tags` (string, optional): Comma-separated tags
- `billingDay` (number, optional): Billing day of month (1–31)
- `status` (string, optional): `active`, `paused`, `cancelled`
- `paymentMethod` (string, optional): Payment method
- `notes` (string, optional): Notes

**`edit_subscription`**
- `id` (number, required): Subscription ID
- All other fields same as `add_subscription` (all optional except `id`)

**`delete_subscription`**
- `id` (number, required): Subscription ID

**`search_subscriptions`**
- `query` (string, required): Search query
- `names` (boolean, optional): Search in names
- `notes` (boolean, optional): Search in notes
- `tags` (boolean, optional): Search in tags

**`get_upcoming`**
- `days` (number, optional): Number of days (default: 7)

**`get_calendar`**
- `month` (number, optional): Month (1–12)
- `year` (number, optional): Year

**`get_forecast`**
- `months` (number, optional): Number of months (default: 12)
- `currency` (string, optional): Convert to target currency
- `cancel` (string, optional): Comma-separated names to exclude

**`compare`**
- `period` (string, optional): `monthly`, `quarterly`, `yearly`
- `currency` (string, optional): Convert to target currency

**`export_data`**
- `format` (string, required): `csv`, `json`, or `md`

**`bulk_operations`**
- `action` (string, required): `status`, `delete`, `tag_add`, `tag_remove`
- `status` (string, optional): Target status for `status` action
- `tag_name` (string, optional): Tag name for tag actions
- `filter_tag` (string, optional): Filter by tag
- `filter_status` (string, optional): Filter by status
- `filter_name` (string, optional): Filter by name pattern

**`get_history`**
- `id` (number, optional): Filter by subscription ID
- `days` (number, optional): Recent days to include

**`get_trials`**
- `expiring_soon` (number, optional): Filter trials expiring within N days

## Example usage

Ask your AI assistant:

> "Add a Netflix subscription for ¥1,980/month, tagged as video and entertainment."

> "Show me my total monthly spending in JPY."

> "What subscriptions are due in the next 7 days?"

> "Find subscriptions with the tag 'music'."

The assistant will use the MCP tools to read and modify your subtrack database.
