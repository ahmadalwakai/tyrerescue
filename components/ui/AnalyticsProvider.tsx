'use client';

import { useEffect, useCallback } from 'react';
import { getConsent } from './CookieBanner';

interface CookieSettingsData {
  ga4MeasurementId: string;
  ga4Enabled: boolean;
  metaPixelId: string;
  metaPixelEnabled: boolean;
  clarityId: string;
  clarityEnabled: boolean;
}

let settingsCache: CookieSettingsData | null = null;

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
}

function initGA4(measurementId: string) {
  if (document.getElementById('gtag-init')) return;

  const w = window as unknown as Record<string, unknown>;
  w.dataLayer = (w.dataLayer as unknown[]) || [];
  function gtag(...args: unknown[]) {
    (w.dataLayer as unknown[]).push(args);
  }
  gtag('js', new Date());
  gtag('config', measurementId);

  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`, 'gtag-init');
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
    const consent = getConsent();
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

    if (consent.analytics) {
      if (s.ga4Enabled && s.ga4MeasurementId) initGA4(s.ga4MeasurementId);
      if (s.clarityEnabled && s.clarityId) initClarity(s.clarityId);
    }

    if (consent.marketing) {
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
    return () => window.removeEventListener('cookie-consent-updated', handler);
  }, [applyConsent]);

  return null;
}
