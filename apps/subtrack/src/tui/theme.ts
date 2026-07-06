// ── Design Tokens ─────────────────────────────────────
//
// lazygit-inspired color scheme.
// All TUI components MUST import from here — no raw color strings.

export const colors = {
  // Accent
  primary: "cyan" as const,
  primaryDim: "#2d5f6e" as const,   // selection background

  // Foreground
  text: "white" as const,
  textDim: "gray" as const,
  textBold: "white" as const,

  // Semantic status
  success: "green" as const,
  warning: "yellow" as const,
  danger: "red" as const,
  info: "blue" as const,

  // UI chrome
  border: "gray" as const,
  borderFocus: "cyan" as const,
  borderDanger: "red" as const,

  // Selection
  selectedBg: "#2d5f6e" as const,  // same as primaryDim
  selectedFg: "white" as const,

  // Status-specific (for list rows)
  statusActive: "green" as const,
  statusPaused: "yellow" as const,
  statusCancelled: "red" as const,
} as const

export const spacing = {
  paddingX: 1,
  paddingY: 1,
  panelPaddingX: 1,
  panelPaddingY: 1,
  gap: 1,
  sectionGap: 1,
} as const

export const sidebar = {
  width: 24,
} as const

/** All screens use "round" borders for consistency */
export const borderStyle = "round" as const

// ── Color helpers ─────────────────────────────────────

export function statusColor(
  status: string,
): string {
  switch (status) {
    case "active":
      return colors.statusActive
    case "paused":
      return colors.statusPaused
    case "cancelled":
      return colors.statusCancelled
    default:
      return colors.text
  }
}

export function statusLabel(
  status: string,
): string {
  switch (status) {
    case "active":
      return "● active"
    case "paused":
      return "◐ paused"
    case "cancelled":
      return "○ cancelled"
    default:
      return status
  }
}
