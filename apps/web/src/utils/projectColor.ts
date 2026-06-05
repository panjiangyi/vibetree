// Stable, visually distinct colors used to tag projects across the UI
// (worktree tabs, header). A project's color is derived from its index in
// the project list so it stays consistent within a session without needing
// to persist anything.
const PROJECT_COLOR_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#9333ea', // purple
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
] as const

export function projectColorForIndex(index: number): string {
  const i = ((index % PROJECT_COLOR_PALETTE.length) + PROJECT_COLOR_PALETTE.length) % PROJECT_COLOR_PALETTE.length
  return PROJECT_COLOR_PALETTE[i]
}
