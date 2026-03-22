/**
 * Client-side analytics tracker for demand signals.
 * Integrates with existing cookie consent system.
 */

const CONSENT_KEY = 'tyrerescue_consent_v2';
const SESSION_KEY = 'tr_session_id';
const VISIT_KEY = 'tr_visit_count';

interface ConsentState {
  analytics?: boolean;
  marketing?: boolean;
  essential?: boolean;
}

function getConsent(): ConsentState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ConsentState;
  } catch {
    return {};
  }
}

function hasAnalyticsConsent(): boolean {
  const c = getConsent();
  return c.analytics === true;
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getVisitCount(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    return raw ? parseInt(raw, 10) : 1;
  } catch {
    return 1;
  }
}

function incrementVisitCount(): void {
  if (typeof window === 'undefined') return;
  try {
    const count = getVisitCount() + 1;
    localStorage.setItem(VISIT_KEY, String(count));
  } catch { /* ignore */ }
}

export function isReturningVisitor(): boolean {
  return getVisitCount() > 1;
}

export function getVisitorInfo(): {
  sessionId: string;
  visitCount: number;
  isReturning: boolean;
  hasConsent: boolean;
} {
  return {
    sessionId: getOrCreateSessionId(),
    visitCount: getVisitCount(),
    isReturning: isReturningVisitor(),
    hasConsent: hasAnalyticsConsent(),
  };
}

/**
 * Track a demand-relevant event.
 * Silently fails if no consent or if request fails.
 */
export async function trackEvent(
  eventType: 'page_view' | 'call_click' | 'whatsapp_click' | 'booking_start' | 'booking_complete',
  metadata?: Record<string, string>
): Promise<void> {
  // Always fire — server decides what to store based on consent
  try {
    const body = {
      event: eventType,
      sessionId: getOrCreateSessionId(),
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      metadata: metadata ?? {},
      consent: hasAnalyticsConsent(),
    };

    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/analytics/event', JSON.stringify(body));
    } else {
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* silent fail */ }
}

/** Call once on initial page load to increment visit count */
export function initTracker(): void {
  if (typeof window === 'undefined') return;
  incrementVisitCount();
}
