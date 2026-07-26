export type Currency = string

export type Status = "active" | "paused" | "cancelled" | "archived"

export type Cycle =
  | "weekly" | "bi-weekly" | "monthly"
  | "quarterly" | "semi-annual" | "yearly"

export type DiscountType = "percentage" | "fixed" | null

export type SharedArgs = {
  id: number
  name: string
  price: number
  currency: Currency
  cycle: Cycle
  tags: string[]
  status: Status
  billingDay: number | null
  createdAt: string // YYYY-MM-DD
  notes: string | null
  paymentMethod: string | null
  contractStart: string | null // YYYY-MM-DD
  contractEnd: string | null // YYYY-MM-DD
  autoRenewal: boolean
  vendorName: string | null
  vendorUrl: string | null
  planTier: string | null
  discountAmount: number | null
  discountType: DiscountType
}

export type AddSharedArgs = {
  name: string
  price: number
  currency: Currency
  cycle: Cycle
  tags: string[]
  status?: Status
  billingDay?: number | null
  createdAt?: string // YYYY-MM-DD
  notes?: string | null
  paymentMethod?: string | null
  contractStart?: string | null
  contractEnd?: string | null
  autoRenewal?: boolean
  vendorName?: string | null
  vendorUrl?: string | null
  planTier?: string | null
  discountAmount?: number | null
  discountType?: DiscountType
}

export type LlmUsageEntry = {
  id: number
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cost: number // USD cents (float, may include fractional)
  date: string // YYYY-MM-DD
  description: string | null
}

export type AddLlmUsageArgs = Omit<LlmUsageEntry, "id">

export type GetLlmUsageOptions = {
  provider?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
  minCost?: number
}

export type UsageAddFlags = {
  provider?: string
  model?: string
  inputTokens?: string
  outputTokens?: string
  date?: string
  description?: string
  cost?: string
}

export type UsageImportFlags = {
  file?: string
  dryRun?: boolean
}

export type AddLlmUsageFromLogArgs = AddLlmUsageArgs & {
  generation_id: string
}

export type AddFlags = {
  name?: string
  price?: string
  currency?: string
  cycle?: string
  tags?: string
  billingDay?: string
  status?: string
  notes?: string
  paymentMethod?: string
  contractStart?: string
  contractEnd?: string
  autoRenewal?: string
  vendorName?: string
  vendorUrl?: string
  planTier?: string
  discountAmount?: string
  discountType?: string
}

export type UsageRefreshFlags = {
  from?: string
  to?: string
  all?: boolean
}

export type TrialEntry = {
  id: number
  name: string
  expiresAt: string // YYYY-MM-DD
  price: number | null
  currency: string | null
  cycle: string | null
  notes: string | null
  createdAt: string // YYYY-MM-DD
}

export type AddTrialArgs = {
  name: string
  expiresAt: string
  price?: number | null
  currency?: string | null
  cycle?: string | null
  notes?: string | null
}

export type TrialAddFlags = {
  name?: string
  expiresAt?: string
  price?: string
  currency?: string
  cycle?: string
  notes?: string
}

export type BackupFileInfo = {
  name: string
  path: string
  mtime: Date
  size: number
}

export type ListFlags = {
  currency?: string
  sort?: string
  desc?: boolean
  api?: boolean
  notes?: boolean
  method?: boolean
  tags?: string
  showContract?: boolean
  showVendor?: boolean
  json?: boolean
  status?: string
  all?: boolean
  minPrice?: number
  maxPrice?: number
  limit?: number
}

export type TagListFlags = {
  json?: boolean
  sort?: "name" | "count"
}

export type AnalyticsOptions = {
  json?: boolean
  currency?: string
  period?: "monthly" | "yearly"
}

export type CompareOptions = {
  currency?: string
  api?: boolean
  json?: boolean
}

export type ProfileFilter = {
  tags?: string[]
  status?: Status
  paymentMethod?: string
}

export type BudgetEntry = {
  name: string
  amount: number
  currency: string
  categories?: string[] // filter by tags
  period?: "monthly" | "yearly"
}

export type NotifyChannel = "os" | "email" | "slack" | "webhook"

export type ImapConfig = {
  host: string
  port: number
  tls: boolean
  username: string
}

export type SubtrackConfig = {
  defaultCurrency: string
  monthlyBudget: number
  theme: string
  notifyDays: number
  /** ISO datetime of last successful suggestion scan. */
  suggestLastScan?: string
  /** IMAP connection settings for email scanning. */
  imap?: ImapConfig
  /** Saved filter profiles */
  profiles?: Record<string, ProfileFilter>
  /** Currently active profile name */
  activeProfile?: string
  /** TUI-specific settings (not shown in CLI config commands) */
  tui?: {
    showTagsCol?: boolean
    showNotesCol?: boolean
    showMethodCol?: boolean
  }
  /** Multiple named budgets for budget vs actual tracking */
  budgets?: BudgetEntry[]
  /** Yearly budget target (can be separate from monthlyBudget) */
  yearlyBudget?: number
  /** Notification channels (default: ["os"]) */
  notifyChannels?: NotifyChannel[]
  /** Email for notifications via sendmail/smtp */
  notifyEmail?: string
  /** Slack webhook URL */
  slackWebhook?: string
  /** Generic webhook URL for notifications */
  webhookUrl?: string
}
