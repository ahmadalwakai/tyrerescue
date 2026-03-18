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
  full: 9999,
} as const;
