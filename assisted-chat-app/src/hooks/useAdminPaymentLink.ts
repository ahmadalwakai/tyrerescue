import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { api, ApiError } from '@/lib/api';
import type {
  AdminPaymentLinkResponse,
  AssistedChatDraft,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import {
  derivePaymentLinkLiveStatus,
  getPaymentLinkStatusLabel,
  getStripeAutoCheckDelayMs,
  isPaymentLinkEligibleForAutoCheck,
  isPaymentLinkTerminalStatus,
  shouldIgnoreStalePaymentLinkStatus,
  STRIPE_AUTO_CHECK_STOP_AFTER_MS,
  type PaymentLinkAutoCheckState,
  type PaymentLinkLiveStatus,
  type PaymentLinkStatusResponse,
} from '@/lib/payment-link-status';

export type {
  PaymentLinkAutoCheckState,
  PaymentLinkLiveStatus,
  PaymentLinkStatusResponse,
} from '@/lib/payment-link-status';

export interface UseAdminPaymentLinkArgs {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  /**
   * True only when the payment UI is actually visible. Automatic Stripe checks
   * pause outside that surface; the manual checker remains available wherever
   * the existing payment link card is rendered.
   */
  autoCheckActive?: boolean;
}

export interface UseAdminPaymentLink {
  busy: boolean;
  checking: boolean;
  error: string | null;
  /**
   * Live payment status returned by the backend Stripe checker. The app never
   * marks a booking as paid client-side.
   */
  liveStatus: PaymentLinkLiveStatus | null;
  autoCheckState: PaymentLinkAutoCheckState;
  autoCheckMessage: string | null;
  lastCheckedAtIso: string | null;
  /**
   * Create a Stripe payment link for the dispatched booking's outstanding
   * balance. Stores the result on `draft.paymentLink`. No-ops (returns null)
   * when there is no dispatched booking or a request is already in flight, so
   * rapid double-taps can never create duplicate links.
   */
  createForDispatchedBooking: () => Promise<StripePaymentLinkState | null>;
  /**
   * Ask the backend to check Stripe immediately and persist the result. This is
   * the no-webhook fallback: the apps still trust the backend payment summary,
   * but the admin can refresh it on demand.
   */
  checkNow: () => Promise<PaymentLinkLiveStatus | null>;
}

export const STRIPE_CHECK_TIMEOUT_MS = 15_000;

function isForegroundState(state: AppStateStatus): boolean {
  return state === 'active';
}

function browserDocumentIsVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

function browserNetworkIsOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function initialForegroundState(): boolean {
  if (Platform.OS === 'web') return browserDocumentIsVisible();
  return isForegroundState(AppState.currentState);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    /\babort(?:ed)?\b/i.test(error.message)
  );
}

function withStripeCheckTimeout<T>(
  promise: Promise<T>,
  controller: AbortController,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Stripe payment check timed out. Please try again.'));
    }, STRIPE_CHECK_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function formatCheckedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildAutoCheckMessage(input: {
  hasLink: boolean;
  liveStatus: PaymentLinkLiveStatus | null;
  autoCheckState: PaymentLinkAutoCheckState;
  lastCheckedAtIso: string | null;
  autoCheckError: string | null;
}): string | null {
  if (!input.hasLink) return null;
  if (input.liveStatus === 'paid') return 'Payment confirmed by Stripe.';
  if (input.liveStatus === 'refunded') return 'Payment has been refunded.';
  if (input.autoCheckState === 'checking') return 'Checking Stripe now...';
  if (input.autoCheckState === 'offline') return 'Auto-check paused while offline.';
  if (input.autoCheckState === 'paused') return 'Auto-check pauses until the Payment screen is visible.';
  if (input.autoCheckState === 'stopped') return 'Auto-check stopped after 5 minutes. Use Stripe Checker to refresh.';
  if (input.autoCheckState === 'error') {
    return input.autoCheckError
      ? `Auto-check could not refresh: ${input.autoCheckError}`
      : 'Auto-check could not refresh. Use Stripe Checker to retry.';
  }

  const checkedAt = formatCheckedAt(input.lastCheckedAtIso);
  if (checkedAt) {
    return `Auto-check active. Last checked ${checkedAt}.`;
  }

  return `${getPaymentLinkStatusLabel(input.liveStatus)}. Auto-check ready.`;
}

/**
 * Calls the admin-only backend endpoint that creates a Stripe Checkout link for
 * an EXISTING booking. The backend validates the amount against the outstanding
 * balance and records a pending payment; the Stripe webhook later confirms it.
 * This hook NEVER marks anything as paid client-side.
 */
export function useAdminPaymentLink({
  draft,
  update,
  autoCheckActive = false,
}: UseAdminPaymentLinkArgs): UseAdminPaymentLink {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<PaymentLinkLiveStatus | null>(null);
  const [autoCheckState, setAutoCheckState] = useState<PaymentLinkAutoCheckState>('idle');
  const [lastCheckedAtIso, setLastCheckedAtIso] = useState<string | null>(null);
  const [autoCheckError, setAutoCheckError] = useState<string | null>(null);
  const [appIsForeground, setAppIsForeground] = useState(initialForegroundState);
  const [networkOnline, setNetworkOnline] = useState(browserNetworkIsOnline);

  const createInflight = useRef(false);
  const checkInflight = useRef(false);
  const mountedRef = useRef(true);
  const refRef = useRef<string | null>(null);
  const hasLinkRef = useRef(false);
  const liveStatusRef = useRef<PaymentLinkLiveStatus | null>(null);
  const autoCheckActiveRef = useRef(autoCheckActive);
  const appIsForegroundRef = useRef(appIsForeground);
  const networkOnlineRef = useRef(networkOnline);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoWindowStartedAtRef = useRef<number | null>(null);
  const autoWindowLinkKeyRef = useRef<string | null>(null);

  const ref = draft.dispatchedRefNumber ?? draft.paymentLink?.refNumber ?? null;
  const hasLink = draft.paymentLink != null;
  const linkKey = draft.paymentLink
    ? [
        ref ?? draft.paymentLink.refNumber,
        draft.paymentLink.paymentUrl,
        draft.paymentLink.amountPence,
        draft.paymentLink.createdAtIso,
      ].join('|')
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    refRef.current = ref;
    hasLinkRef.current = hasLink;
    autoCheckActiveRef.current = autoCheckActive;
    appIsForegroundRef.current = appIsForeground;
    networkOnlineRef.current = networkOnline;
  }, [appIsForeground, autoCheckActive, hasLink, networkOnline, ref]);

  useEffect(() => {
    if (autoWindowLinkKeyRef.current === linkKey) return;
    autoWindowLinkKeyRef.current = linkKey;
    autoWindowStartedAtRef.current = null;
    setLastCheckedAtIso(null);
    setAutoCheckError(null);
    setLiveStatus(null);
    liveStatusRef.current = null;
    if (!linkKey) setAutoCheckState('idle');
  }, [linkKey]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const syncVisibility = () => setAppIsForeground(browserDocumentIsVisible());
      const markFocused = () => setAppIsForeground(browserDocumentIsVisible());
      syncVisibility();

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', syncVisibility);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', markFocused);
        window.addEventListener('blur', syncVisibility);
      }

      return () => {
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', syncVisibility);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', markFocused);
          window.removeEventListener('blur', syncVisibility);
        }
      };
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppIsForeground(isForegroundState(nextState));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncNetwork = () => setNetworkOnline(browserNetworkIsOnline());
    syncNetwork();
    window.addEventListener('online', syncNetwork);
    window.addEventListener('offline', syncNetwork);
    return () => {
      window.removeEventListener('online', syncNetwork);
      window.removeEventListener('offline', syncNetwork);
    };
  }, []);

  const applyStatus = useCallback((res: PaymentLinkStatusResponse): PaymentLinkLiveStatus => {
    const incomingStatus = derivePaymentLinkLiveStatus(res);
    const currentStatus = liveStatusRef.current;
    if (shouldIgnoreStalePaymentLinkStatus(currentStatus, incomingStatus)) {
      return currentStatus ?? incomingStatus;
    }

    liveStatusRef.current = incomingStatus;
    if (mountedRef.current) setLiveStatus(incomingStatus);
    return incomingStatus;
  }, []);

  const runStripeCheck = useCallback(async (
    source: 'manual' | 'auto',
  ): Promise<PaymentLinkLiveStatus | null> => {
    if (checkInflight.current) return liveStatusRef.current;

    const currentRef = refRef.current;
    if (!hasLinkRef.current || !currentRef) {
      if (source === 'manual') {
        setError('Create or send a payment link before checking Stripe.');
      }
      return null;
    }

    if (source === 'auto') {
      if (
        !autoCheckActiveRef.current ||
        !appIsForegroundRef.current ||
        !networkOnlineRef.current ||
        !isPaymentLinkEligibleForAutoCheck(liveStatusRef.current)
      ) {
        return liveStatusRef.current;
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    checkInflight.current = true;
    setChecking(true);
    if (source === 'manual') {
      setError(null);
    } else {
      setAutoCheckError(null);
      setAutoCheckState('checking');
    }

    try {
      const res = await withStripeCheckTimeout(
        api.patch<PaymentLinkStatusResponse>(
          `/api/admin/bookings/${encodeURIComponent(currentRef)}/payment-link/check`,
          {},
          { signal: controller.signal },
        ),
        controller,
      );
      if (controller.signal.aborted) return liveStatusRef.current;

      const nextStatus = applyStatus(res);
      if (mountedRef.current) {
        setLastCheckedAtIso(new Date().toISOString());
        if (source === 'auto') {
          setAutoCheckState(isPaymentLinkTerminalStatus(nextStatus) ? 'settled' : 'watching');
        }
      }
      return nextStatus;
    } catch (err) {
      if (isAbortError(err)) return liveStatusRef.current;
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to check Stripe payment.';

      if (source === 'manual') {
        setError(message);
      } else {
        setAutoCheckError(message);
        setAutoCheckState('error');
      }
      return null;
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      checkInflight.current = false;
      if (mountedRef.current) setChecking(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!hasLink || !ref || !linkKey) {
      abortControllerRef.current?.abort();
      setAutoCheckState('idle');
      return;
    }

    if (isPaymentLinkTerminalStatus(liveStatusRef.current)) {
      setAutoCheckState('settled');
      return;
    }

    if (!autoCheckActive || !appIsForeground) {
      abortControllerRef.current?.abort();
      setAutoCheckState('paused');
      return;
    }

    if (!networkOnline) {
      abortControllerRef.current?.abort();
      setAutoCheckState('offline');
      return;
    }

    if (!isPaymentLinkEligibleForAutoCheck(liveStatusRef.current)) {
      setAutoCheckState('idle');
      return;
    }

    if (autoWindowLinkKeyRef.current !== linkKey) {
      autoWindowLinkKeyRef.current = linkKey;
      autoWindowStartedAtRef.current = Date.now();
    } else if (autoWindowStartedAtRef.current == null) {
      autoWindowStartedAtRef.current = Date.now();
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      const startedAt = autoWindowStartedAtRef.current ?? Date.now();
      autoWindowStartedAtRef.current = startedAt;
      const currentStatus = liveStatusRef.current;
      if (isPaymentLinkTerminalStatus(currentStatus)) {
        setAutoCheckState('settled');
        return;
      }
      if (!isPaymentLinkEligibleForAutoCheck(currentStatus)) {
        setAutoCheckState('idle');
        return;
      }

      const elapsedBefore = Date.now() - startedAt;
      if (elapsedBefore >= STRIPE_AUTO_CHECK_STOP_AFTER_MS) {
        setAutoCheckState('stopped');
        return;
      }

      await runStripeCheck('auto');
      if (cancelled || !mountedRef.current) return;

      const nextStatus = liveStatusRef.current;
      if (isPaymentLinkTerminalStatus(nextStatus)) {
        setAutoCheckState('settled');
        return;
      }
      if (!isPaymentLinkEligibleForAutoCheck(nextStatus)) {
        setAutoCheckState('idle');
        return;
      }

      const elapsedAfter = Date.now() - startedAt;
      if (elapsedAfter >= STRIPE_AUTO_CHECK_STOP_AFTER_MS) {
        setAutoCheckState('stopped');
        return;
      }

      const delay = getStripeAutoCheckDelayMs(elapsedAfter);
      timerRef.current = setTimeout(() => { void tick(); }, delay);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortControllerRef.current?.abort();
    };
  }, [
    appIsForeground,
    autoCheckActive,
    hasLink,
    linkKey,
    networkOnline,
    ref,
    runStripeCheck,
  ]);

  const createForDispatchedBooking = useCallback(async () => {
    if (createInflight.current) return null;
    const ref = draft.dispatchedRefNumber;
    if (!ref) {
      setError('Dispatch the booking before creating a payment link.');
      return null;
    }

    createInflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AdminPaymentLinkResponse>(
        `/api/admin/bookings/${encodeURIComponent(ref)}/payment-link`,
        {},
      );
      const paymentLink: StripePaymentLinkState = {
        kind: 'full',
        paymentUrl: res.paymentUrl,
        amountPence: res.amountPence,
        remainingBalancePence: null,
        bookingId: res.bookingId,
        refNumber: res.refNumber,
        createdAtIso: res.createdAtIso,
      };
      liveStatusRef.current = 'awaiting';
      setLiveStatus('awaiting');
      autoWindowStartedAtRef.current = null;
      setLastCheckedAtIso(null);
      setAutoCheckError(null);
      update({ paymentLink });
      return paymentLink;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to create payment link.';
      setError(message);
      return null;
    } finally {
      setBusy(false);
      createInflight.current = false;
    }
  }, [draft.dispatchedRefNumber, update]);

  const checkNow = useCallback(async (): Promise<PaymentLinkLiveStatus | null> => {
    return runStripeCheck('manual');
  }, [runStripeCheck]);

  const autoCheckMessage = useMemo(
    () => buildAutoCheckMessage({
      hasLink,
      liveStatus,
      autoCheckState,
      lastCheckedAtIso,
      autoCheckError,
    }),
    [autoCheckError, autoCheckState, hasLink, lastCheckedAtIso, liveStatus],
  );

  return {
    busy,
    checking,
    error,
    liveStatus,
    autoCheckState,
    autoCheckMessage,
    lastCheckedAtIso,
    createForDispatchedBooking,
    checkNow,
  };
}
