//! Shared type definitions for the napi-rs FFI boundary.
//! All structs with #[napi(object)] are auto-generated as TypeScript interfaces.

use napi_derive::napi;

// ── Subscription ──

#[napi(object)]
#[derive(Clone, Default, serde::Serialize)]
pub struct Subscription {
    pub id: i64,
    pub name: String,
    pub price: i64,
    pub currency: String,
    pub cycle: String,
    pub tags: Vec<String>,
    pub status: String,
    pub billing_day: Option<i64>,
    pub created_at: String,
    pub notes: Option<String>,
    pub payment_method: Option<String>,
    pub contract_start: Option<String>,
    pub contract_end: Option<String>,
    pub auto_renewal: bool,
    pub vendor_name: Option<String>,
    pub vendor_url: Option<String>,
    pub plan_tier: Option<String>,
    pub discount_amount: Option<i64>,
    pub discount_type: Option<String>,
}

#[napi(object)]
pub struct NewSubscriptionInput {
    pub name: String,
    pub price: i64,
    pub currency: String,
    pub cycle: String,
    pub tags: Vec<String>,
    pub status: Option<String>,
    pub billing_day: Option<i64>,
    pub created_at: Option<String>,
    pub notes: Option<String>,
    pub payment_method: Option<String>,
    pub contract_start: Option<String>,
    pub contract_end: Option<String>,
    pub auto_renewal: Option<bool>,
    pub vendor_name: Option<String>,
    pub vendor_url: Option<String>,
    pub plan_tier: Option<String>,
    pub discount_amount: Option<i64>,
    pub discount_type: Option<String>,
}

#[napi(object)]
#[derive(Default)]
pub struct UpdateSubscriptionInput {
    pub name: Option<String>,
    pub price: Option<i64>,
    pub currency: Option<String>,
    pub cycle: Option<String>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub billing_day: Option<i64>,
    pub created_at: Option<String>,
    pub notes: Option<String>,
    pub payment_method: Option<String>,
    pub contract_start: Option<String>,
    pub contract_end: Option<String>,
    pub auto_renewal: Option<bool>,
    pub vendor_name: Option<String>,
    pub vendor_url: Option<String>,
    pub plan_tier: Option<String>,
    pub discount_amount: Option<i64>,
    pub discount_type: Option<String>,
}

#[napi(object)]
#[derive(Default)]
pub struct SubscriptionFilter {
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub active_only: Option<bool>,
    pub search: Option<String>,
    pub currency: Option<String>,
    pub sort: Option<String>,
    pub descending: Option<bool>,
}

// ── Tag ──

#[napi(object)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

// ── Payment ──

#[napi(object)]
pub struct PaymentFilter {
    pub currency: Option<String>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
}

#[napi(object)]
pub struct PaymentSummary {
    pub period: String,
    pub start_date: String,
    pub end_date: String,
    pub total: i64,
    pub currency_breakdown: Vec<CurrencyBreakdown>,
    pub method_breakdown: Vec<MethodBreakdown>,
}

#[napi(object)]
pub struct CurrencyBreakdown {
    pub currency: String,
    pub total: i64,
    pub count: i64,
}

#[napi(object)]
pub struct MethodBreakdown {
    pub method: Option<String>,
    pub total: i64,
    pub count: i64,
}

// ── Forecast ──

#[napi(object)]
pub struct ForecastInput {
    pub months: Option<i64>,
    pub currency: Option<String>,
    pub tags: Option<Vec<String>>,
    pub growth_rate: Option<f64>,
}

#[napi(object)]
pub struct ForecastResult {
    pub months: Vec<ForecastMonth>,
    pub total: f64,
    pub currency: String,
}

#[napi(object)]
pub struct ForecastMonth {
    pub month: String,
    pub amount: f64,
}

// ── Analytics ──

#[napi(object)]
pub struct AnalyticsOptions {
    pub currency: Option<String>,
    pub period: Option<String>,
}

#[napi(object)]
pub struct AnalyticsResult {
    pub total_subscriptions: i64,
    pub active_subscriptions: i64,
    pub monthly_total: f64,
    pub yearly_total: f64,
    pub average_price: f64,
    pub top_categories: Vec<CategoryBreakdown>,
    pub currency: String,
}

#[napi(object)]
pub struct CategoryBreakdown {
    pub category: String,
    pub count: i64,
    pub monthly_total: f64,
}

// ── Compare ──

#[napi(object)]
pub struct CompareInput {
    pub period1: String,
    pub period2: String,
    pub currency: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[napi(object)]
pub struct CompareResult {
    pub period1: PeriodSummary,
    pub period2: PeriodSummary,
    pub difference: f64,
    pub percentage_change: f64,
}

#[napi(object)]
pub struct PeriodSummary {
    pub label: String,
    pub start: String,
    pub end: String,
    pub total: f64,
    pub count: i64,
}

// ── Calendar ──

#[napi(object)]
pub struct CalendarEvent {
    pub date: String,
    pub subscription_id: i64,
    pub name: String,
    pub amount: i64,
    pub currency: String,
    pub status: String,
}

#[napi(object)]
pub struct CalendarData {
    pub year: i64,
    pub month: i64,
    pub events: Vec<CalendarEvent>,
    pub total: i64,
}

// ── Timeline ──

#[napi(object)]
pub struct TimelineEntry {
    pub month: String,
    pub total: f64,
    pub count: i64,
    pub subscriptions: Vec<String>,
}

// ── Upcoming ──

#[napi(object)]
pub struct UpcomingBill {
    pub subscription_id: i64,
    pub name: String,
    pub amount: i64,
    pub currency: String,
    pub due_date: String,
    pub days_until: i64,
}

// ── Optimization ──

#[napi(object)]
pub struct OptimizationSuggestion {
    pub category: String,
    pub message: String,
    pub potential_savings: Option<i64>,
    pub currency: Option<String>,
}

// ── LLM Usage ──

#[napi(object)]
pub struct LlmUsageEntry {
    pub id: i64,
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub date: String,
    pub description: Option<String>,
    pub generation_id: Option<String>,
}

#[napi(object)]
pub struct NewLlmUsageInput {
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub date: String,
    pub description: Option<String>,
    pub generation_id: Option<String>,
}

#[napi(object)]
pub struct UsageFilter {
    pub provider: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub min_cost: Option<f64>,
}

#[napi(object)]
pub struct UsageTotal {
    pub total_cost: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub provider_breakdown: Vec<ProviderBreakdown>,
    pub from: String,
    pub to: String,
}

#[napi(object)]
pub struct ProviderBreakdown {
    pub provider: String,
    pub cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}

// ── Trial ──

#[napi(object)]
pub struct TrialEntry {
    pub id: i64,
    pub name: String,
    pub expires_at: String,
    pub price: Option<i64>,
    pub currency: Option<String>,
    pub cycle: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[napi(object)]
pub struct NewTrialInput {
    pub name: String,
    pub expires_at: String,
    pub price: Option<i64>,
    pub currency: Option<String>,
    pub cycle: Option<String>,
    pub notes: Option<String>,
}

// ── Backup ──

#[napi(object)]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub mtime: f64,
    pub size: i64,
}

// ── Config ──

#[napi(object)]
pub struct AppConfig {
    pub default_currency: Option<String>,
    pub monthly_budget: Option<i64>,
    pub theme: Option<String>,
    pub notify_days: Option<i64>,
    pub profiles: Option<String>, // JSON-encoded profiles
    pub active_profile: Option<String>,
    pub budgets: Option<String>, // JSON-encoded budgets
    pub yearly_budget: Option<i64>,
    pub notify_channels: Option<Vec<String>>,
    pub notify_email: Option<String>,
    pub slack_webhook: Option<String>,
    pub webhook_url: Option<String>,
}

// ── Profile ──

#[napi(object)]
#[derive(Clone)]
pub struct FilterProfile {
    pub name: String,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub payment_method: Option<String>,
}

// ── Export ──

#[napi(object)]
pub struct ExportOptions {
    pub format: String, // "csv" | "json" | "md" | "xlsx" | "ics"
    pub currency: Option<String>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
}

// ── Scanner ──

#[napi(object)]
pub struct ScanResult {
    pub source: String,
    pub entries: Vec<NewLlmUsageInput>,
    pub errors: Vec<String>,
}

// ── Stats ──

#[napi(object)]
pub struct DatabaseStats {
    pub total_subscriptions: i64,
    pub total_tags: i64,
    pub total_usage: i64,
    pub total_trials: i64,
    pub db_size_bytes: i64,
    pub oldest_entry: Option<String>,
    pub newest_entry: Option<String>,
}

// ── Import ──

#[napi(object)]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

// ── Price History ──

#[napi(object)]
pub struct PriceHistoryEntry {
    pub id: i64,
    pub subscription_id: i64,
    pub subscription_name: String,
    pub old_price: Option<i64>,
    pub new_price: i64,
    pub old_currency: Option<String>,
    pub new_currency: String,
    pub changed_at: String,
}

// ── Audit ──

#[napi(object)]
pub struct AuditEntry {
    pub id: i64,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<i64>,
    pub details: Option<String>,
    pub created_at: String,
}

#[napi(object)]
pub struct AuditFilter {
    pub action: Option<String>,
    pub limit: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
}

// ── Bulk ──

#[napi(object)]
#[derive(Default)]
pub struct BulkFilter {
    pub tag: Option<String>,
    pub status: Option<String>,
    pub name: Option<String>,
}

// ── Maintenance ──

#[napi(object)]
pub struct MaintenanceOptions {
    pub vacuum: Option<bool>,
    pub check: Option<bool>,
}

#[napi(object)]
pub struct MaintenanceResult {
    pub integrity_ok: Option<bool>,
    pub integrity_message: Option<String>,
    pub vacuum_ok: Option<bool>,
    pub vacuum_message: Option<String>,
}

// ── Currency ──

#[napi(object)]
pub struct CurrencyInfo {
    pub code: String,
    pub name: String,
    pub symbol: String,
}
