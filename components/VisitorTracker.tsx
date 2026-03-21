'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const SESSION_KEY = 'tr_visitor_sid';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
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

function getReferrerSource(): string {
  const ref = document.referrer;
  if (!ref) return 'Direct';
  if (ref.includes('google.')) return 'Google';
  if (ref.includes('bing.')) return 'Bing';
  if (ref.includes('facebook.') || ref.includes('fb.')) return 'Facebook';
  if (ref.includes('instagram.')) return 'Instagram';
  if (ref.includes('tiktok.')) return 'TikTok';
  if (ref.includes('whatsapp.')) return 'WhatsApp';
  if (ref.includes('twitter.') || ref.includes('x.com')) return 'X';
  return 'Other';
}

export function VisitorTracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const startTimeRef = useRef(Date.now());
  const lastClickRef = useRef<Map<string, number>>(new Map());
  const trackedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const isAdmin = session?.user?.role === 'admin';

  const track = useCallback(
    async (extra?: { buttonText?: string }) => {
      if (isAdmin) return;
      const sessionId = getSessionId();
      if (!sessionId) return;

      try {
        await fetch('/api/visitors/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            path: window.location.pathname,
            title: document.title,
            device: detectDevice(),
            browser: detectBrowser(),
            referrer: getReferrerSource(),
            ...extra,
          }),
          keepalive: true,
        });
      } catch { /* silent */ }
    },
    [isAdmin]
  );

  // Track page views on navigation
  useEffect(() => {
    if (isAdmin) return;
    // Small delay to let title update
    const timer = setTimeout(() => track(), 200);
    return () => clearTimeout(timer);
  }, [pathname, track, isAdmin]);

  // Click tracking
  useEffect(() => {
    if (isAdmin) return;

    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('button, a, [role="button"]') as HTMLElement | null;
      if (!target) return;

      const text =
        target.getAttribute('aria-label') ||
        target.textContent?.trim().slice(0, 100) ||
        '';

      if (!text || text.length < 2) return;

      // Debounce: same button text within 2 seconds
      const now = Date.now();
      const last = lastClickRef.current.get(text);
      if (last && now - last < 2000) return;
      lastClickRef.current.set(text, now);

      track({ buttonText: text });
    };

    document.addEventListener('click', handler, { passive: true, capture: true });
    return () => document.removeEventListener('click', handler, true);
  }, [isAdmin, track]);

  // Heartbeat every 30s
  useEffect(() => {
    if (isAdmin) return;

    const sendHeartbeat = async () => {
      const sessionId = getSessionId();
      if (!sessionId) return;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      try {
        await fetch('/api/visitors/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, duration }),
          keepalive: true,
        });
      } catch { /* silent */ }
    };

    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    // Final beacon on unload
    const onUnload = () => {
      const sessionId = getSessionId();
      if (!sessionId) return;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      navigator.sendBeacon(
        '/api/visitors/heartbeat',
        JSON.stringify({ sessionId, duration })
      );
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [isAdmin]);

  // Listen for cookie consent updates
  useEffect(() => {
    if (isAdmin) return;

    const onConsent = () => {
      try {
        const raw = localStorage.getItem('tyrerescue_consent_v2');
        if (!raw) return;
        const consent = JSON.parse(raw);
        if (consent.analytics) {
          const sessionId = getSessionId();
          if (!sessionId) return;
          fetch('/api/visitors/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {});
        }
      } catch { /* silent */ }
    };

    window.addEventListener('cookie-consent-updated', onConsent);
    // Check existing consent on mount
    if (!trackedRef.current) {
      trackedRef.current = true;
      onConsent();
    }
    return () => window.removeEventListener('cookie-consent-updated', onConsent);
  }, [isAdmin]);

  return null;
}
