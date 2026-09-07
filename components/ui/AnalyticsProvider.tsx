'use client';

import { useEffect, useCallback } from 'react';
import {
  buildGoogleConsentModeState,
  getStoredConsent,
  type GoogleConsentModeState,
} from '@/lib/analytics/consent';
import { clearEnhancedUserData } from '@/lib/analytics/gtag';

interface CookieSettingsData {
  ga4MeasurementId: string;
  ga4Enabled: boolean;
  metaPixelId: string;
  metaPixelEnabled: boolean;
  clarityId: string;
  clarityEnabled: boolean;
}

interface AnalyticsWindow extends Window {
  clarity?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
}

let settingsCache: CookieSettingsData | null = null;

/* ----------  Google Consent Mode v2  ---------- */
function gtagConsentUpdate(state: GoogleConsentModeState) {
  const w = window as AnalyticsWindow;
  if (typeof w.gtag !== 'function') return;
  try {
    w.gtag('consent', 'update', state);
  } catch {
    // Tracking failures must not affect booking, call, or payment flows.
  }
}

function syncLoadedVendorConsent(analytics: boolean, marketing: boolean) {
  const w = window as AnalyticsWindow;

  if (!analytics && typeof w.clarity === 'function') {
    try {
      w.clarity('consent', false);
    } catch {}
  }

  if (typeof w.fbq === 'function') {
    try {
      w.fbq('consent', marketing ? 'grant' : 'revoke');
    } catch {}
  }

  if (!marketing) clearEnhancedUserData();
}

function initClarity(projectId: string) {
  if (document.getElementById('clarity-init')) return;

  const script = document.createElement('script');
  script.id = 'clarity-init';
  script.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${projectId.replace(/[^a-zA-Z0-9]/g, '')}");`;
  document.head.appendChild(script);
}

function initMetaPixel(pixelId: string) {
  if (document.getElementById('fb-pixel-init')) return;

  const sanitizedId = pixelId.replace(/[^0-9]/g, '');
  const script = document.createElement('script');
  script.id = 'fb-pixel-init';
  script.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${sanitizedId}');fbq('track','PageView');`;
  document.head.appendChild(script);
}

export function AnalyticsProvider() {
  const applyConsent = useCallback(async () => {
    const consent = getStoredConsent();
    const analytics = consent?.analytics === true;
    const marketing = consent?.marketing === true;
    gtagConsentUpdate(buildGoogleConsentModeState(consent));
    syncLoadedVendorConsent(analytics, marketing);

    if (!consent) return;

    if (!settingsCache) {
      try {
        const res = await fetch('/api/public/cookie-settings');
        if (!res.ok) return;
        settingsCache = await res.json();
      } catch {
        return;
      }
    }

    const s = settingsCache!;

    // GA4: always loaded in <head>; just update consent state
    if (s.ga4Enabled && s.ga4MeasurementId) {
      gtagConsentUpdate(buildGoogleConsentModeState(consent));
    }

    if (analytics) {
      if (s.clarityEnabled && s.clarityId) initClarity(s.clarityId);
    }

    if (marketing) {
      if (s.metaPixelEnabled && s.metaPixelId) initMetaPixel(s.metaPixelId);
    }
  }, []);

  useEffect(() => {
    applyConsent();
  }, [applyConsent]);

  useEffect(() => {
    const handler = () => {
      settingsCache = null;
      applyConsent();
    };
    window.addEventListener('cookie-consent-updated', handler);
    window.addEventListener('cookie-consent-reset', handler);
    return () => {
      window.removeEventListener('cookie-consent-updated', handler);
      window.removeEventListener('cookie-consent-reset', handler);
    };
  }, [applyConsent]);

  return null;
}
