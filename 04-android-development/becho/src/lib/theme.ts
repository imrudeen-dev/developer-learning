export const BECHO_COLORS = {
  bg: '#0B1120',
  surface: '#111827',
  surfaceElevated: '#1E293B',
  border: '#1F2937',
  primary: '#22C55E',      // Brand accent (emerald green)
  primaryMuted: '#14532D',
  sellBadge: '#F59E0B',    // Amber for Buy/Sell listings
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  danger: '#EF4444',
} as const;

export type ListingType = 'SELL';