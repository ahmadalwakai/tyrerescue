// Dark admin operator palette mirroring `lib/design-tokens.ts` (Tyre Rescue
// admin web). No emojis, no icons — visual hierarchy via type, spacing, and
// borders only. Pressed/disabled/loading states keep readable colours; nothing
// flashes white on press.
export const colors = {
  // Page bg + inner SectionCard bg — near-black. Sub-cards sit "below" the
  // outer surface card visually (matches the web SectionCard which uses c.bg).
  bg: '#09090B',
  // Outer wrap card / suggestion lists.
  surface: '#18181B',
  // Inputs, inactive pill bg, quantity box.
  card: '#27272A',
  inputBg: '#27272A',
  inputDisabledBg: '#1F1F23',
  border: '#3F3F46',
  borderStrong: '#52525B',
  text: '#FAFAFA',
  muted: '#A1A1AA',
  subtle: '#71717A',
  // Brand accent (orange) — matches admin web `c.accent`.
  accent: '#F97316',
  accentHover: '#EA580C',
  accentText: '#09090B', // dark text on orange — readable while pressed.
  // Dark-ground status tints — never browser-yellow / browser-red.
  danger: '#FCA5A5',
  dangerBg: '#3B0F12',
  dangerBorder: '#7F1D1D',
  success: '#86EFAC',
  successBg: '#0E2A18',
  successBorder: '#166534',
  warning: '#FCD34D',
  warningBg: '#2A1E07',
  warningBorder: '#92400E',
  info: '#93C5FD',
  infoBg: '#0F1B2E',
  infoBorder: '#1E40AF',
  ripple: '#3F3F46',
};

export const radius = { sm: 6, md: 8, lg: 10 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
};
