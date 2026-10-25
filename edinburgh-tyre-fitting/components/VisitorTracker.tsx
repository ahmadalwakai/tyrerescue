'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/lib/site';

const SESSION_KEY = 'etf_visitor_sid';
const DEFAULT_TRACKING_ORIGIN = 'https://www.tyrerescue.uk';

function getTrackingOrigin(): string {
  return (process.env.NEXT_PUBLIC_TYRE_RESCUE_API_BASE_URL || DEFAULT_TRACKING_ORIGIN).replace(/\/+$/, '');
}

function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function detectDevice(): string {
  const ua = navigator.userAgent;
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Chrome/')) return 'Chrome';
  return 'Other';
}

function sourcePayload() {
  return {
    sourceApp: siteConfig.sourceApp,
    sourceLabel: siteConfig.sourceLabel,
  };
}

export function VisitorTracker() {
  const pathname = usePathname();
  const startedAtRef = useRef(Date.now());
  const trackedRef = useRef(false);

  const track = useCallback(async (extra?: { exiting?: boolean }) => {
    const sessionId = getSessionId();
    const origin = getTrackingOrigin();
    await fetch(`${origin}/api/visitors/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        ...sourcePayload(),
        path: window.location.pathname,
        title: document.title,
        device: detectDevice(),
        browser: detectBrowser(),
        referrer: document.referrer || null,
        ...extra,
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void track();
    }, 200);
    return () => clearTimeout(timer);
  }, [pathname, track]);

  useEffect(() => {
    const sendHeartbeat = () => {
      const sessionId = getSessionId();
      const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
      const origin = getTrackingOrigin();
      fetch(`${origin}/api/visitors/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, duration, ...sourcePayload() }),
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();
    const heartbeat = setInterval(sendHeartbeat, 30_000);

    const handleExit = () => {
      if (trackedRef.current) return;
      trackedRef.current = true;
      const sessionId = getSessionId();
      const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
      const origin = getTrackingOrigin();
      navigator.sendBeacon(
        `${origin}/api/visitors/heartbeat`,
        new Blob([JSON.stringify({ sessionId, duration, ...sourcePayload() })], { type: 'application/json' }),
      );
      navigator.sendBeacon(
        `${origin}/api/visitors/track`,
        new Blob([
          JSON.stringify({
            sessionId,
            ...sourcePayload(),
            exiting: true,
            path: window.location.pathname,
          }),
        ], { type: 'application/json' }),
      );
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleExit();
    };

    window.addEventListener('beforeunload', handleExit);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleExit);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}
