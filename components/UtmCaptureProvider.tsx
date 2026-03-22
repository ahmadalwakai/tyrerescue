'use client';

import { Suspense } from 'react';
import { useUtmCapture } from '@/lib/hooks/useUtmCapture';

function UtmCaptureInner() {
  useUtmCapture();
  return null;
}

/**
 * Captures UTM / gclid params from the URL on first visit and stores them
 * in sessionStorage. Wrapped in Suspense because useSearchParams() requires it.
 */
export function UtmCaptureProvider() {
  return (
    <Suspense fallback={null}>
      <UtmCaptureInner />
    </Suspense>
  );
}
