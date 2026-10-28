export const colors = {
  bg: '#0A0C10',
  surface: '#12161C',
  card: '#161B22',
  surfaceRaised: '#1E242D',
  border: '#262D37',
  borderStrong: '#3A4350',
  accent: '#F97316',
  accentHover: '#EA580C',
  accentSoft: 'rgba(249,115,22,0.12)',
  accentBorder: 'rgba(249,115,22,0.45)',
  onAccent: '#1A0D04',
  text: '#F5F7FA',
  muted: '#AAB3BF',
  subtle: '#7E8896',
  danger: '#F87171',
  dangerSoft: 'rgba(239,68,68,0.1)',
  dangerBorder: 'rgba(239,68,68,0.35)',
  dangerButton: '#B91C1C',
  success: '#22C55E',
  successSoft: 'rgba(34,197,94,0.1)',
  successBorder: 'rgba(34,197,94,0.35)',
  warning: '#F59E0B',
  input: '#0F1318',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const spacing = {
  page: 20,
  gap: 12,
  card: 16,
  section: 24,
} as const;

export const typography = {
  display: 'BebasNeue_400Regular',
  brand: 'BebasNeue_400Regular',
  heading: 'Inter_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',
} as const;

export const typeScale = {
  title: 28,
  titleLine: 34,
  section: 17,
  sectionLine: 24,
  body: 16,
  bodyLine: 24,
  label: 14,
  labelLine: 20,
  caption: 13,
  captionLine: 18,
} as const;
