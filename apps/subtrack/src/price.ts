/**
 * Format a price for display.
 *
 * Currently prices are stored as major units (e.g. 14.99 USD → "$14.99").
 * This function formats consistently across CLI and TUI surfaces.
 * When migrating to smallest-unit storage (cents), add a `fromCents` parameter.
 */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price)
  } catch {
    return `${currency} ${price}`
  }
}
