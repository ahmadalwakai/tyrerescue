import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssistedChatDraft } from '@/hooks/useAssistedChatDraft';
import { useAssistedChatPrice } from '@/hooks/useAssistedChatPrice';
import { useAssistedChatDispatch } from '@/hooks/useAssistedChatDispatch';
import { useAssistedChatLocationShare } from '@/hooks/useAssistedChatLocationShare';
import { useAssistedChatQuoteActions } from '@/hooks/useAssistedChatQuoteActions';
import { useTodayBookings, type TodayBookingItem } from '@/hooks/useTodayBookings';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { useDuplicateBookingWarning } from '@/hooks/useDuplicateBookingWarning';
import { useNewCustomerBookingAlert } from '@/hooks/useNewCustomerBookingAlert';
import { useBookingTracking } from '@/hooks/useBookingTracking';
import { BookingTrackingCard } from './tracking/BookingTrackingCard';
import { DriverAssignSection } from './tracking/DriverAssignSection';
import { AlertActionButton } from './ui/AlertActionButton';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  RecentCustomer,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import type { AdminQuote, AdminQuotePaymentOption, AdminQuoteStatus } from '@/types/admin-quotes';
import { LocationSection } from './LocationSection';
import { TyreSelectionSection } from './TyreSelectionSection';
import { LockingWheelNutSection } from './LockingWheelNutSection';
import { PriceSummary } from './PriceSummary';
import { CompactQuoteCard, type CompactQuoteStatus } from './quote/CompactQuoteCard';
import { EditQuotePriceModal } from './quote/EditQuotePriceModal';
import { TodayBookingsModal } from './TodayBookingsModal';
import { RecentCustomersModal } from './RecentCustomersModal';
import { DuplicateBookingWarning } from './DuplicateBookingWarning';
import { AdminQuotesModal } from './AdminQuotesModal';
import { AdminBookingsModal } from './AdminBookingsModal';
import { AdminVisitorsModal } from './AdminVisitorsModal';
import { AdminInvoicesModal } from './AdminInvoicesModal';
import { AdminStockModal } from './AdminStockModal';
import { SectionCard, FieldLabel, InlineNotice, AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { buildCustomerMessage, buildWhatsAppUrl } from '@/lib/customer-message';
import { copyToClipboard } from '@/lib/clipboard';
import { formatGbp, isValidUkPhone } from '@/lib/money';
import {
  clearAdminBadge,
  unregisterAdminPushNotifications,
  consumePendingOpenBookings,
  setPendingOpenBookings,
  getDismissedUrgentBookingId,
  setDismissedUrgentBookingId,
  addAdminNotificationResponseListener,
  type NotificationSubscription,
} from '@/lib/notifications';
import {
  ensureUrgentAlertsArmed,
  type UrgentAlertsReadinessState,
  showLocalUrgentBookingAlert,
  isUrgentBookingNotificationData,
  clearTopicSubscriptionFlag,
  openFullScreenIntentSettings,
} from '@/lib/urgent-alerts';
import { UrgentBookingPopup } from './alerts/UrgentBookingPopup';
import { NotificationReliabilityCard } from './alerts/NotificationReliabilityCard';
import {
  getAssistedChatWorkflow,
  hasAssistedChatTyre,
  normalizeAssistedChatTyreSize,
  type AssistedChatStage,
  type AssistedChatTimelineItem,
  type AssistedChatTimelineStep,
} from '@/lib/assisted-chat-workflow';
import {
  deriveOperatorWorkflowSteps,
  deriveNextBestAction,
  stageForStepId,
} from '@/lib/operator-workflow-state';
import { OperatorStepProgress } from './workflow/OperatorStepProgress';
import { NextBestActionCard } from './workflow/NextBestActionCard';

interface ParsedCallNotes {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  locationAddress?: string;
  tyreSize?: string;
  quantity?: number;
  lockingNutAnswer?: 'yes' | 'no' | 'unknown';
  lockingNutCharge?: number | null;
  paymentChoice?: AssistedChatPaymentChoice;
  driverNote?: string;
}

interface AssistedChatScreenProps {
  user?: { name: string; email: string } | null;
  onLogout?: () => void | Promise<void>;
}

interface SheetAction {
  id: string;
  label: string;
  description?: string;
  disabledReason?: string | null;
  destructive?: boolean;
  onPress: () => void | Promise<void>;
}

interface ActionNotice {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const PAYMENT_OPTIONS: ReadonlyArray<{ value: AdminQuotePaymentOption; label: string; description: string }> = [
  { value: 'DEPOSIT_15', label: 'Deposit 15%', description: 'Customer pays 15% now and the balance on arrival.' },
  { value: 'CASH_ON_ARRIVAL', label: 'Cash on arrival', description: 'Driver collects cash when the job is complete.' },
  { value: 'FULL_PAYMENT', label: 'Full payment', description: 'Customer completes the full Stripe payment.' },
  { value: 'PAYMENT_LINK', label: 'Send payment link', description: 'Send a secure payment link before dispatch.' },
];

const CONFIRMED_QUOTE_STATUSES: readonly AdminQuoteStatus[] = [
  'CONFIRMED_BY_PHONE',
  'PAYMENT_PENDING',
  'PAID',
];

const ALERT_ARM_RETRY_DELAYS_MS = [3000, 10000, 30000, 30000, 30000, 30000];

function normalizeTyreSizeFromText(text: string): string | undefined {
  const match = text.match(/\b(\d{3})\s*[\/ -]?\s*(\d{2})\s*(?:[\/ -]?\s*r\s*|[\/ -]+)(\d{2})\b/i);
  if (!match) return undefined;
  return normalizeAssistedChatTyreSize(`${match[1]}/${match[2]}/R${match[3]}`) ?? undefined;
}

function parseCallNotes(text: string): ParsedCallNotes {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const parsed: ParsedCallNotes = {};

  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) parsed.customerEmail = email;

  const phone = normalized.match(/(?:\+44\s?\d{4}|0\d{4}|01\d{3}|02\d{3})[\d\s-]{5,12}/)?.[0];
  if (phone) parsed.customerPhone = phone.replace(/\s{2,}/g, ' ').trim();

  const name = normalized.match(/\b(?:name is|customer is|customer name is)\s+([A-Za-z][A-Za-z' -]{1,42})(?=\s+(?:phone|number|email|address|at|location|tyre|size|needs|wants|payment|cash|deposit|full|locking)\b|$)/i)?.[1];
  if (name) parsed.customerName = name.trim();

  const tyreSize = normalizeTyreSizeFromText(normalized);
  if (tyreSize) parsed.tyreSize = tyreSize;

  const quantityMatch = normalized.match(/\b(?:qty|quantity|needs?|wants?|fit)\s*(?:x\s*)?(\d{1,2})\s*(?:tyres?|tires?|x)?\b/i)
    ?? normalized.match(/\bx\s*(\d{1,2})\b/i)
    ?? normalized.match(/\b(\d{1,2})\s*(?:tyres?|tires?)\b/i);
  if (quantityMatch) {
    const quantity = Number(quantityMatch[1]);
    if (Number.isFinite(quantity)) parsed.quantity = Math.max(1, Math.min(10, Math.round(quantity)));
  }

  const address = normalized.match(/\b(?:address|location|at)\s+(.+?)(?=\s+(?:phone|number|email|tyre|tire|size|needs|wants|payment|cash|deposit|full|locking|note)\b|$)/i)?.[1];
  if (address && address.length >= 5) parsed.locationAddress = address.replace(/[,. ]+$/, '').trim();

  if (/\b(?:has|with)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'yes';
  } else if (/\b(?:no|without|lost|missing|does not have|doesn't have)\s+(?:the\s+)?(?:locking\s+)?(?:wheel\s+)?nut\s+key\b/i.test(normalized)) {
    parsed.lockingNutAnswer = 'no';
  }

  const lockingCharge = normalized.match(/\b(?:locking|nut|removal)\D{0,16}(?:£|gbp)?\s*(\d{1,4}(?:\.\d{1,2})?)\b/i)?.[1];
  if (lockingCharge) {
    const charge = Number(lockingCharge);
    if (Number.isFinite(charge) && charge >= 0) {
      parsed.lockingNutAnswer = 'no';
      parsed.lockingNutCharge = Math.round(charge * 100) / 100;
    }
  }

  if (/\bdeposit\b/.test(lower)) parsed.paymentChoice = 'deposit';
  else if (/\b(?:full payment|pay full|paid full|payment link)\b/.test(lower)) parsed.paymentChoice = 'full';
  else if (/\bcash\b/.test(lower)) parsed.paymentChoice = 'cash';

  const driverNote = normalized.match(/\b(?:driver note|note)\s*[:\-]?\s+(.+)$/i)?.[1];
  if (driverNote) parsed.driverNote = driverNote.trim();

  return parsed;
}

function formatPence(pence: number): string {
  if (!Number.isFinite(pence)) return GBP.format(0);
  return GBP.format(pence / 100);
}

function getQuotePricePence(quote: AdminQuote | null, effectiveTotal: number): number {
  return quote?.priceAmount ?? Math.round(effectiveTotal * 100);
}

function getDepositSummary(priceAmountPence: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmountPence * 15) / 100);
  return { depositAmountPence, remainingBalancePence: priceAmountPence - depositAmountPence };
}

function isQuoteConfirmed(quote: AdminQuote | null): boolean {
  if (!quote) return false;
  return Boolean(
    quote.confirmedAt ||
      quote.selectedPaymentOption ||
      CONFIRMED_QUOTE_STATUSES.includes(quote.quoteStatus),
  );
}

function computeCompactQuoteStatus(args: {
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  paymentLink: StripePaymentLinkState | null;
}): CompactQuoteStatus {
  const { activeQuote, savedQuoteRef, quoteConfirmed, paymentLink } = args;
  if (activeQuote?.quoteStatus === 'PAID') return 'PAYMENT_CONFIRMED';
  if (paymentLink) return 'PAYMENT_LINK_SENT';
  if (quoteConfirmed) return 'CONFIRMED';
  if (savedQuoteRef) return 'SAVED';
  return 'NOT_SAVED';
}

function formatQuoteDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatQuoteExpiryStatus(quote: AdminQuote | null, hasSavedQuote: boolean): string | null {
  if (!hasSavedQuote) return null;
  if (!quote) return 'Valid until unknown';
  if (quote.isExpired) return 'Expired';
  const expiresAt = new Date(quote.expiresAt);
  const remainingMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || Number.isNaN(expiresAt.getTime())) return 'Valid until unknown';
  if (remainingMs <= 0) return 'Expired';
  const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));
  if (remainingMinutes < 120) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
  }
  return `Valid until ${formatQuoteDateTime(quote.expiresAt)}`;
}

function paymentOptionLabel(option: AdminQuotePaymentOption | null | undefined): string {
  if (!option) return 'Not selected';
  return PAYMENT_OPTIONS.find((item) => item.value === option)?.label ?? option;
}

function paymentChoiceLabel(choice: AssistedChatPaymentChoice | null): string {
  if (choice === 'deposit') return 'Deposit 15%';
  if (choice === 'cash') return 'Cash on arrival';
  if (choice === 'full') return 'Full payment link';
  return 'Not selected';
}

function hasDraftContent(draft: AssistedChatDraft): boolean {
  return Boolean(
    draft.customer.phone ||
      draft.customer.name ||
      draft.customer.email ||
      draft.location.address ||
      draft.location.lat != null ||
      draft.tyre.size ||
      draft.note ||
      draft.quote ||
      draft.dispatchedRefNumber,
  );
}

function buildCustomerDetails(draft: AssistedChatDraft): string {
  const lines: string[] = ['Customer details'];
  lines.push(`Name: ${draft.customer.name.trim() || 'New customer'}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.customer.email.trim()) lines.push(`Email: ${draft.customer.email.trim()}`);
  return lines.join('\n');
}

function buildLocationDetails(draft: AssistedChatDraft): string {
  const lines: string[] = ['Location details'];
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.postcode) lines.push(`Postcode: ${draft.location.postcode}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  if (draft.location.link) lines.push(`Location link: ${draft.location.link}`);
  lines.push(`Status: ${draft.location.status}`);
  return lines.join('\n');
}

function buildJobDetails(
  draft: AssistedChatDraft,
  effectiveTotal: number,
  lockingNutCharge: number,
  selectedPaymentOption: AdminQuotePaymentOption,
): string {
  const lines: string[] = ['Tyre Rescue Assisted Chat draft'];
  if (draft.customer.name.trim()) lines.push(`Customer: ${draft.customer.name.trim()}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  if (draft.tyre.size.trim()) lines.push(`Tyre size: ${draft.tyre.size.trim()}`);
  lines.push(`Quantity: ${draft.tyre.quantity}`);
  lines.push(
    `Locking wheel nut: ${
      draft.lockingNut.answer === 'yes'
        ? 'Customer has it'
        : draft.lockingNut.answer === 'no'
        ? 'Customer does not have it'
        : 'Unknown'
    }`,
  );
  if (lockingNutCharge > 0) lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
  if (draft.note.trim()) lines.push(`Driver note: ${draft.note.trim()}`);
  if (draft.quote) lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  if (draft.savedQuoteRef) lines.push(`Quote ref: ${draft.savedQuoteRef}`);
  lines.push(`Payment option: ${paymentOptionLabel(selectedPaymentOption)}`);
  if (draft.paymentLink) {
    lines.push(`Payment link: ${draft.paymentLink.paymentUrl}`);
    lines.push(`Payment link amount: ${formatPence(draft.paymentLink.amountPence)}`);
    if (draft.paymentLink.remainingBalancePence != null) {
      lines.push(`Balance on arrival: ${formatPence(draft.paymentLink.remainingBalancePence)}`);
    }
  }
  if (draft.dispatchedRefNumber) lines.push(`Booking ref: ${draft.dispatchedRefNumber}`);
  return lines.join('\n');
}

function buildPaymentMessage(paymentLink: StripePaymentLinkState, draft: AssistedChatDraft, effectiveTotal: number): string {
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? 'Your booking is ready. Please pay the 15% deposit using this secure payment link:'
      : 'Your booking is ready. Please complete the full payment using this secure payment link:',
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`Reference: ${paymentLink.refNumber}`);
  lines.push(paymentLink.kind === 'deposit' ? `Deposit due now: ${formatPence(paymentLink.amountPence)}` : `Amount due: ${formatPence(paymentLink.amountPence)}`);
  if (paymentLink.remainingBalancePence != null) lines.push(`Balance due on-site: ${formatPence(paymentLink.remainingBalancePence)}`);
  lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  if (draft.tyre.size) lines.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  return lines.join('\n');
}

function genericWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function openBookingUrl(refNumber: string): Promise<void> {
  return Linking.openURL(`${api.baseUrl}/admin/bookings/${encodeURIComponent(refNumber)}`);
}

export function AssistedChatScreen({ user, onLogout }: AssistedChatScreenProps = {}) {
  const { draft, hydrated, update, clear } = useAssistedChatDraft();
  const [noteInput, setNoteInput] = useState('');
  const [noteSynced, setNoteSynced] = useState(false);
  const [callNotesInput, setCallNotesInput] = useState('');
  const [callAssistMessage, setCallAssistMessage] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState(draft.customer.phone);
  const [phoneSynced, setPhoneSynced] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<AssistedChatStage | null>(null);
  const [mapSummaryOpen, setMapSummaryOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [editPriceOpen, setEditPriceOpen] = useState(false);
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notifSetupOpen, setNotifSetupOpen] = useState(false);
  const [alertReadinessState, setAlertReadinessState] = useState<UrgentAlertsReadinessState>('checking');
  const [fullScreenIntentGranted, setFullScreenIntentGranted] = useState<boolean>(true);
  const [armingCycle, setArmingCycle] = useState(0);

  const insets = useSafeAreaInsets();
  const bottomBarPaddingBottom = Math.max(insets.bottom + 8, 16);
  const scrollPaddingBottom = 132 + bottomBarPaddingBottom;

  // ── Push Notifications ─────────────────────────────────────────────────────

  // Register and confirm urgent alert readiness after login/app startup.
  // We keep retrying while the app is open so the operator gets an explicit
  // armed/not-armed state instead of assuming alerts are active.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (attempt: number) => {
      const retryIndex = Math.min(attempt, ALERT_ARM_RETRY_DELAYS_MS.length - 1);
      const delay = ALERT_ARM_RETRY_DELAYS_MS[retryIndex];
      retryTimer = setTimeout(() => {
        void runAttempt(attempt + 1);
      }, delay);
    };

    const runAttempt = async (attempt: number) => {
      if (cancelled) return;
      setAlertReadinessState('checking');
      const result = await ensureUrgentAlertsArmed();
      if (cancelled) return;

      setFullScreenIntentGranted(result.fullScreenIntentGranted);

      if (result.armed) {
        setAlertReadinessState('armed');
        if (__DEV__ && result.snapshot.tokenSuffix) {
          console.log(
            `[urgent-alerts] ALERT_SYSTEM_ARMED tokenSuffix=${result.snapshot.tokenSuffix}`,
          );
        }
        return;
      }

      setAlertReadinessState('not_armed');
      scheduleRetry(attempt);
    };

    if (!api.hasAdminToken) {
      setAlertReadinessState('not_armed');
      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    void runAttempt(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [armingCycle, api.hasAdminToken]);

  const handleRetryUrgentAlertArming = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (!api.hasAdminToken) return;
    if (Platform.OS === 'android' && !fullScreenIntentGranted) {
      // Deep-link directly to the per-app full-screen intent permission
      // page (Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT on API 34+,
      // falls back to app notification settings on older devices).
      void openFullScreenIntentSettings();
      setArmingCycle((v) => v + 1);
      return;
    }
    setAlertReadinessState('checking');
    setArmingCycle((v) => v + 1);
  }, [fullScreenIntentGranted]);

  // Open the bookings modal when the admin taps a notification.
  // For urgent_booking payloads we also persist a pending flag so that if
  // the tap arrives before this component is fully mounted (cold start),
  // the modal still opens on first render via the consumePendingOpenBookings
  // effect below.
  const notifResponseRef = useRef<NotificationSubscription | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    notifResponseRef.current = addAdminNotificationResponseListener((data) => {
      if (isUrgentBookingNotificationData(data)) {
        void setPendingOpenBookings();
      }
      setBookingsOpen(true);
      void clearAdminBadge();
    });
    return () => {
      notifResponseRef.current?.remove();
    };
  }, []);

  // Cold-start path: if a push notification tap stored the pending flag
  // before this screen mounted, open the bookings modal once.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const pending = await consumePendingOpenBookings();
      if (pending) {
        setBookingsOpen(true);
        void clearAdminBadge();
      }
    })();
  }, []);

  const {
    hasNewCustomerBooking,
    latestNewBooking,
    markBookingsSeen,
    triggerForegroundUrgentAlert,
  } = useNewCustomerBookingAlert();

  // Urgent in-app popup state — separate from the persistent shimmer.
  const [urgentPopupOpen, setUrgentPopupOpen] = useState(false);
  const dismissedUrgentBookingIdRef = useRef<string | null>(null);
  // Hydrated from AsyncStorage on mount so a previously acknowledged
  // urgent booking does not re-trigger the popup + sound after the
  // operator closes and reopens the app.
  const [dismissedHydrated, setDismissedHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getDismissedUrgentBookingId();
      if (cancelled) return;
      dismissedUrgentBookingIdRef.current = saved;
      setDismissedHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const urgentBookingId = latestNewBooking?.id ?? null;
  const urgentBookingIsUrgent = Boolean(latestNewBooking?.isUrgent);

  // Show the urgent popup the first time we detect a new emergency booking,
  // unless the operator has already dismissed THIS booking id or the
  // bookings modal is already open.
  useEffect(() => {
    if (!dismissedHydrated) return;
    if (!hasNewCustomerBooking) return;
    if (!urgentBookingIsUrgent || !urgentBookingId) return;
    if (bookingsOpen) return;
    if (dismissedUrgentBookingIdRef.current === urgentBookingId) return;
    setUrgentPopupOpen(true);
    void triggerForegroundUrgentAlert();
  }, [
    dismissedHydrated,
    hasNewCustomerBooking,
    urgentBookingId,
    urgentBookingIsUrgent,
    bookingsOpen,
    triggerForegroundUrgentAlert,
  ]);

  // While the popup is visible and the booking is unresolved, fire a
  // reminder alert at most every 60s (the hook itself enforces the
  // cooldown — this interval just gives it the opportunity).
  useEffect(() => {
    if (!urgentPopupOpen) return;
    const id = setInterval(() => {
      void triggerForegroundUrgentAlert();
    }, 60_000);
    return () => clearInterval(id);
  }, [urgentPopupOpen, triggerForegroundUrgentAlert]);

  // Clear the badge whenever the bookings modal is opened.
  useEffect(() => {
    if (bookingsOpen) {
      void clearAdminBadge();
      setUrgentPopupOpen(false);
      // Persist this booking id as acknowledged so reopening the app
      // does not bring the popup back. We keep the local ref in sync.
      if (urgentBookingId) {
        dismissedUrgentBookingIdRef.current = urgentBookingId;
        void setDismissedUrgentBookingId(urgentBookingId);
      }
      // Also clear the visual "new booking" alert on the toolbar button
      // regardless of how the modal was opened (push tap, More-actions, etc.).
      void markBookingsSeen();
    }
  }, [bookingsOpen, markBookingsSeen, urgentBookingId]);

  const handleUrgentOpenBookings = useCallback(() => {
    setUrgentPopupOpen(false);
    if (urgentBookingId) {
      dismissedUrgentBookingIdRef.current = urgentBookingId;
      void setDismissedUrgentBookingId(urgentBookingId);
    }
    void markBookingsSeen();
    setBookingsOpen(true);
  }, [markBookingsSeen, urgentBookingId]);

  const handleUrgentDismiss = useCallback(() => {
    // Close the popup but keep the All-bookings red shimmer active until
    // the operator actually opens the bookings list. Persist so the
    // popup + sound do not return when the app is reopened.
    setUrgentPopupOpen(false);
    if (urgentBookingId) {
      dismissedUrgentBookingIdRef.current = urgentBookingId;
      void setDismissedUrgentBookingId(urgentBookingId);
    }
  }, [urgentBookingId]);

  // Clear badge when app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void clearAdminBadge();
    });
    return () => sub.remove();
  }, []);

  // Unregister on logout.
  const handleLogout = useCallback(async () => {
    await unregisterAdminPushNotifications();
    await clearTopicSubscriptionFlag();
    setAlertReadinessState('not_armed');
    await onLogout?.();
  }, [onLogout]);

  const alertReadinessLabel =
    alertReadinessState === 'checking'
      ? 'Checking urgent alerts...'
      : alertReadinessState === 'armed'
      ? 'Urgent alerts armed'
      : !fullScreenIntentGranted
      ? 'Full-screen alerts blocked'
      : 'Urgent alerts not armed';

  const canRetryAlertArming =
    Platform.OS !== 'web' && api.hasAdminToken && alertReadinessState !== 'checking';

  // ──────────────────────────────────────────────────────────────────────────

  if (hydrated && !noteSynced) {
    setNoteSynced(true);
    setNoteInput(draft.note);
  }

  if (hydrated && !phoneSynced) {
    setPhoneSynced(true);
    setPhoneInput(draft.customer.phone);
  }

  const lockingNutCharge =
    draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const baseTotal = draft.quote?.total ?? 0;
  const engineEffectiveTotal = baseTotal + lockingNutCharge;
  // When the operator has typed a manual final price, that overrides the
  // engine total everywhere the customer-facing price is used (display,
  // saved quote priceAmount, finalize adjustment). Locking nut is absorbed
  // into the manual figure to avoid double counting.
  const effectiveTotal = draft.manualPriceGbp != null ? draft.manualPriceGbp : engineEffectiveTotal;

  const price = useAssistedChatPrice({ draft, update });
  const locationShare = useAssistedChatLocationShare({ draft, update });
  const quoteActions = useAssistedChatQuoteActions({ draft, update, effectiveTotal, lockingNutCharge });
  const todayBookings = useTodayBookings();
  const recentCustomers = useRecentCustomers();
  const duplicateMatch = useDuplicateBookingWarning({
    draft,
    todayBookings: todayBookings.items,
    recentCustomers: recentCustomers.items,
  });

  const activeQuote = draft.savedQuoteId && quoteActions.currentQuote?.id === draft.savedQuoteId
    ? quoteActions.currentQuote
    : null;
  const savedQuoteRef = activeQuote?.quoteRef ?? draft.savedQuoteRef;
  const quoteConfirmed = isQuoteConfirmed(activeQuote);
  const quotePricePence = getQuotePricePence(activeQuote, effectiveTotal);
  const selectedPaymentOption = activeQuote?.selectedPaymentOption ?? quoteActions.selectedPaymentOption;
  const quoteExpiryStatus = formatQuoteExpiryStatus(activeQuote, Boolean(savedQuoteRef));

  const handleBookingCreated = useCallback(
    ({
      response,
      paymentChoice,
      effectiveTotal: total,
      paymentLink,
    }: {
      response: { bookingId: string; refNumber: string };
      paymentChoice: AssistedChatPaymentChoice;
      effectiveTotal: number;
      paymentLink: StripePaymentLinkState | null;
    }) => {
      if (!response.refNumber) return;
      const item: TodayBookingItem = {
        bookingReference: response.refNumber,
        bookingId: response.bookingId,
        createdAtIso: new Date().toISOString(),
        paymentChoice,
        totalPence: Number.isFinite(total) ? Math.round(total * 100) : undefined,
        paymentLink: paymentLink?.paymentUrl,
        customerPhone: draft.customer.phone || undefined,
        customerAddress: draft.location.address || undefined,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
      };
      todayBookings.addBooking(item);
      recentCustomers.saveCustomer({
        customerPhone: draft.customer.phone || undefined,
        customerName: draft.customer.name || undefined,
        customerEmail: draft.customer.email || undefined,
        customerAddress: draft.location.address || undefined,
        lat: draft.location.lat,
        lng: draft.location.lng,
        postcode: draft.location.postcode,
        tyreSize: draft.tyre.size || undefined,
        quantity: draft.tyre.quantity,
        note: draft.note || undefined,
        lastUsedAtIso: new Date().toISOString(),
        lastBookingReference: response.refNumber,
      });
    },
    [draft, recentCustomers, todayBookings],
  );

  const dispatch = useAssistedChatDispatch({
    draft,
    update,
    lockingNutCharge,
    onBookingCreated: handleBookingCreated,
  });

  // Live tracking session for the dispatched booking. Hook is a no-op when
  // dispatchedBookingId is null; auto-ensures (idempotent) the first time we
  // see a booking id, then polls /tracking every 8s.
  const bookingTracking = useBookingTracking({ bookingId: draft.dispatchedBookingId });
  // Phone number of the driver selected by the operator in DriverAssignSection.
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string | null>(null);

  const workflow = useMemo(
    () => getAssistedChatWorkflow({
      draft,
      quoteStatus: activeQuote?.quoteStatus ?? null,
      quoteConfirmedAt: activeQuote?.confirmedAt ?? null,
      quoteSelectedPaymentOption: activeQuote?.selectedPaymentOption ?? null,
      quoteExpired: activeQuote?.isExpired ?? false,
      quoteBusy: quoteActions.busy !== null,
      priceLoading: price.loading,
      dispatchBusy: dispatch.busy,
      canUseApi: api.hasAdminToken,
    }),
    [activeQuote, dispatch.busy, draft, price.loading, quoteActions.busy],
  );

  const activeStage = editingStage ?? workflow.currentStage;
  const hasLocation = draft.location.lat != null && draft.location.lng != null;
  const hasTyre = hasAssistedChatTyre(draft);
  const customerName = draft.customer.name.trim() || 'New customer';
  const customerPhone = draft.customer.phone.trim();
  const customerMessage = buildCustomerMessage({ draft, effectiveTotal, paymentChoice: draft.paymentChoice });
  const draftHasContent = hasDraftContent(draft);

  const flashNotice = useCallback((notice: ActionNotice) => {
    setActionNotice(notice);
    setTimeout(() => setActionNotice(null), 2200);
  }, []);

  const handleClear = useCallback(() => {
    clear();
    setNoteInput('');
    setCallNotesInput('');
    setCallAssistMessage(null);
    setNoteSynced(false);
    setPhoneInput('');
    setPhoneSynced(false);
    setDuplicateAck(false);
    setEditingStage(null);
    setMapSummaryOpen(false);
    quoteActions.setMessage(null);
    locationShare.setMessage(null);
  }, [clear, locationShare, quoteActions]);

  const handlePhoneBlur = useCallback(() => {
    update({ customer: { ...draft.customer, phone: phoneInput.trim() } });
  }, [draft.customer, phoneInput, update]);

  const customerWhatsAppNumber = useMemo(() => {
    const raw = draft.customer.phone ?? '';
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return null;
    if (raw.trim().startsWith('+')) return digits;
    if (digits.startsWith('44')) return digits;
    if (digits.startsWith('0')) return `44${digits.slice(1)}`;
    return digits;
  }, [draft.customer.phone]);

  const customerDialNumber = useMemo(() => {
    const raw = (draft.customer.phone ?? '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    return cleaned || null;
  }, [draft.customer.phone]);

  const handleOpenWhatsApp = useCallback(async () => {
    if (!customerWhatsAppNumber) return;
    const url = buildWhatsAppUrl(draft.customer.phone, customerMessage) ?? `https://wa.me/${customerWhatsAppNumber}`;
    try {
      await Linking.openURL(url);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not open WhatsApp.' });
    }
  }, [customerMessage, customerWhatsAppNumber, draft.customer.phone, flashNotice]);

  const handleCallCustomer = useCallback(async () => {
    if (!customerDialNumber) return;
    try {
      await Linking.openURL(`tel:${customerDialNumber}`);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not start the call.' });
    }
  }, [customerDialNumber, flashNotice]);

  const handleUseRecent = useCallback(
    (item: RecentCustomer) => {
      update({
        customer: {
          phone: item.customerPhone ?? '',
          name: item.customerName ?? '',
          email: item.customerEmail ?? '',
        },
        location: {
          method: 'address',
          address: item.customerAddress ?? '',
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          postcode: item.postcode ?? null,
          link: null,
          whatsappLink: null,
          status: item.lat != null && item.lng != null ? 'received' : 'idle',
        },
        tyre: {
          size: item.tyreSize ?? '',
          quantity: item.quantity ?? 1,
        },
        note: item.note ?? '',
        quickBookingId: null,
        quote: null,
        priceNeedsRefresh: false,
        savedQuoteId: null,
        savedQuoteRef: null,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
      setPhoneInput(item.customerPhone ?? '');
      setNoteInput(item.note ?? '');
      setRecentOpen(false);
      setDuplicateAck(false);
      setEditingStage(null);
    },
    [update],
  );

  const handleUseQuote = useCallback(
    (quote: AdminQuote) => {
      const total = quote.priceAmount / 100;
      update({
        customer: {
          phone: quote.customerPhone ?? '',
          name: quote.customerName ?? '',
          email: draft.customer.email,
        },
        location: {
          method: 'address',
          address: quote.address ?? '',
          lat: quote.latitude,
          lng: quote.longitude,
          postcode: quote.postcode,
          link: null,
          whatsappLink: null,
          status: quote.latitude != null && quote.longitude != null ? 'received' : 'idle',
        },
        tyre: {
          size: quote.tyreSize ?? '',
          quantity: quote.quantity,
        },
        lockingNut: {
          answer:
            quote.lockingWheelNutStatus === 'yes' || quote.lockingWheelNutStatus === 'no'
              ? quote.lockingWheelNutStatus
              : 'unknown',
          chargeGbp: quote.lockingWheelNutChargePence ? quote.lockingWheelNutChargePence / 100 : null,
        },
        quickBookingId: quote.quickBookingId,
        savedQuoteId: quote.id,
        savedQuoteRef: quote.quoteRef,
        note: quote.internalNotes ?? '',
        quote: {
          subtotal: total,
          vatAmount: 0,
          total,
          lineItems: [{ label: `Saved quote ${quote.quoteRef}`, amount: total, type: 'quote' }],
          distanceKm: null,
          serviceOrigin: null,
        },
        priceNeedsRefresh: quote.isExpired,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
        dispatchedBookingId: null,
      });
      quoteActions.acceptExternalQuote(quote);
      setPhoneInput(quote.customerPhone ?? '');
      setNoteInput(quote.internalNotes ?? '');
      setQuotesOpen(false);
      setDuplicateAck(false);
      setEditingStage(null);
    },
    [draft.customer.email, quoteActions, update],
  );

  const handleApplyCallNotes = useCallback(() => {
    const parsed = parseCallNotes(callNotesInput);
    const applied: string[] = [];
    const patch: Partial<AssistedChatDraft> = {};

    if (parsed.customerName || parsed.customerPhone || parsed.customerEmail) {
      patch.customer = {
        ...draft.customer,
        ...(parsed.customerName ? { name: parsed.customerName } : {}),
        ...(parsed.customerPhone ? { phone: parsed.customerPhone } : {}),
        ...(parsed.customerEmail ? { email: parsed.customerEmail } : {}),
      };
      if (parsed.customerName) applied.push('name');
      if (parsed.customerPhone) applied.push('phone');
      if (parsed.customerEmail) applied.push('email');
    }

    if (parsed.locationAddress) {
      patch.location = {
        ...draft.location,
        method: 'address',
        address: parsed.locationAddress,
        lat: null,
        lng: null,
        postcode: null,
        link: null,
        whatsappLink: null,
        status: 'idle',
      };
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentChoice = null;
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
      applied.push('address text');
    }

    if (parsed.tyreSize || parsed.quantity) {
      patch.tyre = {
        ...draft.tyre,
        ...(parsed.tyreSize ? { size: parsed.tyreSize } : {}),
        ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
      };
      if (parsed.tyreSize) applied.push('tyre size');
      if (parsed.quantity) applied.push('quantity');
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
    }

    if (parsed.lockingNutAnswer) {
      patch.lockingNut = {
        answer: parsed.lockingNutAnswer,
        chargeGbp: parsed.lockingNutAnswer === 'no' ? parsed.lockingNutCharge ?? draft.lockingNut.chargeGbp : null,
      };
      applied.push('locking nut');
    }

    if (parsed.paymentChoice && draft.quote) {
      patch.paymentChoice = parsed.paymentChoice;
      applied.push('payment choice');
    }

    if (parsed.driverNote) {
      const nextNote = draft.note.trim() ? `${draft.note.trim()}\n${parsed.driverNote}` : parsed.driverNote;
      patch.note = nextNote;
      setNoteInput(nextNote);
      applied.push('driver note');
    }

    if (applied.length === 0) {
      setCallAssistMessage('No obvious details found. Try including a phone, address, tyre size, quantity, or payment word.');
      return;
    }

    if (parsed.customerPhone) setPhoneInput(parsed.customerPhone);
    update(patch);
    setDuplicateAck(false);
    setCallAssistMessage(`Applied: ${applied.join(', ')}.`);
  }, [callNotesInput, draft, update]);

  const handleCopyCustomerDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildCustomerDetails(draft));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Customer details copied.' : 'Could not copy customer details.' });
  }, [draft, flashNotice]);

  const handleCopyLocationDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildLocationDetails(draft));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Location details copied.' : 'Could not copy location details.' });
  }, [draft, flashNotice]);

  const handleCopyJobDetails = useCallback(async () => {
    const ok = await copyToClipboard(buildJobDetails(draft, effectiveTotal, lockingNutCharge, selectedPaymentOption));
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Job details copied.' : 'Could not copy job details.' });
  }, [draft, effectiveTotal, flashNotice, lockingNutCharge, selectedPaymentOption]);

  const handleCopyCustomerMessage = useCallback(async () => {
    const ok = await copyToClipboard(customerMessage);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Customer message copied.' : 'Could not copy customer message.' });
  }, [customerMessage, flashNotice]);

  const handleCopyPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    const ok = await copyToClipboard(draft.paymentLink.paymentUrl);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Payment link copied.' : 'Could not copy payment link.' });
  }, [draft.paymentLink, flashNotice]);

  const handleOpenPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    try {
      await Linking.openURL(draft.paymentLink.paymentUrl);
    } catch {
      flashNotice({ kind: 'err', text: 'Could not open payment link.' });
    }
  }, [draft.paymentLink, flashNotice]);

  const handleWhatsAppPaymentLink = useCallback(async () => {
    if (!draft.paymentLink) return;
    const message = buildPaymentMessage(draft.paymentLink, draft, effectiveTotal);
    const url = buildWhatsAppUrl(draft.customer.phone, message) ?? genericWhatsAppUrl(message);
    try {
      await Linking.openURL(url);
    } catch {
      const ok = await copyToClipboard(message);
      flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Payment message copied.' : 'Could not open WhatsApp.' });
    }
  }, [draft, effectiveTotal, flashNotice]);

  const handleOpenMaps = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://www.google.com/maps?q=${draft.location.lat},${draft.location.lng}`);
  }, [draft.location.lat, draft.location.lng]);

  const handleOpenDirections = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`,
    );
  }, [draft.location.lat, draft.location.lng]);

  const handleOpenWaze = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://waze.com/ul?ll=${draft.location.lat},${draft.location.lng}&navigate=yes`);
  }, [draft.location.lat, draft.location.lng]);

  const handleCopyRoute = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`;
    const ok = await copyToClipboard(routeUrl);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Route link copied.' : 'Could not copy route link.' });
  }, [draft.location.lat, draft.location.lng, flashNotice]);

  const handleCopyCoords = useCallback(async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    const ok = await copyToClipboard(`${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
    flashNotice({ kind: ok ? 'ok' : 'err', text: ok ? 'Coordinates copied.' : 'Could not copy coordinates.' });
  }, [draft.location.lat, draft.location.lng, flashNotice]);

  const handleReviewDispatch = useCallback(() => {
    setReviewOpen(true);
  }, []);

  const handleSendToDriver = useCallback(() => {
    if (!draft.paymentChoice) return;
    setReviewOpen(false);
    dispatch.choosePaymentAndDispatch(draft.paymentChoice);
  }, [dispatch, draft.paymentChoice]);

  const handlePrimaryAction = useCallback(async () => {
    if (editingStage) {
      setEditingStage(null);
      return;
    }

    if (workflow.primaryActionDisabled) return;

    if (workflow.currentStage === 'CUSTOMER') {
      setEditingStage('LOCATION');
      return;
    }

    if (workflow.currentStage === 'LOCATION') {
      const method = draft.customer.phone.trim()
        ? 'whatsapp'
        : draft.customer.email.trim()
        ? 'email'
        : 'copy';
      await locationShare.requestLink(method);
      return;
    }

    if (workflow.currentStage === 'PRICE') {
      await price.getPrice();
      return;
    }

    if (workflow.currentStage === 'QUOTE') {
      await quoteActions.saveQuote();
      return;
    }

    if (workflow.currentStage === 'CONFIRMATION') {
      await quoteActions.confirmQuote();
      return;
    }

    if (workflow.currentStage === 'PAYMENT') {
      setEditingStage('PAYMENT');
      return;
    }

    if (workflow.currentStage === 'READY_TO_DISPATCH') {
      handleReviewDispatch();
      return;
    }

    if (workflow.currentStage === 'DISPATCHED' && draft.dispatchedRefNumber) {
      await openBookingUrl(draft.dispatchedRefNumber).catch(() => {
        flashNotice({ kind: 'err', text: 'Could not open booking.' });
      });
    }
  }, [draft, editingStage, flashNotice, handleReviewDispatch, locationShare, price, quoteActions, workflow]);

  const sheetActions = useMemo<SheetAction[]>(() => {
    const actions: SheetAction[] = [];
    const locationShareRelevant = !hasLocation || draft.location.status === 'pending' || Boolean(draft.location.link);
    const noToken = api.hasAdminToken ? null : 'Log in again before using admin actions.';

    if (locationShareRelevant) {
      actions.push(
        {
          id: 'copy-location-link',
          label: 'Copy location link',
          description: 'Generate or copy the customer location request.',
          disabledReason: noToken,
          onPress: () => locationShare.requestLink('copy'),
        },
        {
          id: 'location-whatsapp',
          label: 'Send via WhatsApp',
          description: 'Open WhatsApp with the location request.',
          disabledReason: noToken ?? (!draft.customer.phone.trim() ? 'Add a customer phone number first.' : null),
          onPress: () => locationShare.requestLink('whatsapp'),
        },
        {
          id: 'location-sms',
          label: 'Send via SMS',
          description: 'Send the location request by SMS.',
          disabledReason: noToken ?? (!isValidUkPhone(draft.customer.phone) ? 'Add a valid UK phone number first.' : null),
          onPress: () => locationShare.requestLink('sms'),
        },
        {
          id: 'location-email',
          label: 'Send via Email',
          description: 'Email the location request to the customer.',
          disabledReason: noToken ?? (!draft.customer.email.trim() ? 'Add a customer email first.' : null),
          onPress: () => locationShare.requestLink('email'),
        },
      );
    }

    if (hasLocation) {
      actions.push(
        { id: 'open-maps', label: 'Open Google Maps', description: 'Open the customer pin.', onPress: handleOpenMaps },
        { id: 'open-directions', label: 'Open Directions', description: 'Open garage to customer directions.', onPress: handleOpenDirections },
        { id: 'open-waze', label: 'Open Waze', description: 'Open Waze navigation.', onPress: handleOpenWaze },
        { id: 'copy-route', label: 'Copy route link', description: 'Copy a Google Maps directions link.', onPress: handleCopyRoute },
        { id: 'copy-coords', label: 'Copy coordinates', description: 'Copy the customer coordinates.', onPress: handleCopyCoords },
      );
    }

    actions.push(
      {
        id: 'copy-quote-message',
        label: 'Copy quote message',
        description: 'Copy the saved quote or confirmation message.',
        disabledReason: draft.quote ? null : 'Get a price before copying a quote message.',
        onPress: quoteActions.copyConfirmedMessage,
      },
      {
        id: 'send-quote',
        label: 'Send quote',
        description: 'Save if needed, then open WhatsApp and copy the quote.',
        disabledReason: draft.quote ? null : 'Get a price before sending a quote.',
        onPress: quoteActions.sendQuote,
      },
      {
        id: 'copy-customer-message',
        label: 'Copy customer message',
        description: 'Copy the current booking message.',
        disabledReason: draft.quote || draft.dispatchedRefNumber ? null : 'Get a price before copying the customer message.',
        onPress: handleCopyCustomerMessage,
      },
      {
        id: 'send-customer-whatsapp',
        label: 'Send customer WhatsApp',
        description: 'Open WhatsApp with the current booking message.',
        disabledReason: draft.customer.phone.trim() ? null : 'Add a customer phone number first.',
        onPress: handleOpenWhatsApp,
      },
      {
        id: 'copy-job-details',
        label: 'Copy job details',
        description: 'Copy customer, tyre, price, payment, and note details.',
        disabledReason: draftHasContent ? null : 'There is no draft to copy yet.',
        onPress: handleCopyJobDetails,
      },
    );

    if (quoteActions.selectedPaymentOption === 'PAYMENT_LINK' || quoteActions.confirmResult?.paymentInstruction) {
      actions.push({
        id: 'copy-payment-instructions',
        label: 'Copy payment instructions',
        description: 'Copy the saved quote payment instruction.',
        disabledReason: draft.quote ? null : 'Get a price before copying payment instructions.',
        onPress: quoteActions.copyPaymentInstruction,
      });
    }

    if (draft.paymentLink) {
      actions.push(
        { id: 'copy-payment-link', label: 'Copy payment link', description: 'Copy the Stripe payment link.', onPress: handleCopyPaymentLink },
        { id: 'open-payment-link', label: 'Open payment link', description: 'Open the Stripe payment link.', onPress: handleOpenPaymentLink },
        { id: 'whatsapp-payment-link', label: 'WhatsApp payment link', description: 'Send the payment link to the customer.', onPress: handleWhatsAppPaymentLink },
      );
    }

    actions.push({
      id: 'admin-bookings',
      label: 'All bookings',
      description: 'Browse, search, and filter all admin bookings.',
      disabledReason: noToken,
      onPress: () => setBookingsOpen(true),
    });

    actions.push({
      id: 'admin-visitors',
      label: '🌐 Visitors',
      description: 'Real-time visitor analytics and live feed.',
      disabledReason: noToken,
      onPress: () => setVisitorsOpen(true),
    });

    actions.push({
      id: 'admin-invoices',
      label: '📄 Invoices',
      description: 'Browse, send, and manage customer invoices.',
      disabledReason: noToken,
      onPress: () => setInvoicesOpen(true),
    });

    actions.push({
      id: 'admin-stock',
      label: '🛞 Stock',
      description: 'Manage tyre stock levels, prices and availability.',
      disabledReason: noToken,
      onPress: () => setStockOpen(true),
    });

    actions.push({
      id: 'notification-setup',
      label: 'Notification setup',
      description: 'Check urgent alert status and open notification settings.',
      onPress: () => { setMoreOpen(false); setNotifSetupOpen(true); },
    });

    if (__DEV__ && urgentBookingId) {
      actions.push({
        id: 'test-urgent-alert',
        label: 'Test urgent alert (dev)',
        description: 'Trigger a local urgent booking alert for the current booking.',
        onPress: () => {
          void showLocalUrgentBookingAlert({ bookingId: urgentBookingId });
        },
      });
    }

    actions.push({
      id: 'clear-draft',
      label: 'Clear draft',
      description: 'Reset this operator workflow.',
      disabledReason: draftHasContent ? null : 'Draft is already empty.',
      destructive: true,
      onPress: handleClear,
    });

    if (onLogout) {
      actions.push({
        id: 'logout',
        label: 'Log out',
        description: 'End this admin session.',
        onPress: () => {
          void handleLogout();
        },
      });
    }

    return actions;
  }, [
    draft,
    draftHasContent,
    handleClear,
    handleCopyCoords,
    handleCopyCustomerMessage,
    handleCopyJobDetails,
    handleCopyPaymentLink,
    handleCopyRoute,
    handleOpenDirections,
    handleOpenMaps,
    handleOpenPaymentLink,
    handleOpenWaze,
    handleOpenWhatsApp,
    handleWhatsAppPaymentLink,
    hasLocation,
    locationShare,
    handleLogout,
    onLogout,
    quoteActions,
    urgentBookingId,
  ]);

  const primaryLabel = editingStage ? 'Done Editing' : workflow.primaryActionLabel;
  const primaryDisabled = editingStage ? false : workflow.primaryActionDisabled;
  const primaryDisabledReason = editingStage ? null : workflow.primaryActionDisabledReason;
  const stageTitle = editingStage ? `Editing ${stageLabel(editingStage)}` : stageLabel(workflow.currentStage);

  const handleSelectTimelineStep = (step: AssistedChatTimelineStep) => {
    const targetStage = stageForTimelineStep(step, { quoteConfirmed });
    const blockedReason = blockedReasonForStage(targetStage, {
      hasCustomerDetails: Boolean(draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim()),
      hasLocation,
      hasTyre,
      hasPrice: Boolean(draft.quote && !draft.priceNeedsRefresh),
      hasSavedQuote: Boolean(savedQuoteRef),
      quoteConfirmed,
      hasPaymentChoice: Boolean(draft.paymentChoice),
    });
    setEditingStage(targetStage);
    if (blockedReason) {
      flashNotice({ kind: 'info', text: blockedReason });
    } else {
      setActionNotice(null);
    }
  };

  // Operator workflow projection: shared progress/next-action state derived
  // from the existing draft + workflow + quote/dispatch flags. Keeps the new
  // OperatorStepProgress + NextBestActionCard in lockstep with the legacy
  // Timeline/SummaryCard stack without changing any backend behaviour.
  const hasPrice = Boolean(draft.quote && !draft.priceNeedsRefresh);
  const hasSavedQuote = Boolean(savedQuoteRef);
  const operatorDerivationInput = {
    draft,
    activeStage,
    hasLocation,
    hasTyre,
    hasPrice,
    priceLoading: price.loading,
    hasSavedQuote,
    quoteConfirmed,
    dispatchBusy: dispatch.busy,
    locationPolling: locationShare.isPolling,
    hasDispatched: Boolean(draft.dispatchedRefNumber),
    hasPaymentLink: Boolean(draft.paymentLink),
  };
  const operatorSteps = useMemo(
    () => deriveOperatorWorkflowSteps(operatorDerivationInput),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeStage,
      draft,
      hasLocation,
      hasTyre,
      hasPrice,
      hasSavedQuote,
      quoteConfirmed,
      price.loading,
      dispatch.busy,
      locationShare.isPolling,
    ],
  );
  const activeOperatorStepId = useMemo(() => {
    // Reuse the same mapping the chip uses for the active stage so the
    // highlighted chip always matches the open SectionCard.
    switch (activeStage) {
      case 'CUSTOMER':
        return 'customer' as const;
      case 'LOCATION':
        return 'location' as const;
      case 'TYRE':
        return draft.lockingNut.answer === 'unknown' && hasTyre ? ('lockingNut' as const) : ('tyre' as const);
      case 'PRICE':
      case 'QUOTE':
      case 'CONFIRMATION':
        return 'quote' as const;
      case 'PAYMENT':
        return 'payment' as const;
      case 'READY_TO_DISPATCH':
      case 'DISPATCHED':
        return 'dispatch' as const;
    }
  }, [activeStage, draft.lockingNut.answer, hasTyre]);
  const nextBestAction = useMemo(
    () =>
      deriveNextBestAction({
        ...operatorDerivationInput,
        primaryActionLabel: primaryLabel,
        primaryActionDisabled: primaryDisabled,
        primaryActionDisabledReason: primaryDisabledReason,
        onPrimaryPress: handlePrimaryAction,
        primaryLoading: price.loading || dispatch.busy || quoteActions.busy !== null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeStage,
      draft,
      hasLocation,
      hasTyre,
      hasPrice,
      hasSavedQuote,
      quoteConfirmed,
      price.loading,
      dispatch.busy,
      locationShare.isPolling,
      primaryLabel,
      primaryDisabled,
      primaryDisabledReason,
      handlePrimaryAction,
      quoteActions.busy,
    ],
  );

  const handleSelectOperatorStep = useCallback(
    (stepId: typeof operatorSteps[number]['id']) => {
      const targetStage = stageForStepId(stepId, {
        quoteConfirmed,
        hasPrice,
        hasSavedQuote,
      });
      const blockedReason = blockedReasonForStage(targetStage, {
        hasCustomerDetails: Boolean(
          draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim(),
        ),
        hasLocation,
        hasTyre,
        hasPrice,
        hasSavedQuote,
        quoteConfirmed,
        hasPaymentChoice: Boolean(draft.paymentChoice),
      });
      setEditingStage(targetStage);
      if (blockedReason) {
        flashNotice({ kind: 'info', text: blockedReason });
      } else {
        setActionNotice(null);
      }
    },
    [draft, flashNotice, hasLocation, hasPrice, hasSavedQuote, hasTyre, quoteConfirmed],
  );

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Assisted Chat</Text>
          <Text style={styles.headerCustomer} numberOfLines={1}>{customerName}</Text>
          <Text style={styles.headerPhone} numberOfLines={1}>{customerPhone || (user?.name ? `Signed in as ${user.name}` : 'No phone added')}</Text>
          <Pressable
            onPress={canRetryAlertArming ? handleRetryUrgentAlertArming : undefined}
            accessibilityRole="button"
            accessibilityLabel="Urgent alert readiness"
            style={({ pressed }) => [
              styles.alertReadinessPill,
              alertReadinessState === 'armed'
                ? styles.alertReadinessPillArmed
                : alertReadinessState === 'not_armed'
                ? styles.alertReadinessPillNotArmed
                : null,
              pressed && canRetryAlertArming && styles.alertReadinessPillPressed,
            ]}
          >
            <Text style={styles.alertReadinessText}>{alertReadinessLabel}</Text>
            {alertReadinessState === 'not_armed' ? (
              <Text style={styles.alertReadinessRetryText}>
                {!fullScreenIntentGranted ? 'Tap to grant permission' : 'Tap to retry'}
              </Text>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{stageTitle}</Text>
          </View>
          <View style={styles.headerContactRow}>
            <Pressable
              onPress={customerDialNumber ? handleCallCustomer : undefined}
              disabled={!customerDialNumber}
              accessibilityRole="button"
              accessibilityLabel="Call customer"
              style={({ pressed }) => [
                styles.compactContactButton,
                styles.callButton,
                pressed && customerDialNumber && styles.contactButtonPressed,
                !customerDialNumber && styles.contactButtonDisabled,
              ]}
            >
              <Text style={styles.compactContactLabel}>Call</Text>
            </Pressable>
            <Pressable
              onPress={customerWhatsAppNumber ? handleOpenWhatsApp : undefined}
              disabled={!customerWhatsAppNumber}
              accessibilityRole="button"
              accessibilityLabel="Open WhatsApp chat with customer"
              style={({ pressed }) => [
                styles.compactContactButton,
                styles.whatsappButton,
                pressed && customerWhatsAppNumber && styles.contactButtonPressed,
                !customerWhatsAppNumber && styles.contactButtonDisabled,
              ]}
            >
              <Text style={styles.compactContactLabel}>WA</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollPaddingBottom }]} keyboardShouldPersistTaps="handled">
        {!api.hasAdminToken ? <InlineNotice kind="warn">No admin token. Log in to enable API calls.</InlineNotice> : null}
        {actionNotice ? <StatusBanner kind={actionNotice.kind} message={actionNotice.text} /> : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind === 'ok' ? 'ok' : quoteActions.message.kind === 'err' ? 'err' : 'info'} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}

        <View style={styles.toolRow}>
          <AppButton label={`Bookings ${todayBookings.count}`} variant="secondary" onPress={() => setHistoryOpen(true)} style={styles.toolButton} />
          <AlertActionButton
            label="All bookings"
            active={hasNewCustomerBooking}
            badgeLabel="New"
            onPress={() => {
              markBookingsSeen();
              setBookingsOpen(true);
            }}
            style={styles.toolButton}
            testID="all-bookings-alert-button"
          />
          <AppButton label="Recent customers" variant="secondary" onPress={() => setRecentOpen(true)} style={styles.toolButton} />
          <AppButton label="Quotes" variant="secondary" onPress={() => setQuotesOpen(true)} style={styles.toolButton} />
        </View>

        <NextBestActionCard
          title={nextBestAction.title}
          body={nextBestAction.body}
          status={nextBestAction.status}
          // Suppress the duplicate CTA when the next-best step is already the
          // active section: the bottom bar (and the section itself) already
          // expose the same primary action, so the card becomes guidance-only.
          primaryLabel={nextBestAction.id === activeOperatorStepId ? undefined : nextBestAction.primaryLabel}
          onPrimaryPress={nextBestAction.id === activeOperatorStepId ? undefined : nextBestAction.onPrimaryPress}
          loading={nextBestAction.loading}
          disabled={nextBestAction.disabled}
          disabledReason={primaryDisabledReason ?? undefined}
        />

        <OperatorStepProgress
          steps={operatorSteps}
          activeStepId={activeOperatorStepId}
          onStepPress={handleSelectOperatorStep}
        />

        <View style={styles.summaryStack}>
          <SummaryCard
            title="Customer"
            value={customerName}
            detail={customerPhone || draft.customer.email || 'No contact details yet'}
            done={Boolean(draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim())}
            active={activeStage === 'CUSTOMER'}
            onPress={() => setEditingStage('CUSTOMER')}
            onLongPress={handleCopyCustomerDetails}
          />
          {hasLocation || draft.location.status === 'pending' ? (
            <SummaryCard
              title="Location"
              value={hasLocation ? 'Confirmed' : 'Waiting for share'}
              detail={draft.location.address || draft.location.link || 'Location link sent'}
              done={hasLocation}
              active={activeStage === 'LOCATION'}
              onPress={() => setEditingStage('LOCATION')}
              onLongPress={handleCopyLocationDetails}
              rightLabel={hasLocation ? (mapSummaryOpen ? 'Hide map' : 'Show map') : undefined}
              onRightPress={hasLocation ? () => setMapSummaryOpen((value) => !value) : undefined}
            />
          ) : null}
          {hasLocation && mapSummaryOpen && activeStage !== 'LOCATION' ? (
            <LocationSection draft={draft} update={update} locationShare={locationShare} showInlineActions={false} displayMode="mapOnly" />
          ) : null}
          {hasTyre ? (
            <SummaryCard
              title="Tyre"
              value={`${draft.tyre.size} x ${draft.tyre.quantity}`}
              detail={draft.lockingNut.answer === 'no' ? 'Locking wheel nut removal may apply' : 'Tyre details ready'}
              done
              active={activeStage === 'TYRE'}
              onPress={() => setEditingStage('TYRE')}
            />
          ) : null}
          {draft.quote && !draft.priceNeedsRefresh ? (
            <SummaryCard
              title="Price"
              value={formatGbp(effectiveTotal)}
              detail={draft.quote.distanceKm != null ? `${(draft.quote.distanceKm * 0.621371).toFixed(1)} mi pricing distance` : 'Price ready'}
              done
              active={activeStage === 'PRICE'}
              onPress={() => setEditingStage('PRICE')}
            />
          ) : null}
          {savedQuoteRef ? (
            <SummaryCard
              title="Quote"
              value={`Quote ${savedQuoteRef}`}
              detail={quoteExpiryStatus ?? 'Valid until unknown'}
              done={quoteConfirmed}
              active={activeStage === 'QUOTE' || activeStage === 'CONFIRMATION'}
              onPress={() => setEditingStage(quoteConfirmed ? 'PAYMENT' : 'CONFIRMATION')}
              onLongPress={quoteActions.copyConfirmedMessage}
            />
          ) : null}
          {draft.paymentChoice ? (
            <SummaryCard
              title="Payment"
              value={paymentChoiceLabel(draft.paymentChoice)}
              detail={draft.paymentLink ? 'Payment link ready' : quoteConfirmed ? 'Quote payment option selected' : 'Selected before confirmation'}
              done={quoteConfirmed}
              active={activeStage === 'PAYMENT'}
              onPress={() => setEditingStage('PAYMENT')}
            />
          ) : null}
        </View>

        <View style={styles.activeStepBlock}>
          {renderActiveStage({
            activeStage,
            draft,
            update,
            phoneInput,
            setPhoneInput,
            handlePhoneBlur,
            noteInput,
            setNoteInput,
            callNotesInput,
            setCallNotesInput,
            callAssistMessage,
            setCallAssistMessage,
            handleApplyCallNotes,
            locationShare,
            price,
            lockingNutCharge,
            effectiveTotal,
            duplicateMatch,
            duplicateAck,
            setDuplicateAck,
            setHistoryOpen,
            quoteActions,
            activeQuote,
            savedQuoteRef,
            quoteConfirmed,
            quoteExpiryStatus,
            quotePricePence,
            selectedPaymentOption,
            dispatch,
            handleCopyCustomerDetails,
            engineEffectiveTotal,
            setEditPriceOpen,
            breakdownVisible,
            setBreakdownVisible,
          })}
          {activeStage === 'DISPATCHED' && draft.dispatchedBookingId ? (
            <>
              <DriverAssignSection
                bookingId={draft.dispatchedBookingId}
                trackingData={bookingTracking.data}
                customerLat={draft.location.lat}
                customerLng={draft.location.lng}
                onSelectDriver={(phone) => setSelectedDriverPhone(phone)}
              />
              <BookingTrackingCard
                data={bookingTracking.data}
                ensureFailed={bookingTracking.ensureFailed}
                busy={bookingTracking.busy}
                customerPhone={draft.customer.phone.trim() || null}
                driverPhone={selectedDriverPhone}
                onRetryEnsure={() => { void bookingTracking.ensure(); }}
                onRefresh={() => { void bookingTracking.refresh(); }}
              />
            </>
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomBarPaddingBottom }]}>
        {editingStage ? (
          <AppButton label="Back" variant="ghost" onPress={() => setEditingStage(null)} style={styles.backButton} />
        ) : null}
        <AppButton label="More" variant="secondary" onPress={() => setMoreOpen(true)} style={styles.moreButton} />
        <View style={styles.primaryWrap}>
          <AppButton
            label={primaryLabel}
            variant={primaryDisabled ? 'secondary' : 'primary'}
            onPress={() => {
              void handlePrimaryAction();
            }}
            loading={!editingStage && (price.loading || quoteActions.busy === 'save' || quoteActions.busy === 'confirm' || dispatch.busy)}
            disabled={primaryDisabled}
            style={styles.primaryButton}
            fullWidth
          />
          {primaryDisabledReason ? <Text style={styles.primaryReason}>{primaryDisabledReason}</Text> : null}
        </View>
      </View>

      <GuidedActionSheet visible={moreOpen} title="More" actions={sheetActions} onClose={() => setMoreOpen(false)} />
      <DispatchReviewSheet
        visible={reviewOpen}
        draft={draft}
        activeQuote={activeQuote}
        selectedPaymentOption={selectedPaymentOption}
        effectiveTotal={effectiveTotal}
        quoteConfirmed={quoteConfirmed}
        dispatchBusy={dispatch.busy}
        onClose={() => setReviewOpen(false)}
        onSend={handleSendToDriver}
      />
      <TodayBookingsModal visible={historyOpen} items={todayBookings.items} onClose={() => setHistoryOpen(false)} />
      <RecentCustomersModal
        visible={recentOpen}
        items={recentCustomers.items}
        draftHasContent={draftHasContent}
        onClose={() => setRecentOpen(false)}
        onUseCustomer={handleUseRecent}
      />
      <AdminQuotesModal visible={quotesOpen} onClose={() => setQuotesOpen(false)} onUseQuote={handleUseQuote} />
      <AdminBookingsModal visible={bookingsOpen} onClose={() => setBookingsOpen(false)} />
      <UrgentBookingPopup
        visible={urgentPopupOpen}
        booking={latestNewBooking}
        onOpenBookings={handleUrgentOpenBookings}
        onDismiss={handleUrgentDismiss}
      />
      <AdminVisitorsModal visible={visitorsOpen} onClose={() => setVisitorsOpen(false)} />
      <AdminInvoicesModal visible={invoicesOpen} onClose={() => setInvoicesOpen(false)} />
      <AdminStockModal visible={stockOpen} onClose={() => setStockOpen(false)} />
      <Modal
        visible={notifSetupOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifSetupOpen(false)}
        accessibilityViewIsModal
      >
        <View style={styles.notifSetupOverlay}>
          <View style={styles.notifSetupSheet}>
            <NotificationReliabilityCard />
            <Pressable
              onPress={() => setNotifSetupOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close notification setup"
              style={({ pressed }) => [styles.notifSetupClose, pressed && styles.notifSetupClosePressed]}
            >
              <Text style={styles.notifSetupCloseLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <EditQuotePriceModal
        visible={editPriceOpen}
        currentPriceGbp={effectiveTotal}
        engineBaseTotal={baseTotal}
        quickBookingId={draft.quickBookingId}
        onClose={() => setEditPriceOpen(false)}
        onSaved={(newPrice) => update({ manualPriceGbp: newPrice })}
      />
    </SafeAreaView>
  );
}

interface RenderActiveStageArgs {
  activeStage: AssistedChatStage;
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  phoneInput: string;
  setPhoneInput: (value: string) => void;
  handlePhoneBlur: () => void;
  noteInput: string;
  setNoteInput: (value: string) => void;
  callNotesInput: string;
  setCallNotesInput: (value: string) => void;
  callAssistMessage: string | null;
  setCallAssistMessage: (value: string | null) => void;
  handleApplyCallNotes: () => void;
  locationShare: ReturnType<typeof useAssistedChatLocationShare>;
  price: ReturnType<typeof useAssistedChatPrice>;
  lockingNutCharge: number;
  effectiveTotal: number;
  duplicateMatch: ReturnType<typeof useDuplicateBookingWarning>;
  duplicateAck: boolean;
  setDuplicateAck: (value: boolean) => void;
  setHistoryOpen: (value: boolean) => void;
  quoteActions: ReturnType<typeof useAssistedChatQuoteActions>;
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  quoteExpiryStatus: string | null;
  quotePricePence: number;
  selectedPaymentOption: AdminQuotePaymentOption;
  dispatch: ReturnType<typeof useAssistedChatDispatch>;
  handleCopyCustomerDetails: () => void | Promise<void>;
  engineEffectiveTotal: number;
  setEditPriceOpen: (value: boolean) => void;
  breakdownVisible: boolean;
  setBreakdownVisible: (value: boolean) => void;

}

function renderActiveStage(args: RenderActiveStageArgs) {
  const {
    activeStage,
    draft,
    update,
    phoneInput,
    setPhoneInput,
    handlePhoneBlur,
    noteInput,
    setNoteInput,
    callNotesInput,
    setCallNotesInput,
    callAssistMessage,
    setCallAssistMessage,
    handleApplyCallNotes,
    locationShare,
    price,
    lockingNutCharge,
    effectiveTotal,
    duplicateMatch,
    duplicateAck,
    setDuplicateAck,
    setHistoryOpen,
    quoteActions,
    activeQuote,
    savedQuoteRef,
    quoteConfirmed,
    quoteExpiryStatus,
    quotePricePence,
    selectedPaymentOption,
    dispatch,
    handleCopyCustomerDetails,
    engineEffectiveTotal,
    setEditPriceOpen,
    breakdownVisible,
    setBreakdownVisible,
  } = args;

  if (activeStage === 'CUSTOMER') {
    return (
      <View style={styles.stepStack}>
        <Pressable onLongPress={handleCopyCustomerDetails} delayLongPress={350}>
          <SectionCard title="Customer">
            <FieldLabel>Customer name</FieldLabel>
            <TextInput
              value={draft.customer.name}
              onChangeText={(name) => update({ customer: { ...draft.customer, name } })}
              placeholder="Name"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Customer phone</FieldLabel>
            <TextInput
              value={phoneInput}
              onChangeText={setPhoneInput}
              onBlur={handlePhoneBlur}
              placeholder="07... or 0141..."
              placeholderTextColor={colors.subtle}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>Customer email</FieldLabel>
            <TextInput
              value={draft.customer.email}
              onChangeText={(email) => update({ customer: { ...draft.customer, email } })}
              placeholder="you@example.com"
              placeholderTextColor={colors.subtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </SectionCard>
        </Pressable>
        <CallNotesCard
          callNotesInput={callNotesInput}
          setCallNotesInput={setCallNotesInput}
          callAssistMessage={callAssistMessage}
          setCallAssistMessage={setCallAssistMessage}
          handleApplyCallNotes={handleApplyCallNotes}
        />
      </View>
    );
  }

  if (activeStage === 'LOCATION') {
    return (
      <View>
        <LocationSection draft={draft} update={update} locationShare={locationShare} showInlineActions={false} />
      </View>
    );
  }

  if (activeStage === 'TYRE') {
    return (
      <View style={styles.stepStack}>
        <TyreSelectionSection draft={draft} update={update} />
        <LockingWheelNutSection draft={draft} update={update} />
        <SectionCard title="Driver note">
          <FieldLabel>Admin note</FieldLabel>
          <TextInput
            value={noteInput}
            onChangeText={setNoteInput}
            onBlur={() => update({ note: noteInput })}
            placeholder="Anything the driver should know"
            placeholderTextColor={colors.subtle}
            style={styles.note}
            multiline
            textAlignVertical="top"
          />
        </SectionCard>
      </View>
    );
  }

  if (activeStage === 'PRICE') {
    const hasLocation = draft.location.lat != null && draft.location.lng != null;
    const hasTyre = hasAssistedChatTyre(draft);
    const pricingDisabledReason = !hasLocation
      ? 'Price is locked until the customer location is confirmed.'
      : !hasTyre
      ? 'Enter a tyre size before getting the price.'
      : null;
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        {pricingDisabledReason ? (
          <View style={styles.inlineNoticeWrap}>
            <InlineNotice kind="info">{pricingDisabledReason}</InlineNotice>
          </View>
        ) : null}
        <DuplicateBookingWarning
          match={duplicateMatch}
          acknowledged={duplicateAck}
          onReview={() => setHistoryOpen(true)}
          onContinueAnyway={() => setDuplicateAck(true)}
        />
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={!hasLocation || !hasTyre}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'QUOTE') {
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible && draft.quote ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={false}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'CONFIRMATION' || activeStage === 'PAYMENT') {
    const status = computeCompactQuoteStatus({
      activeQuote,
      savedQuoteRef,
      quoteConfirmed,
      paymentLink: draft.paymentLink,
    });
    return (
      <View style={styles.stepStack}>
        <CompactQuoteCard
          displayedPriceGbp={effectiveTotal}
          isManualPrice={draft.manualPriceGbp != null}
          originalCalculatedPriceGbp={engineEffectiveTotal}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={dispatch.busy && draft.paymentChoice === 'full'}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => { void dispatch.choosePaymentAndDispatch('full'); }}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        {breakdownVisible && draft.quote ? (
          <PriceSummary
            quote={draft.quote}
            lockingNutCharge={lockingNutCharge}
            loading={price.loading}
            stageIdx={price.stageIdx}
            stageLabels={price.stageLabels}
            error={price.error}
            onGetPrice={price.getPrice}
            onChoosePayment={(choice) => update({ paymentChoice: choice })}
            paymentChoice={draft.paymentChoice}
            paymentBusy={dispatch.busy}
            paymentError={dispatch.error}
            paymentLink={draft.paymentLink}
            dispatchedRefNumber={draft.dispatchedRefNumber}
            pricingBlocked={false}
            priceNeedsRefresh={draft.priceNeedsRefresh}
            manualPriceGbp={draft.manualPriceGbp}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? <PaymentLinkInline link={draft.paymentLink} isManualPrice={draft.manualPriceGbp != null} /> : null}
      </View>
    );
  }

  if (activeStage === 'READY_TO_DISPATCH') {
    return (
      <SectionCard title="Ready to dispatch">
        <Text style={styles.bodyText}>Review the job before sending it to the driver.</Text>
        <View style={styles.readySummary}>
          <DetailRow label="Payment" value={paymentChoiceLabel(draft.paymentChoice)} />
          <DetailRow label="Quote" value={savedQuoteRef ? `Quote ${savedQuoteRef}` : 'Saved quote unavailable'} />
          <DetailRow label="Total" value={formatGbp(effectiveTotal)} />
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Dispatched">
      <Text style={styles.bodyText}>Booking {draft.dispatchedRefNumber ?? 'created'} is ready.</Text>
      {draft.paymentLink ? (
        <View style={styles.paymentLinkSummary}>
          <Text style={styles.paymentLinkTitle}>{draft.paymentLink.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link'}</Text>
          <Text style={styles.paymentLinkMeta}>{draft.paymentLink.paymentUrl}</Text>
          <Text style={styles.paymentLinkMeta}>Amount: {formatPence(draft.paymentLink.amountPence)}</Text>
          {draft.paymentLink.remainingBalancePence != null ? (
            <Text style={styles.paymentLinkMeta}>Balance on arrival: {formatPence(draft.paymentLink.remainingBalancePence)}</Text>
          ) : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

function stageLabel(stage: AssistedChatStage): string {
  if (stage === 'READY_TO_DISPATCH') return 'Ready to dispatch';
  return stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, ' ');
}

function Timeline({
  items,
  onSelect,
}: {
  items: AssistedChatTimelineItem[];
  onSelect: (step: AssistedChatTimelineStep) => void;
}) {
  return (
    <View style={styles.timeline}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onSelect(item.key)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.label} section`}
          style={({ pressed }) => [
            styles.timelineItem,
            item.state === 'done' && styles.timelineItemDone,
            item.state === 'active' && styles.timelineItemActive,
            pressed && styles.timelineItemPressed,
          ]}
        >
          <Text
            style={[
              styles.timelineText,
              item.state === 'done' && styles.timelineTextDone,
              item.state === 'active' && styles.timelineTextActive,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function stageForTimelineStep(
  step: AssistedChatTimelineStep,
  ctx: { quoteConfirmed: boolean },
): AssistedChatStage {
  switch (step) {
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'LOCATION':
      return 'LOCATION';
    case 'TYRE':
      return 'TYRE';
    case 'PRICE':
      return 'PRICE';
    case 'QUOTE':
      return ctx.quoteConfirmed ? 'PAYMENT' : 'CONFIRMATION';
    case 'PAYMENT':
      return 'PAYMENT';
    case 'DISPATCH':
      return 'READY_TO_DISPATCH';
  }
}

function blockedReasonForStage(
  stage: AssistedChatStage,
  ctx: {
    hasCustomerDetails: boolean;
    hasLocation: boolean;
    hasTyre: boolean;
    hasPrice: boolean;
    hasSavedQuote: boolean;
    quoteConfirmed: boolean;
    hasPaymentChoice: boolean;
  },
): string | null {
  switch (stage) {
    case 'CUSTOMER':
    case 'LOCATION':
      return null;
    case 'TYRE':
      if (!ctx.hasLocation) return 'Confirm location before adding tyre details.';
      return null;
    case 'PRICE':
      if (!ctx.hasLocation) return 'Complete location before pricing.';
      if (!ctx.hasTyre) return 'Add tyre details before pricing.';
      return null;
    case 'QUOTE':
    case 'CONFIRMATION':
      if (!ctx.hasPrice) return 'Get a price before saving a quote.';
      return null;
    case 'PAYMENT':
      if (!ctx.hasSavedQuote) return 'Save a quote before choosing payment.';
      return null;
    case 'READY_TO_DISPATCH':
    case 'DISPATCHED':
      if (!ctx.quoteConfirmed) return 'Confirm the quote before dispatch.';
      if (!ctx.hasPaymentChoice) return 'Choose a payment option before dispatch.';
      return null;
  }
}

function SummaryCard({
  title,
  value,
  detail,
  done,
  active,
  rightLabel,
  onPress,
  onLongPress,
  onRightPress,
}: {
  title: string;
  value: string;
  detail: string;
  done: boolean;
  active: boolean;
  rightLabel?: string;
  onPress: () => void;
  onLongPress?: () => void | Promise<void>;
  onRightPress?: () => void;
}) {
  const cardStyle = [
    styles.summaryCard,
    done && styles.summaryCardDone,
    active && styles.summaryCardActive,
  ];
  const content = (
    <View style={styles.summaryMain}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryDetail} numberOfLines={2}>{detail}</Text>
    </View>
  );

  if (rightLabel && onRightPress) {
    return (
      <View style={cardStyle}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityRole="button"
          style={({ pressed }) => [styles.summaryMainButton, pressed && styles.summaryCardPressed]}
        >
          {content}
        </Pressable>
        <Pressable onPress={onRightPress} style={styles.summaryRightButton} accessibilityRole="button">
          <Text style={styles.summaryRightText}>{rightLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      style={({ pressed }) => [
        cardStyle,
        pressed && styles.summaryCardPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function CallNotesCard({
  callNotesInput,
  setCallNotesInput,
  callAssistMessage,
  setCallAssistMessage,
  handleApplyCallNotes,
}: {
  callNotesInput: string;
  setCallNotesInput: (value: string) => void;
  callAssistMessage: string | null;
  setCallAssistMessage: (value: string | null) => void;
  handleApplyCallNotes: () => void;
}) {
  return (
    <SectionCard title="Smart call notes" helperText="Paste rough call notes and apply obvious details. Address still needs selecting from suggestions for coordinates.">
      <TextInput
        value={callNotesInput}
        onChangeText={(value) => {
          setCallNotesInput(value);
          setCallAssistMessage(null);
        }}
        placeholder="Example: customer is Ali, 07700 900123, address 3 Gateside Street, needs 205/55R16 x2, cash, note side street"
        placeholderTextColor={colors.subtle}
        style={styles.callNotesInput}
        multiline
        textAlignVertical="top"
      />
      <View style={styles.callNotesActions}>
        <AppButton label="Apply notes" variant="secondary" onPress={handleApplyCallNotes} disabled={!callNotesInput.trim()} style={styles.flexActionButton} />
        <AppButton
          label="Clear notes"
          variant="ghost"
          onPress={() => {
            setCallNotesInput('');
            setCallAssistMessage(null);
          }}
          disabled={!callNotesInput.trim()}
          style={styles.flexActionButton}
        />
      </View>
      {callAssistMessage ? (
        <View style={styles.inlineNoticeTop}>
          <InlineNotice kind={callAssistMessage.startsWith('Applied:') ? 'info' : 'warn'}>{callAssistMessage}</InlineNotice>
        </View>
      ) : null}
    </SectionCard>
  );
}

function QuoteStepCard({
  activeQuote,
  savedQuoteRef,
  quoteConfirmed,
  quoteExpiryStatus,
  quotePricePence,
  selectedPaymentOption,
  effectiveTotal,
  onLongPress,
}: {
  activeQuote: AdminQuote | null;
  savedQuoteRef: string | null;
  quoteConfirmed: boolean;
  quoteExpiryStatus: string | null;
  quotePricePence: number;
  selectedPaymentOption: AdminQuotePaymentOption;
  effectiveTotal: number;
  onLongPress: () => void | Promise<void>;
}) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350}>
      <SectionCard title="Quote">
        <View style={styles.quoteHeaderBox}>
          <Text style={styles.quoteTitle}>{savedQuoteRef ? `Quote ${savedQuoteRef}` : 'Quote not saved'}</Text>
          <Text style={styles.quoteTotal}>{formatGbp(effectiveTotal)}</Text>
        </View>
        <View style={styles.detailRows}>
          <DetailRow label="Saved state" value={savedQuoteRef ? 'Saved' : 'Not saved'} />
          <DetailRow label="Confirmation" value={quoteConfirmed ? 'Confirmed by phone' : 'Not confirmed'} />
          {quoteExpiryStatus ? <DetailRow label="Expiry" value={quoteExpiryStatus} /> : null}
          <DetailRow label="Quote status" value={activeQuote?.quoteStatus ?? (savedQuoteRef ? 'Saved' : 'Draft')} />
          <DetailRow label="Selected payment" value={paymentOptionLabel(selectedPaymentOption)} />
          <DetailRow label="Full price" value={formatPence(quotePricePence)} />
        </View>
      </SectionCard>
    </Pressable>
  );
}

function PaymentLinkInline({ link, isManualPrice = false }: { link: StripePaymentLinkState; isManualPrice?: boolean }) {
  const kindLabel = link.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link';
  const handleOpen = (): void => {
    void Linking.openURL(link.paymentUrl);
  };
  const handleCopy = (): void => {
    void copyToClipboard(link.paymentUrl);
  };
  return (
    <SectionCard title={kindLabel}>
      <Text style={styles.paymentLinkMeta} numberOfLines={2}>{link.paymentUrl}</Text>
      <Text style={styles.paymentLinkMeta}>Amount: {formatPence(link.amountPence)}</Text>
      {isManualPrice ? (
        <Text style={styles.paymentLinkMeta}>Manual price used for payment</Text>
      ) : null}
      <View style={styles.paymentLinkActions}>
        <AppButton label="Copy link" variant="secondary" onPress={handleCopy} style={styles.flexActionButton} />
        <AppButton label="Open" variant="ghost" onPress={handleOpen} style={styles.flexActionButton} />
      </View>
    </SectionCard>
  );
}

function PaymentSelector({
  selectedPaymentOption,
  quotePricePence,
  disabled,
  onSelect,
}: {
  selectedPaymentOption: AdminQuotePaymentOption;
  quotePricePence: number;
  disabled: boolean;
  onSelect: (option: AdminQuotePaymentOption) => void;
}) {
  const deposit = getDepositSummary(quotePricePence);
  return (
    <SectionCard title="Payment">
      <View style={styles.paymentList}>
        {PAYMENT_OPTIONS.map((option) => {
          const selected = selectedPaymentOption === option.value;
          const detail = option.value === 'DEPOSIT_15'
            ? `Deposit ${formatPence(deposit.depositAmountPence)}. Remaining ${formatPence(deposit.remainingBalancePence)}.`
            : option.description;
          return (
            <Pressable
              key={option.value}
              onPress={disabled ? undefined : () => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              style={({ pressed }) => [
                styles.paymentOption,
                selected && styles.paymentOptionSelected,
                pressed && !disabled && styles.paymentOptionPressed,
                disabled && styles.paymentOptionDisabled,
              ]}
            >
              <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
              <View style={styles.paymentCopy}>
                <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>{option.label}</Text>
                <Text style={styles.paymentDetail}>{detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

function GuidedActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetList}>
            {actions.map((action) => {
              const disabled = Boolean(action.disabledReason);
              return (
                <Pressable
                  key={action.id}
                  onPress={disabled ? undefined : () => {
                    onClose();
                    void action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  style={({ pressed }) => [
                    styles.sheetAction,
                    action.destructive && styles.sheetActionDanger,
                    disabled && styles.sheetActionDisabled,
                    pressed && !disabled && styles.sheetActionPressed,
                  ]}
                >
                  <Text style={[styles.sheetActionLabel, action.destructive && styles.sheetActionDangerLabel]}>{action.label}</Text>
                  {action.description ? <Text style={styles.sheetActionDescription}>{action.description}</Text> : null}
                  {action.disabledReason ? <Text style={styles.sheetActionReason}>{action.disabledReason}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DispatchReviewSheet({
  visible,
  draft,
  activeQuote,
  selectedPaymentOption,
  effectiveTotal,
  quoteConfirmed,
  dispatchBusy,
  onClose,
  onSend,
}: {
  visible: boolean;
  draft: AssistedChatDraft;
  activeQuote: AdminQuote | null;
  selectedPaymentOption: AdminQuotePaymentOption;
  effectiveTotal: number;
  quoteConfirmed: boolean;
  dispatchBusy: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const distanceMiles = draft.quote?.distanceKm != null ? draft.quote.distanceKm * 0.621371 : null;
  const driveTime = draft.quote?.serviceOrigin?.etaMinutes ?? null;
  const canSend = Boolean(draft.paymentChoice && draft.quote && draft.quickBookingId && quoteConfirmed && !draft.dispatchedRefNumber);
  const disabledReason = !draft.quote
    ? 'Get a price before dispatching.'
    : !draft.quickBookingId
    ? 'Get a current quick booking before dispatching.'
    : !quoteConfirmed
    ? 'Confirm the saved quote before dispatching.'
    : !draft.paymentChoice
    ? 'Choose a payment option before dispatching.'
    : draft.dispatchedRefNumber
    ? `Already dispatched as ${draft.dispatchedRefNumber}.`
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.reviewBackdrop}>
        <View style={styles.reviewSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Review dispatch</Text>
            <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.reviewContent}>
            <DetailRow label="Customer" value={draft.customer.name.trim() || 'New customer'} />
            <DetailRow label="Phone" value={draft.customer.phone.trim() || 'Not set'} />
            <DetailRow label="Tyres" value={draft.tyre.size.trim() ? `${draft.tyre.quantity} x ${draft.tyre.size.trim()}` : `Quantity ${draft.tyre.quantity}`} />
            <DetailRow label="Address/location" value={draft.location.address.trim() || draft.location.status} />
            <DetailRow label="Price" value={formatGbp(effectiveTotal)} />
            <DetailRow label="Quote ref" value={activeQuote?.quoteRef ?? draft.savedQuoteRef ?? 'Not saved'} />
            <DetailRow label="Selected payment" value={paymentOptionLabel(selectedPaymentOption)} />
            <DetailRow label="Payment status" value={draft.paymentLink ? 'Payment link ready' : draft.paymentChoice ? paymentChoiceLabel(draft.paymentChoice) : 'Not selected'} />
            <DetailRow label="Distance" value={distanceMiles != null ? `${distanceMiles.toFixed(1)} miles` : 'Not available'} />
            <DetailRow label="Drive time" value={driveTime != null ? `${driveTime} minutes` : 'Not available'} />
            <DetailRow label="Driver/admin note" value={draft.note.trim() || 'None'} />
            {disabledReason ? <StatusBanner kind="warn" message={disabledReason} /> : null}
          </ScrollView>
          <View style={styles.reviewActions}>
            <AppButton
              label="Send to Driver"
              variant={canSend ? 'primary' : 'secondary'}
              onPress={onSend}
              disabled={!canSend || dispatchBusy}
              loading={dispatchBusy}
              style={styles.reviewPrimary}
              fullWidth
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const baseInput: TextStyle = {
  minHeight: 48,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: fontSize.md,
  color: colors.text,
  backgroundColor: colors.inputBg,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    gap: 10,
  },
  headerTextBlock: { flex: 1, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  headerCustomer: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  headerPhone: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  alertReadinessPill: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
  },
  alertReadinessPillArmed: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  alertReadinessPillNotArmed: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  alertReadinessPillPressed: { opacity: 0.78 },
  alertReadinessText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  alertReadinessRetryText: { color: colors.warning, fontSize: fontSize.xs, marginTop: 2, fontWeight: '700' },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  statusChip: {
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '800' },
  headerContactRow: { flexDirection: 'row', gap: 8 },
  compactContactButton: {
    minHeight: 48,
    minWidth: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  callButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  whatsappButton: { backgroundColor: '#25D366', borderColor: '#1FB855' },
  compactContactLabel: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: '800' },
  contactButtonPressed: { opacity: 0.82 },
  contactButtonDisabled: { opacity: 0.38 },
  scroll: { padding: 12, gap: 12, paddingBottom: 148 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toolButton: { flexGrow: 1, flexBasis: 104 },
  timeline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 8,
  },
  timelineItem: {
    minHeight: 34,
    flexGrow: 1,
    flexBasis: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.bg,
  },
  timelineItemDone: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  timelineItemActive: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.14)' },
  timelineItemPressed: { opacity: 0.72 },
  timelineText: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800' },
  timelineTextDone: { color: colors.success },
  timelineTextActive: { color: colors.accent },
  summaryStack: { gap: 8 },
  summaryCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 10,
  },
  summaryCardDone: { borderColor: colors.successBorder },
  summaryCardActive: { borderColor: colors.accent },
  summaryCardPressed: { backgroundColor: colors.card },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryMainButton: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', borderRadius: radius.sm },
  summaryTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.4 },
  summaryValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '800', marginTop: 2 },
  summaryDetail: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  summaryRightButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  summaryRightText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '800' },
  activeStepBlock: { gap: 12 },
  stepStack: { gap: 12 },
  input: baseInput,
  fieldGap: { height: 10 },
  note: { ...baseInput, minHeight: 96, textAlignVertical: 'top' },
  callNotesInput: { ...baseInput, minHeight: 92, lineHeight: 20, textAlignVertical: 'top' },
  callNotesActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  flexActionButton: { flexGrow: 1, flexBasis: 130 },
  inlineNoticeTop: { marginTop: 10 },
  inlineNoticeWrap: { marginBottom: 10 },
  quoteHeaderBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    gap: 4,
  },
  quoteTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  quoteTotal: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '900' },
  detailRows: { marginTop: 10, gap: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  detailLabel: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700', flex: 1 },
  detailValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700', flex: 1.35, textAlign: 'right' },
  paymentList: { gap: 8 },
  paymentOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentOptionSelected: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.12)' },
  paymentOptionPressed: { borderColor: colors.borderStrong, backgroundColor: colors.surface },
  paymentOptionDisabled: { opacity: 0.62 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  paymentCopy: { flex: 1, minWidth: 0 },
  paymentLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  paymentLabelSelected: { color: colors.accent },
  paymentDetail: { color: colors.muted, fontSize: fontSize.xs, marginTop: 3, lineHeight: 16 },
  bodyText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20, marginBottom: 10 },
  readySummary: { gap: 8, marginBottom: 12 },
  paymentLinkSummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    gap: 5,
  },
  paymentLinkTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  paymentLinkMeta: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 17 },
  paymentLinkActions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  bottomSpacer: { height: 8 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  backButton: { minWidth: 76, minHeight: 56 },
  moreButton: { minWidth: 84, minHeight: 56 },
  primaryWrap: { flex: 1, minWidth: 0 },
  primaryButton: { minHeight: 56 },
  primaryReason: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700', marginTop: 5 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  actionSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetTitle: { flex: 1, color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  sheetCloseButton: { minWidth: 86 },
  sheetList: { gap: 8, paddingBottom: space.md },
  sheetAction: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sheetActionPressed: { backgroundColor: colors.card, borderColor: colors.borderStrong },
  sheetActionDisabled: { opacity: 0.58 },
  sheetActionDanger: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  sheetActionLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  sheetActionDangerLabel: { color: colors.danger },
  sheetActionDescription: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16, marginTop: 3 },
  sheetActionReason: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 16, marginTop: 4, fontWeight: '700' },
  reviewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  reviewSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  reviewContent: { gap: 8, paddingBottom: 12 },
  reviewActions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  reviewPrimary: { minHeight: 56 },
  notifSetupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  notifSetupSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  notifSetupClose: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  notifSetupClosePressed: { opacity: 0.7 },
  notifSetupCloseLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
