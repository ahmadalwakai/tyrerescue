export const colors = {
  bg: '#020712',
  bgNavy: '#061526',
  bgPanel: '#071A2C',
  surface: 'rgba(13, 31, 48, 0.82)',
  surfaceLight: 'rgba(23, 47, 70, 0.9)',
  surfaceSoft: 'rgba(255, 255, 255, 0.055)',
  glass: 'rgba(13, 31, 48, 0.72)',
  glassStrong: 'rgba(20, 43, 65, 0.88)',
  overlay: 'rgba(0, 0, 0, 0.72)',

  text: '#F7FBFF',
  textSecondary: '#D8E5F0',
  textMuted: '#93A8B8',
  textSubtle: '#688093',

  primary: '#FF7A18',
  accent: '#FF9B31',
  accentAlt: '#E95E0A',
  active: '#1F8BFF',
  activeSoft: 'rgba(31, 139, 255, 0.18)',
  tools: '#A855F7',
  toolsSoft: 'rgba(168, 85, 247, 0.16)',

  error: '#FF4D4F',
  success: '#2DDB75',
  warning: '#F5B83D',
  info: '#3B82F6',

  border: 'rgba(116, 148, 170, 0.2)',
  borderLight: 'rgba(116, 148, 170, 0.12)',
  borderStrong: 'rgba(149, 182, 205, 0.35)',

  successBg: 'rgba(45, 219, 117, 0.16)',
  errorBg: 'rgba(255, 77, 79, 0.16)',
  warningBg: 'rgba(245, 184, 61, 0.16)',
  infoBg: 'rgba(31, 139, 255, 0.16)',
};

// ============ STATUS COLOR MAP ============
// Booking statuses with precise bg/text color pairs
export const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: '#1F2937',
    text: '#93C5FD',
    label: 'Pending',
  },
  awaiting_payment: {
    bg: '#78350F',
    text: '#FDE68A',
    label: 'Awaiting Payment',
  },
  confirmed: {
    bg: '#065F46',
    text: '#86EFAC',
    label: 'Confirmed',
  },
  assigned: {
    bg: '#1E3A8A',
    text: '#93C5FD',
    label: 'Assigned',
  },
  in_progress: {
    bg: '#7C2D12',
    text: '#FED7AA',
    label: 'In Progress',
  },
  completed: {
    bg: '#15803D',
    text: '#BBEF63',
    label: 'Completed',
  },
  cancelled: {
    bg: '#5F2E2E',
    text: '#FCCACA',
    label: 'Cancelled',
  },
  refunded: {
    bg: '#1F3A5F',
    text: '#BAE6FD',
    label: 'Refunded',
  },
  failed: {
    bg: '#7F1D1D',
    text: '#FCA5A5',
    label: 'Failed',
  },
  no_show: {
    bg: '#42342A',
    text: '#E0BFAB',
    label: 'No Show',
  },
  rescheduled: {
    bg: '#5F3A7F',
    text: '#E9D5FF',
    label: 'Rescheduled',
  },
  on_hold: {
    bg: '#664400',
    text: '#FFE4B5',
    label: 'On Hold',
  },
  out_of_stock: {
    bg: '#78350F',
    text: '#FDE68A',
    label: 'Out of Stock',
  },
  on_time: {
    bg: '#065F46',
    text: '#86EFAC',
    label: 'On Time',
  },
  at_risk: {
    bg: '#78350F',
    text: '#FDE68A',
    label: 'At Risk',
  },
  late: {
    bg: '#7F1D1D',
    text: '#FCA5A5',
    label: 'Late',
  },
  offline: {
    bg: '#3F3F46',
    text: '#D4D4D8',
    label: 'Offline',
  },
  job_closed: {
    bg: '#3F3F46',
    text: '#D4D4D8',
    label: 'Job Closed',
  },
  unavailable: {
    bg: '#5F2E2E',
    text: '#FCCACA',
    label: 'Unavailable',
  },
};

// ============ DRIVER STATUS COLORS ============
export const driverStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  online: {
    bg: '#166534',
    text: '#86EFAC',
    label: 'Online',
  },
  busy: {
    bg: '#7C2D12',
    text: '#FED7AA',
    label: 'Busy',
  },
  offline: {
    bg: '#3F3F46',
    text: '#D4D4D8',
    label: 'Offline',
  },
  on_break: {
    bg: '#664400',
    text: '#FFE4B5',
    label: 'On Break',
  },
  unavailable: {
    bg: '#5F2E2E',
    text: '#FCCACA',
    label: 'Unavailable',
  },
};

// ============ SPACING SCALE ============
// 8pt grid system
export const spacing = {
  xs: 4,      // Extra small - badges, spacing
  sm: 8,      // Small - text padding, tight spacing
  md: 12,     // Medium - standard padding
  lg: 16,     // Large - section padding, standard gap
  xl: 20,     // Extra large - major spacing
  '2xl': 24,  // 2X large - large section spacing
  '3xl': 32,  // 3X large - major section spacing
  '4xl': 40,  // 4X large
};

// ============ TYPOGRAPHY ============
export const typography = {
  size: {
    xs: 11,       // Extra small - labels, badges
    sm: 13,       // Small - secondary text
    base: 15,     // Base - body text
    md: 16,       // Medium - input, standard
    lg: 17,       // Large
    xl: 20,       // Extra large - section headers
    xxl: 24,      // 2X large - page title
    display: 32,  // Display - hero title
  },
  weight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// ============ BORDER RADIUS ============
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
};

// ============ SHADOWS ============
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.5)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
};

// ============ HELPER FUNCTIONS ============
export const getStatusColor = (status: string) => {
  return statusColors[status as keyof typeof statusColors] || statusColors.pending;
};

export const getDriverStatusColor = (status: string) => {
  return driverStatusColors[status as keyof typeof driverStatusColors] || driverStatusColors.offline;
};
