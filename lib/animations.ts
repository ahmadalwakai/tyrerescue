/**
 * Shared animation system — CSS keyframes defined in app/globals.css
 * Use via Chakra UI sx prop: <Box sx={anim.fadeUp()}>
 */

const EASE_OUT_EXPO = 'cubic-bezier(0.16,1,0.3,1)';

export const animations = {
  fadeUp: {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: 'easeOut' },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.4, ease: 'easeOut' },
  },
  slideInRight: {
    initial: { opacity: 0, x: 60 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

/** CSS animation sx-prop helpers — every call returns a Record<string, string> */
export const anim = {
  fadeUp: (duration = '0.5s', delay = '0s') => ({
    animation: `fadeUp ${duration} ${EASE_OUT_EXPO} ${delay} both`,
  }),
  fadeIn: (duration = '0.4s', delay = '0s') => ({
    animation: `fadeIn ${duration} ease-out ${delay} both`,
  }),
  slideInRight: (duration = '0.6s', delay = '0s') => ({
    animation: `slideInRight ${duration} ${EASE_OUT_EXPO} ${delay} both`,
  }),
  slideInLeft: (duration = '0.6s', delay = '0s') => ({
    animation: `slideInLeft ${duration} ${EASE_OUT_EXPO} ${delay} both`,
  }),
  scaleIn: (duration = '0.5s', delay = '0s') => ({
    animation: `scaleIn ${duration} ease-out ${delay} both`,
  }),
  pulseGlow: () => ({
    animation: 'pulseGlow 2s infinite',
  }),
  /** Stagger helper: returns sx for the nth item (0-based index) */
  stagger: (
    type: 'fadeUp' | 'fadeIn' | 'slideInRight' | 'slideInLeft' | 'scaleIn',
    index: number,
    duration = '0.4s',
    baseDelay = 0,
    step = 0.05,
  ) => {
    const delay = `${Math.min(baseDelay + index * step, 0.5).toFixed(2)}s`;
    const ease = type === 'fadeIn' || type === 'scaleIn' ? 'ease-out' : EASE_OUT_EXPO;
    return { animation: `${type} ${duration} ${ease} ${delay} both` };
  },
};
