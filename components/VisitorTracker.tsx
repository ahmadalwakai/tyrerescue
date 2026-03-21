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

function extractSearchData(): { searchEngine: string; searchKeyword: string | null; referrer: string } {
  const ref = document.referrer;
  let searchEngine = 'Direct';
  let searchKeyword: string | null = null;
  let referrer = 'Direct';

  if (!ref) return { searchEngine, searchKeyword, referrer };

  try {
    const url = new URL(ref);
    const host = url.hostname.toLowerCase();

    if (host.includes('google'))       { searchEngine = 'Google'; referrer = 'Google'; }
    else if (host.includes('bing'))    { searchEngine = 'Bing'; referrer = 'Bing'; }
    else if (host.includes('yahoo'))   { searchEngine = 'Yahoo'; referrer = 'Yahoo'; }
    else if (host.includes('duckduckgo')) { searchEngine = 'DuckDuckGo'; referrer = 'DuckDuckGo'; }
    else if (host.includes('ecosia'))  { searchEngine = 'Ecosia'; referrer = 'Ecosia'; }
    else if (host.includes('facebook') || host.includes('fb.')) { searchEngine = 'Direct'; referrer = 'Facebook'; }
    else if (host.includes('instagram')) { searchEngine = 'Direct'; referrer = 'Instagram'; }
    else if (host.includes('tiktok'))  { searchEngine = 'Direct'; referrer = 'TikTok'; }
    else if (host.includes('whatsapp')) { searchEngine = 'Direct'; referrer = 'WhatsApp'; }
    else if (host.includes('twitter') || host.includes('x.com')) { searchEngine = 'Direct'; referrer = 'X'; }
    else { searchEngine = 'Direct'; referrer = host.replace('www.', '').split('.')[0]; }

    searchKeyword = url.searchParams.get('q')
      || url.searchParams.get('p')
      || url.searchParams.get('query')
      || url.searchParams.get('search_query')
      || null;
  } catch { /* ignore */ }

  return { searchEngine, searchKeyword, referrer };
}

export function VisitorTracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const startTimeRef = useRef(Date.now());
  const lastClickRef = useRef<Map<string, number>>(new Map());
  const trackedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const isAdmin = session?.user?.role === 'admin';

  const searchDataRef = useRef<{ searchEngine: string; searchKeyword: string | null; referrer: string } | null>(null);

  const track = useCallback(
    async (extra?: { buttonText?: string }) => {
      if (isAdmin) return;
      const sessionId = getSessionId();
      if (!sessionId) return;

      // Extract search data once per session
      if (!searchDataRef.current) {
        searchDataRef.current = extractSearchData();
      }
      const sd = searchDataRef.current;

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
            referrer: sd.referrer,
            searchEngine: sd.searchEngine,
            searchKeyword: sd.searchKeyword,
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

    // Final beacon on unload — heartbeat + exit tracking
    const handleExit = () => {
      const sessionId = getSessionId();
      if (!sessionId) return;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      navigator.sendBeacon(
        '/api/visitors/heartbeat',
        JSON.stringify({ sessionId, duration })
      );
      navigator.sendBeacon(
        '/api/visitors/track',
        new Blob([JSON.stringify({ sessionId, exiting: true, path: window.location.pathname })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleExit);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleExit();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleExit);
      document.removeEventListener('visibilitychange', handleVisibility);
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
