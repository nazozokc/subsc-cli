/**
 * MCP tool definitions for the ListToolsRequestSchema handler.
 * Each entry describes the tool name, description, and input schema.
 */

import type { Tool } from "./types.ts"

export const TOOLS: Tool[] = [
  {
    name: "list_subscriptions",
    description: "List all subscriptions",
    inputSchema: {
      type: "object",
      properties: {
        sort: { type: "string", description: "Sort field: name, price, currency, cycle, status" },
        desc: { type: "boolean", description: "Sort descending" },
      },
    },
  },
  {
    name: "get_subscription",
    description: "Get subscription by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Subscription ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_subscriptions",
    description: "Search subscriptions by name, notes, or tags",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        names: { type: "boolean", description: "Search in names" },
        notes: { type: "boolean", description: "Search in notes" },
        tags: { type: "boolean", description: "Search in tags" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_subscription",
    description: "Add a new subscription",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Subscription name" },
        price: { type: "number", description: "Price in smallest currency unit" },
        currency: { type: "string", description: "Currency code (e.g. USD, JPY)" },
        cycle: { type: "string", description: "Billing cycle: weekly, bi-weekly, monthly, quarterly, semi-annual, yearly" },
        tags: { type: "string", description: "Comma-separated tags" },
        billingDay: { type: "number", description: "Billing day of month (1-31)" },
        status: { type: "string", description: "Status: active, paused, cancelled" },
        paymentMethod: { type: "string", description: "Payment method" },
        notes: { type: "string", description: "Notes" },
      },
      required: ["name", "price", "currency", "cycle"],
    },
  },
  {
    name: "delete_subscription",
    description: "Delete subscription by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Subscription ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_summary",
    description: "Get subscription summary statistics",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_upcoming",
    description: "Get upcoming bills within a number of days",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days (default: 7)" },
      },
    },
  },
  {
    name: "get_calendar",
    description: "Get calendar entries for a month",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "number", description: "Month (1-12)" },
        year: { type: "number", description: "Year" },
      },
    },
  },
  {
    name: "export_data",
    description: "Export subscriptions in a format",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Export format: csv, json, md" },
      },
      required: ["format"],
    },
  },
  {
    name: "edit_subscription",
    description: "Edit an existing subscription",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Subscription ID to edit" },
        name: { type: "string", description: "New name" },
        price: { type: "number", description: "New price in smallest currency unit" },
        currency: { type: "string", description: "New currency code" },
        cycle: { type: "string", description: "New billing cycle" },
        status: { type: "string", description: "New status: active, paused, cancelled" },
        billingDay: { type: "number", description: "New billing day of month (1-31)" },
        tags: { type: "string", description: "Comma-separated tags (replaces all)" },
        paymentMethod: { type: "string", description: "New payment method" },
        notes: { type: "string", description: "New notes" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_history",
    description: "Get price change history for subscriptions",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Filter by subscription ID" },
        days: { type: "number", description: "Recent days to include (default: all)" },
      },
    },
  },
  {
    name: "get_analytics",
    description: "Get subscription analytics and statistics",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_forecast",
    description: "Get spending forecast for upcoming months",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "number", description: "Number of months to forecast (default: 12)" },
        currency: { type: "string", description: "Convert all to target currency" },
        cancel: { type: "string", description: "Comma-separated subscription names to exclude from forecast" },
      },
    },
  },
  {
    name: "compare",
    description: "Compare subscription spending between current and previous period",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Period to compare: monthly (default), yearly, quarterly" },
        currency: { type: "string", description: "Convert all to target currency" },
      },
    },
  },
  {
    name: "bulk_operations",
    description: "Perform bulk operations on subscriptions matching filters",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: status, delete, tag_add, tag_remove" },
        status: { type: "string", description: "Target status for 'status' action: active, paused, cancelled" },
        tag_name: { type: "string", description: "Tag name for tag_add / tag_remove actions" },
        filter_tag: { type: "string", description: "Only affect subscriptions with this tag" },
        filter_status: { type: "string", description: "Only affect subscriptions with this status" },
        filter_name: { type: "string", description: "Only affect subscriptions whose name contains this" },
      },
      required: ["action"],
    },
  },
  {
    name: "get_trials",
    description: "Get trial periods",
    inputSchema: {
      type: "object",
      properties: {
        expiring_soon: { type: "number", description: "Filter trials expiring within N days" },
      },
    },
  },
]
