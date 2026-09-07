'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  buildGoogleConsentModeState,
  getStoredConsent,
  type ConsentData,
  type GoogleConsentModeState,
} from '@/lib/analytics/consent';
import { clearEnhancedUserData } from '@/lib/analytics/gtag';
import {
  clearGoogleAdsWebsiteCallCallbackValue,
  configureGoogleAdsWebsiteCall,
  getWindowGoogleAdsWebsiteCallConfig,
  isGoogleAdsWebsiteCallEligible,
  normalizeGoogleAdsPhoneConversionCallback,
  registerGoogleAdsWebsiteCallCallback,
  restoreGoogleAdsWebsiteCallDom,
  syncGoogleAdsWebsiteCallDom,
} from '@/lib/analytics/website-calls';

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
const WEBSITE_CALL_RETRY_LIMIT = 12;
const WEBSITE_CALL_RETRY_MS = 500;

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
  const pathname = usePathname();
  const mountedRef = useRef(false);
  const requestVersionRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const websiteCallObserverRef = useRef<MutationObserver | null>(null);
  const websiteCallRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const websiteCallSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unregisterWebsiteCallCallbackRef = useRef<(() => void) | null>(null);
  const websiteCallObserverSuppressedRef = useRef(false);
  const websiteCallSessionRef = useRef(0);
  const websiteCallCallbackPhoneRef = useRef<string | null>(null);

  const clearWebsiteCallRetry = useCallback(() => {
    if (!websiteCallRetryRef.current) return;
    clearTimeout(websiteCallRetryRef.current);
    websiteCallRetryRef.current = null;
  }, []);

  const clearWebsiteCallObserverSuppression = useCallback(() => {
    if (websiteCallSuppressTimerRef.current) {
      clearTimeout(websiteCallSuppressTimerRef.current);
      websiteCallSuppressTimerRef.current = null;
    }
    websiteCallObserverSuppressedRef.current = false;
  }, []);

  const runOwnedWebsiteCallUpdate = useCallback(
    (update: () => void) => {
      websiteCallObserverSuppressedRef.current = true;
      if (websiteCallSuppressTimerRef.current) {
        clearTimeout(websiteCallSuppressTimerRef.current);
      }

      try {
        update();
      } finally {
        websiteCallSuppressTimerRef.current = setTimeout(() => {
          websiteCallObserverSuppressedRef.current = false;
          websiteCallSuppressTimerRef.current = null;
        }, 0);
      }
    },
    [],
  );

  const cleanupWebsiteCallIntegration = useCallback(() => {
    websiteCallSessionRef.current += 1;
    clearWebsiteCallRetry();
    clearWebsiteCallObserverSuppression();
    websiteCallObserverRef.current?.disconnect();
    websiteCallObserverRef.current = null;
    unregisterWebsiteCallCallbackRef.current?.();
    unregisterWebsiteCallCallbackRef.current = null;
    websiteCallCallbackPhoneRef.current = null;
    clearGoogleAdsWebsiteCallCallbackValue();
    websiteCallObserverSuppressedRef.current = true;
    try {
      restoreGoogleAdsWebsiteCallDom();
    } finally {
      clearWebsiteCallObserverSuppression();
    }
  }, [clearWebsiteCallObserverSuppression, clearWebsiteCallRetry]);

  const websiteCallIsEligible = useCallback(
    (marketing: boolean) => {
      const config = getWindowGoogleAdsWebsiteCallConfig();
      if (!config || typeof window === 'undefined') return false;

      return isGoogleAdsWebsiteCallEligible({
        hostname: window.location.hostname,
        pathname,
        marketingConsent: marketing,
        displayPhone: config.phoneConversionNumber,
      });
    },
    [pathname],
  );

  const syncWebsiteCallIntegration = useCallback(
    (marketing: boolean) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;

      const config = getWindowGoogleAdsWebsiteCallConfig();
      if (!config || !websiteCallIsEligible(marketing)) {
        cleanupWebsiteCallIntegration();
        return;
      }

      websiteCallSessionRef.current += 1;
      const session = websiteCallSessionRef.current;
      clearWebsiteCallRetry();
      clearWebsiteCallObserverSuppression();
      unregisterWebsiteCallCallbackRef.current?.();
      unregisterWebsiteCallCallbackRef.current = null;
      websiteCallCallbackPhoneRef.current = null;
      clearGoogleAdsWebsiteCallCallbackValue();
      runOwnedWebsiteCallUpdate(() => restoreGoogleAdsWebsiteCallDom());

      const isStillAllowed = () =>
        mountedRef.current &&
        session === websiteCallSessionRef.current &&
        getStoredConsent()?.marketing === true &&
        websiteCallIsEligible(true);
      const applyCallbackPhone = (phoneNumber: unknown) => {
        if (!isStillAllowed()) return;
        const normalized = normalizeGoogleAdsPhoneConversionCallback(phoneNumber);
        if (!normalized || !isStillAllowed()) return;

        websiteCallCallbackPhoneRef.current = normalized.displayPhone;
        runOwnedWebsiteCallUpdate(() => {
          if (isStillAllowed()) syncGoogleAdsWebsiteCallDom(normalized.displayPhone);
        });
      };
      const runConfig = () => {
        if (!isStillAllowed()) {
          cleanupWebsiteCallIntegration();
          return true;
        }

        const configured = configureGoogleAdsWebsiteCall(config, applyCallbackPhone);
        return configured;
      };
      const scheduleRetry = (attempt: number) => {
        if (attempt > WEBSITE_CALL_RETRY_LIMIT || !isStillAllowed()) return;
        clearWebsiteCallRetry();
        websiteCallRetryRef.current = setTimeout(() => {
          websiteCallRetryRef.current = null;
          if (!isStillAllowed()) {
            cleanupWebsiteCallIntegration();
            return;
          }
          const configured = runConfig();
          if (!configured) scheduleRetry(attempt + 1);
        }, WEBSITE_CALL_RETRY_MS);
      };

      unregisterWebsiteCallCallbackRef.current =
        registerGoogleAdsWebsiteCallCallback(applyCallbackPhone);
      if (!runConfig()) scheduleRetry(1);

      if (!websiteCallObserverRef.current && document.body) {
        websiteCallObserverRef.current = new MutationObserver(() => {
          if (websiteCallObserverSuppressedRef.current) return;
          if (!isStillAllowed()) {
            cleanupWebsiteCallIntegration();
            return;
          }
          const callbackPhone = websiteCallCallbackPhoneRef.current;
          if (!callbackPhone) return;

          runOwnedWebsiteCallUpdate(() => {
            if (isStillAllowed()) syncGoogleAdsWebsiteCallDom(callbackPhone);
          });
        });
        websiteCallObserverRef.current.observe(document.body, {
          attributes: true,
          attributeFilter: ['href'],
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    },
    [
      cleanupWebsiteCallIntegration,
      clearWebsiteCallObserverSuppression,
      clearWebsiteCallRetry,
      runOwnedWebsiteCallUpdate,
      websiteCallIsEligible,
    ],
  );

  const applyImmediateConsentEffects = useCallback(
    (consent: ConsentData | null) => {
      const analytics = consent?.analytics === true;
      const marketing = consent?.marketing === true;
      gtagConsentUpdate(buildGoogleConsentModeState(consent));
      syncLoadedVendorConsent(analytics, marketing);
      syncWebsiteCallIntegration(marketing);
      return { analytics, marketing };
    },
    [syncWebsiteCallIntegration],
  );

  const isCurrentRequest = useCallback(
    (requestVersion: number, controller: AbortController) =>
      mountedRef.current &&
      requestVersion === requestVersionRef.current &&
      !controller.signal.aborted,
    [],
  );

  const applyConsent = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const initialConsent = getStoredConsent();
    applyImmediateConsentEffects(initialConsent);
    if (!initialConsent) return;

    let settings = settingsCache;
    if (!settings) {
      let res: Response;
      try {
        res = await fetch('/api/public/cookie-settings', { signal: controller.signal });
      } catch (error) {
        if ((error as { name?: string } | null)?.name !== 'AbortError') {
          applyImmediateConsentEffects(getStoredConsent());
        }
        return;
      }

      if (!isCurrentRequest(requestVersion, controller)) return;
      const afterFetchConsent = getStoredConsent();
      applyImmediateConsentEffects(afterFetchConsent);
      if (!afterFetchConsent || !res.ok) return;

      try {
        settings = await res.json();
      } catch {
        return;
      }

      if (!isCurrentRequest(requestVersion, controller)) return;
      const afterJsonConsent = getStoredConsent();
      applyImmediateConsentEffects(afterJsonConsent);
      if (!afterJsonConsent || !settings) return;
      settingsCache = settings;
    }

    if (!isCurrentRequest(requestVersion, controller)) return;
    const currentConsent = getStoredConsent();
    const { analytics, marketing } = applyImmediateConsentEffects(currentConsent);
    if (!currentConsent) return;

    // GA4: always loaded in <head>; just update consent state
    if (settings.ga4Enabled && settings.ga4MeasurementId) {
      gtagConsentUpdate(buildGoogleConsentModeState(getStoredConsent()));
    }

    if (analytics && getStoredConsent()?.analytics === true) {
      if (settings.clarityEnabled && settings.clarityId) initClarity(settings.clarityId);
    }

    if (marketing && getStoredConsent()?.marketing === true) {
      if (settings.metaPixelEnabled && settings.metaPixelId) initMetaPixel(settings.metaPixelId);
    }
  }, [applyImmediateConsentEffects, isCurrentRequest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
      abortControllerRef.current?.abort();
      cleanupWebsiteCallIntegration();
    };
  }, [cleanupWebsiteCallIntegration]);

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
