/** Brand colors mirrored from web lib/design-tokens.ts */
export const colors = {
  bg: '#09090B',
  surface: '#18181B',
  card: '#27272A',
  border: '#3F3F46',
  accent: '#F97316',
  accentHover: '#EA580C',
  text: '#FAFAFA',
  muted: '#A1A1AA',
  success: '#22C55E',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
  white: '#FFFFFF',
} as const;

/** 8pt spacing grid */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
} as const;

/** Status-specific color mapping for badges and indicators */
export const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#3F3F46', text: '#A1A1AA', label: 'Draft' },
  pricing_ready: { bg: '#3F3F46', text: '#A1A1AA', label: 'Pricing Ready' },
  awaiting_payment: { bg: '#78350F', text: '#FDE68A', label: 'Awaiting Payment' },
  paid: { bg: '#1E3A5F', text: '#93C5FD', label: 'Paid' },
  payment_failed: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Payment Failed' },
  driver_assigned: { bg: '#1E3A5F', text: '#93C5FD', label: 'Assigned' },
  en_route: { bg: '#7C2D12', text: '#FDBA74', label: 'En Route' },
  arrived: { bg: '#2E1065', text: '#C4B5FD', label: 'Arrived' },
  in_progress: { bg: '#7C2D12', text: '#F97316', label: 'In Progress' },
  completed: { bg: '#14532D', text: '#86EFAC', label: 'Completed' },
  cancelled: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Cancelled' },
  cancelled_refund_pending: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Refund Pending' },
  refunded: { bg: '#3F3F46', text: '#A1A1AA', label: 'Refunded' },
  refunded_partial: { bg: '#3F3F46', text: '#A1A1AA', label: 'Partial Refund' },
};

/** Reusable card shadow (Android elevation + iOS shadow) */
export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 3,
} as const;
