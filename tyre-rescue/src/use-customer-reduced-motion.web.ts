import { useEffect, useState } from 'react';

/** Use independent browser listeners; react-native-web keys handlers by their text. */
export function useCustomerReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let mounted = true;
    const update = (event: MediaQueryListEvent) => { if (mounted) setReducedMotion(event.matches); };
    setReducedMotion(preference.matches);
    if (typeof preference.addEventListener === 'function') preference.addEventListener('change', update);
    else preference.addListener(update);
    return () => {
      mounted = false;
      if (typeof preference.removeEventListener === 'function') preference.removeEventListener('change', update);
      else preference.removeListener(update);
    };
  }, []);

  return reducedMotion;
}
