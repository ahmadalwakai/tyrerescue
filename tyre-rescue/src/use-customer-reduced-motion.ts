import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Stay still until the system preference is known, including on the first render. */
export function useCustomerReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      if (mounted) setReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !preferenceChanged) setReducedMotion(enabled);
    }).catch(() => { /* Keep the quieter default if the preference is unavailable. */ });
    return () => { mounted = false; subscription?.remove(); };
  }, []);

  return reducedMotion;
}
