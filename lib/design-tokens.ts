export const colorTokens = {
  bg: '#09090B',
  surface: '#18181B',
  card: '#27272A',
  border: '#3F3F46',
  accent: '#F97316',
  accentHover: '#EA580C',
  accentGlow: 'rgba(249, 115, 22, 0.25)',
  text: '#FAFAFA',
  muted: '#A1A1AA',
  input: {
    bg: '#27272A',
    bgFocus: '#2D2D30',
    border: '#3F3F46',
    borderFocus: '#F97316',
    borderError: '#EF4444',
    text: '#FAFAFA',
    placeholder: '#71717A',
    label: '#A1A1AA',
  },
  select: {
    bg: '#27272A',
    border: '#3F3F46',
    borderFocus: '#F97316',
    text: '#FAFAFA',
    option: {
      bg: '#27272A',
      text: '#FAFAFA',
      hover: '#3F3F46',
    },
  },
  dropdown: {
    bg: '#1A1A1B',
    border: '#3F3F46',
    item: '#FAFAFA',
    itemHover: '#27272A',
  },
} as const;

/** Reusable dark-theme form element style props */
export const inputProps = {
  bg: colorTokens.input.bg,
  borderColor: colorTokens.input.border,
  color: colorTokens.input.text,
  _placeholder: { color: colorTokens.input.placeholder },
  _focus: {
    borderColor: colorTokens.input.borderFocus,
    boxShadow: `0 0 0 1px ${colorTokens.input.borderFocus}`,
    bg: colorTokens.input.bgFocus,
  },
  _hover: { borderColor: '#52525B' },
  fontSize: '15px',
  height: '48px',
  borderRadius: '6px',
} as const;

export const textareaProps = {
  bg: colorTokens.input.bg,
  borderColor: colorTokens.input.border,
  color: colorTokens.input.text,
  _placeholder: { color: colorTokens.input.placeholder },
  _focus: {
    borderColor: colorTokens.input.borderFocus,
    boxShadow: `0 0 0 1px ${colorTokens.input.borderFocus}`,
    bg: colorTokens.input.bgFocus,
  },
  _hover: { borderColor: '#52525B' },
  fontSize: '15px',
  borderRadius: '6px',
  minH: '120px',
  resize: 'vertical' as const,
  p: '12px 16px',
} as const;

export const selectProps = {
  bg: colorTokens.select.bg,
  borderColor: colorTokens.select.border,
  color: colorTokens.select.text,
  _focus: {
    borderColor: colorTokens.select.borderFocus,
    boxShadow: `0 0 0 1px ${colorTokens.select.borderFocus}`,
  },
  _hover: { borderColor: '#52525B' },
  fontSize: '15px',
  height: '48px',
  borderRadius: '6px',
} as const;

export const labelProps = {
  color: colorTokens.input.label,
  fontSize: '13px',
  fontWeight: '500',
  mb: '6px',
} as const;

export const dateInputSx = {
  colorScheme: 'dark',
  '::-webkit-calendar-picker-indicator': { filter: 'invert(1)' },
} as const;

export const numberInputSx = {
  '::-webkit-inner-spin-button': { filter: 'invert(0.8)' },
  '::-webkit-outer-spin-button': { filter: 'invert(0.8)' },
} as const;
