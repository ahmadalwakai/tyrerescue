import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  KeyboardAvoidingView,
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
  type ViewStyle,
} from 'react-native';
import { Asset } from 'expo-asset';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import assistedChatHeaderVideoSource from '../../assets/video/assisted-chat-header.mp4';
import { EMPTY_DRAFT, useAssistedChatDraft } from '@/hooks/useAssistedChatDraft';
import { useAssistedChatPrice } from '@/hooks/useAssistedChatPrice';
import { useAssistedChatDispatch } from '@/hooks/useAssistedChatDispatch';
import { useAdminPaymentLink } from '@/hooks/useAdminPaymentLink';
import { useAssistedChatLocationShare } from '@/hooks/useAssistedChatLocationShare';
import { useAssistedChatQuoteActions } from '@/hooks/useAssistedChatQuoteActions';
import { useTodayBookings, type TodayBookingItem } from '@/hooks/useTodayBookings';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { useDuplicateBookingWarning } from '@/hooks/useDuplicateBookingWarning';
import { useNewCustomerBookingAlert } from '@/hooks/useNewCustomerBookingAlert';
import { useBookingTracking } from '@/hooks/useBookingTracking';
import { useActiveJobs, type ActiveJobItem } from '@/hooks/useActiveJobs';
import { BookingTrackingCard } from './tracking/BookingTrackingCard';
import { DriverAssignSection } from './tracking/DriverAssignSection';
import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
  AssistedChatQuoteBreakdown,
  AssistedChatServiceType,
  RecentCustomer,
  StripePaymentLinkState,
} from '@/types/assisted-chat';
import type { AdminQuote, AdminQuotePaymentOption, AdminQuoteStatus } from '@/types/admin-quotes';
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
import { AddAdminModal } from './AddAdminModal';
import { MessageSenderModal } from './MessageSenderModal';
import type { VirtualLandlineDraftPrefill } from './VirtualLandlineModal';
import { SectionCard, FieldLabel, InlineNotice, AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { usePressScale } from './motion';
import { AppIcon, type AppIconName } from './icons/AppIcon';
import { api } from '@/lib/api';
import { downloadInvoicePdfToDevice } from '@/lib/invoice-download';
import {
  getPaymentLinkStatusLabel,
  getStripeCheckButtonLabel,
  type PaymentLinkLiveStatus,
} from '@/lib/payment-link-status';
import {
  sanitizeHeaderVideoDiagnostic,
  shouldShowHeaderVideoFallback,
  validateHeaderVideoUri,
} from '@/lib/header-video';
import { buildCustomerMessage, buildWhatsAppUrl } from '@/lib/customer-message';
import { copyToClipboard } from '@/lib/clipboard';
import {
  formatGbp,
  isValidUkPhone,
  getEmailDomainSuggestions,
  normalizeContactPhone,
  normalizeEmailAddress,
  normalizePhoneForDial,
  normalizePhoneForWhatsApp,
} from '@/lib/money';
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
} from '@/lib/urgent-alerts';
import { NotificationReliabilityCard } from './alerts/NotificationReliabilityCard';
import {
  buildBookingTyreLinePayload,
  createBookingTyreLine,
  formatAssistedChatServiceType,
  getAssistedChatWorkflow,
  hasAssistedChatTyre,
  normalizeAssistedChatTyreSize,
  primaryBookingTyreLine,
  summarizeBookingTyreLines,
  totalBookingTyreQuantity,
  type AssistedChatStage,
} from '@/lib/assisted-chat-workflow';
import {
  deriveOperatorWorkflowSteps,
  stageForStepId,
} from '@/lib/operator-workflow-state';
import {
  ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH,
  ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
} from '@/lib/header-layout';
import {
  formatHeaderNotificationBadge,
  getHeaderNotificationAccessibilityLabel,
  type HeaderNotificationVisualState,
} from '@/lib/header-notifications';
import {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';
import { OperatorStepProgress } from './workflow/OperatorStepProgress';

logStartupModuleStarted('Assisted Chat module');

interface ParsedCallNotes {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  locationAddress?: string;
  serviceType?: AssistedChatServiceType;
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
  icon?: AppIconName;
  description?: string;
  disabledReason?: string | null;
  destructive?: boolean;
  onPress: () => void | Promise<void>;
}

interface ActionNotice {
  kind: 'ok' | 'err' | 'info' | 'warn';
  text: string;
}

const startupImportsLogged = new Set<string>();

function requireStartupModule<T>(label: string, load: () => T): T {
  if (startupImportsLogged.has(label)) return load();
  logStartupModuleStarted(label);
  try {
    const mod = load();
    startupImportsLogged.add(label);
    logStartupModuleCompleted(label);
    return mod;
  } catch (error) {
    logStartupModuleFailed(label, error);
    throw error;
  }
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const DEPOSIT_PERCENT = 20;
const DRIVER_NEARBY_ALERT_MINUTES = 5;

function DeferredVirtualLandlineModal(props: {
  visible: boolean;
  onClose: () => void;
  onCreateDraft: (draft: VirtualLandlineDraftPrefill) => void;
}) {
  if (!props.visible) return null;
  const { VirtualLandlineModal } = requireStartupModule(
    'Virtual Landline import',
    () => require('./VirtualLandlineModal') as typeof import('./VirtualLandlineModal'),
  );
  return <VirtualLandlineModal {...props} />;
}

function DeferredChatHubModal(props: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!props.visible) return null;
  const { ChatHubModal } = requireStartupModule(
    'Chat Hub import',
    () => require('./ChatHubModal') as typeof import('./ChatHubModal'),
  );
  return <ChatHubModal {...props} />;
}

function DeferredDriverChatModal(props: {
  visible: boolean;
  bookingId: string | null;
  bookingRef: string | null;
  onClose: () => void;
}) {
  if (!props.visible) return null;
  const { DriverChatModal } = requireStartupModule(
    'Driver Chat import',
    () => require('./DriverChatModal') as typeof import('./DriverChatModal'),
  );
  return <DriverChatModal {...props} />;
}

function DeferredUrgentBookingPopup(props: ComponentProps<typeof import('./alerts/UrgentBookingPopup')['UrgentBookingPopup']>) {
  if (!props.visible) return null;
  const { UrgentBookingPopup } = requireStartupModule(
    'Urgent Booking Popup import',
    () => require('./alerts/UrgentBookingPopup') as typeof import('./alerts/UrgentBookingPopup'),
  );
  return <UrgentBookingPopup {...props} />;
}

function DeferredAdminStockModal(props: ComponentProps<typeof import('./AdminStockModal')['AdminStockModal']>) {
  if (!props.visible) return null;
  const { AdminStockModal } = requireStartupModule(
    'Admin Stock import',
    () => require('./AdminStockModal') as typeof import('./AdminStockModal'),
  );
  return <AdminStockModal {...props} />;
}

function DeferredActiveJobsModal(props: ComponentProps<typeof import('./ActiveJobsModal')['ActiveJobsModal']>) {
  if (!props.visible) return null;
  const { ActiveJobsModal } = requireStartupModule(
    'Active Jobs import',
    () => require('./ActiveJobsModal') as typeof import('./ActiveJobsModal'),
  );
  return <ActiveJobsModal {...props} />;
}

function DeferredActiveJobMapModal(props: ComponentProps<typeof import('./ActiveJobsModal')['ActiveJobMapModal']>) {
  if (!props.visible) return null;
  const { ActiveJobMapModal } = requireStartupModule(
    'Active Job Map import',
    () => require('./ActiveJobsModal') as typeof import('./ActiveJobsModal'),
  );
  return <ActiveJobMapModal {...props} />;
}

function DeferredTrackingModal(props: ComponentProps<typeof import('./TrackingModal')['TrackingModal']>) {
  if (!props.visible) return null;
  const { TrackingModal } = requireStartupModule(
    'Tracking Modal import',
    () => require('./TrackingModal') as typeof import('./TrackingModal'),
  );
  return <TrackingModal {...props} />;
}

function DeferredLocationSection(props: ComponentProps<typeof import('./LocationSection')['LocationSection']>) {
  const { LocationSection } = requireStartupModule(
    'Location Section import',
    () => require('./LocationSection') as typeof import('./LocationSection'),
  );
  return <LocationSection {...props} />;
}

const PAYMENT_OPTIONS: ReadonlyArray<{ value: AdminQuotePaymentOption; label: string; description: string }> = [
  { value: 'FULL_PAYMENT', label: 'Full payment', description: 'Customer completes the full Stripe payment.' },
  { value: 'DEPOSIT_20', label: 'Deposit 20%', description: 'Customer pays 20% now and the balance on arrival.' },
  { value: 'CASH_ON_ARRIVAL', label: 'Cash on arrival', description: 'Driver collects cash when the job is complete.' },
  { value: 'PAYMENT_LINK', label: 'Send payment link', description: 'Send a secure payment link before dispatch.' },
];

const CONFIRMED_QUOTE_STATUSES: readonly AdminQuoteStatus[] = [
  'CONFIRMED_BY_PHONE',
  'PAYMENT_PENDING',
  'PAID',
];

const ALERT_ARM_RETRY_DELAYS_MS = [3000, 10000, 30000, 30000, 30000, 30000];

type PremiumTone = 'orange' | 'blue' | 'green' | 'red' | 'neutral' | 'warn';

function heroCopyForStage(stage: AssistedChatStage, customerName: string): {
  title: string;
  helper: string;
  badge: string;
  tone: PremiumTone;
} {
  switch (stage) {
    case 'CUSTOMER':
      return {
        title: customerName && customerName !== 'New customer' ? customerName : 'New Customer',
        helper: 'Add customer phone to call or WhatsApp',
        badge: 'Customer',
        tone: 'orange',
      };
    case 'LOCATION':
      return {
        title: 'Location',
        helper: 'Confirm where the vehicle is before pricing or dispatch.',
        badge: 'Route ready',
        tone: 'orange',
      };
    case 'TYRE':
      return {
        title: 'Tyre Details',
        helper: 'Choose repair, replacement, or inspection required.',
        badge: 'Service',
        tone: 'blue',
      };
    case 'PRICE':
      return {
        title: 'Quote',
        helper: 'Review the calculated price and save the customer quote.',
        badge: 'Pricing',
        tone: 'green',
      };
    case 'QUOTE':
    case 'CONFIRMATION':
      return {
        title: 'Confirm Quote',
        helper: 'Make sure the customer has agreed before payment or dispatch.',
        badge: 'Confirm',
        tone: 'green',
      };
    case 'PAYMENT':
      return {
        title: 'Payment',
        helper: 'Choose the payment route and collect the agreed amount.',
        badge: 'Payment',
        tone: 'blue',
      };
    case 'READY_TO_DISPATCH':
      return {
        title: 'Ready To Dispatch',
        helper: 'Review the job and send it to the driver.',
        badge: 'Ready',
        tone: 'warn',
      };
    case 'DISPATCHED':
      return {
        title: 'Dispatch',
        helper: 'Track the job, assign the driver, and keep the customer updated.',
        badge: 'Live job',
        tone: 'green',
      };
  }
}

function activePanelCopyForStage(stage: AssistedChatStage): { title: string; helper: string; icon: AppIconName } {
  switch (stage) {
    case 'CUSTOMER':
      return { title: 'Customer', helper: 'Capture reliable contact details for the job.', icon: 'user' };
    case 'LOCATION':
      return { title: 'Location', helper: 'Find the customer and send a location link if needed.', icon: 'map-marker' };
    case 'TYRE':
      return { title: 'Tyre', helper: 'Record service type, tyre details, and locking nut status.', icon: 'life-ring' };
    case 'PRICE':
      return { title: 'Quote', helper: 'Calculate and save the agreed customer price.', icon: 'file-text-o' };
    case 'QUOTE':
    case 'CONFIRMATION':
      return { title: 'Quote check', helper: 'Review the agreed total before moving to payment.', icon: 'check-circle' };
    case 'PAYMENT':
      return { title: 'Payment', helper: 'Select payment method and create the booking.', icon: 'credit-card' };
    case 'READY_TO_DISPATCH':
      return { title: 'Dispatch review', helper: 'Final check before sending to the driver.', icon: 'road' };
    case 'DISPATCHED':
      return { title: 'Live dispatch', helper: 'Manage driver assignment, tracking, and payment follow-up.', icon: 'truck' };
  }
}

function normalizeTyreSizeFromText(text: string): string | undefined {
  const match = text.match(/\b(\d{3})\s*[\/ -]?\s*(\d{2})\s*(?:[\/ -]?\s*r\s*|[\/ -]+)(\d{2})\b/i);
  if (!match) return undefined;
  return normalizeAssistedChatTyreSize(`${match[1]}/${match[2]}/R${match[3]}`) ?? undefined;
}

function parseCallNotes(text: string): ParsedCallNotes {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const parsed: ParsedCallNotes = {};

  if (/\b(?:not sure|unsure|unknown|inspect|inspection|assess|assessment|check first|needs checking)\b/i.test(normalized)) {
    parsed.serviceType = 'assess';
  } else if (/\b(?:puncture|punctured|repair|repaired|patch|slow puncture|plug)\b/i.test(normalized)) {
    parsed.serviceType = 'repair';
  } else if (/\b(?:new tyre|new tire|replacement|replace|fit|fitting)\b/i.test(normalized)) {
    parsed.serviceType = 'fit';
  }

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

function getQuotePricingDistanceMiles(
  quote: AssistedChatQuoteBreakdown | null | undefined,
): number | null {
  if (!quote) return null;
  if (quote.distanceMiles != null && Number.isFinite(quote.distanceMiles)) return quote.distanceMiles;
  if (quote.distanceKm != null && Number.isFinite(quote.distanceKm)) return quote.distanceKm * 0.621371;
  return null;
}

function getDepositSummary(priceAmountPence: number): { depositAmountPence: number; remainingBalancePence: number } {
  const depositAmountPence = Math.round((priceAmountPence * DEPOSIT_PERCENT) / 100);
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
  if (option === 'DEPOSIT_15') return 'Deposit 20%';
  return PAYMENT_OPTIONS.find((item) => item.value === option)?.label ?? option;
}

function paymentChoiceLabel(choice: AssistedChatPaymentChoice | null): string {
  if (choice === 'deposit') return 'Deposit 20%';
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
      buildBookingTyreLinePayload(draft.tyreLines).length > 0 ||
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
  lines.push(`Service: ${formatAssistedChatServiceType(draft.serviceType)}`);
  if (draft.customer.name.trim()) lines.push(`Customer: ${draft.customer.name.trim()}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
  if (tyreSummary.length > 0) {
    lines.push('Tyres:');
    tyreSummary.forEach((line) => lines.push(`- ${line}`));
  }
  lines.push(
    `Locking wheel nut: ${
      draft.lockingNut.answer === 'yes'
        ? 'Customer has it'
        : draft.lockingNut.answer === 'no'
        ? 'Customer does not have it'
        : 'Not asked / optional'
    }`,
  );
  if (lockingNutCharge > 0) lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
  if (draft.note.trim()) lines.push(`Driver note: ${draft.note.trim()}`);
  if (draft.quote) {
    lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  }
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
  const bookingReady = Boolean(draft.dispatchedRefNumber || draft.dispatchedBookingId);
  const recordLabel = bookingReady ? 'booking' : 'quote';
  const referenceLabel = bookingReady ? 'Booking ref' : 'Quote ref';
  const reference = bookingReady
    ? draft.dispatchedRefNumber ?? paymentLink.refNumber
    : draft.savedQuoteRef ?? paymentLink.refNumber;
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? `Your ${recordLabel} is ready. Please pay the 20% deposit using this secure payment link:`
      : `Your ${recordLabel} is ready. Please complete the full payment using this secure payment link:`,
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`${referenceLabel}: ${reference}`);
  lines.push(`Service: ${formatAssistedChatServiceType(draft.serviceType)}`);
  lines.push(paymentLink.kind === 'deposit' ? `Deposit due now: ${formatPence(paymentLink.amountPence)}` : `Amount due: ${formatPence(paymentLink.amountPence)}`);
  if (paymentLink.remainingBalancePence != null) lines.push(`Balance due on-site: ${formatPence(paymentLink.remainingBalancePence)}`);
  lines.push(`${bookingReady ? 'Total to pay' : 'Quote total'}: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
  if (tyreSummary.length > 0) {
    lines.push('Tyres:');
    tyreSummary.forEach((line) => lines.push(`- ${line}`));
  }
  return lines.join('\n');
}

function genericWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function AssistedChatScreen({ onLogout }: AssistedChatScreenProps = {}) {
  const { draft, hydrated, update, replace, clear } = useAssistedChatDraft();
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
  const [bookingInitialRef, setBookingInitialRef] = useState<string | null>(null);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [activeJobsOpen, setActiveJobsOpen] = useState(false);
  const [driverTrackingOpen, setDriverTrackingOpen] = useState(false);
  const [chatHubOpen, setChatHubOpen] = useState(false);
  const [messageSenderOpen, setMessageSenderOpen] = useState(false);
  const [virtualLandlineOpen, setVirtualLandlineOpen] = useState(false);
  const [trackingMapOpen, setTrackingMapOpen] = useState(false);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<AssistedChatStage | null>(null);
  const [mapSummaryOpen, setMapSummaryOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [headerInvoiceLoading, setHeaderInvoiceLoading] = useState(false);
  const [editPriceOpen, setEditPriceOpen] = useState(false);
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notifSetupOpen, setNotifSetupOpen] = useState(false);
  const [alertReadinessState, setAlertReadinessState] = useState<UrgentAlertsReadinessState>('checking');
  const [fullScreenIntentGranted, setFullScreenIntentGranted] = useState<boolean>(true);
  const [armingCycle, setArmingCycle] = useState(0);
  const notificationsStartupStarted = useRef(false);
  const notificationsStartupCompleted = useRef(false);
  const openBookingsInApp = useCallback((refNumber: string | null = null) => {
    setBookingInitialRef(refNumber);
    setBookingsOpen(true);
  }, []);
  const closeBookingsInApp = useCallback(() => {
    setBookingsOpen(false);
    setBookingInitialRef(null);
  }, []);

  const insets = useSafeAreaInsets();
  const bottomBarPaddingBottom = Math.max(insets.bottom + 8, 16);
  const scrollPaddingBottom = 132 + bottomBarPaddingBottom;

  useEffect(() => {
    logStartupModuleStarted('Assisted Chat screen');
    logStartupCheckpoint('Assisted Chat mounted');
    logStartupModuleCompleted('Assisted Chat screen');
  }, []);

  // ── Push Notifications ─────────────────────────────────────────────────────

  // Register and confirm urgent alert readiness after login/app startup.
  // We keep retrying while the app is open so the operator gets an explicit
  // armed/not-armed state instead of assuming alerts are active.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const markNotificationsStarted = () => {
      if (notificationsStartupStarted.current) return;
      notificationsStartupStarted.current = true;
      logStartupModuleStarted('Notifications initialization');
      logStartupCheckpoint('Notifications initialization started');
    };

    const markNotificationsCompleted = (details: Record<string, unknown>) => {
      if (notificationsStartupCompleted.current) return;
      notificationsStartupCompleted.current = true;
      logStartupCheckpoint('Notifications initialization completed', details);
      logStartupModuleCompleted('Notifications initialization', details);
    };

    const scheduleRetry = (attempt: number) => {
      const retryIndex = Math.min(attempt, ALERT_ARM_RETRY_DELAYS_MS.length - 1);
      const delay = ALERT_ARM_RETRY_DELAYS_MS[retryIndex];
      retryTimer = setTimeout(() => {
        void runAttempt(attempt + 1);
      }, delay);
    };

    const runAttempt = async (attempt: number) => {
      if (cancelled) return;
      markNotificationsStarted();
      try {
        setAlertReadinessState('checking');
        const result = await ensureUrgentAlertsArmed();
        if (cancelled) return;

        markNotificationsCompleted({
          armed: result.armed,
          fullScreenIntentGranted: result.fullScreenIntentGranted,
          watcherStarted: result.watcherStarted,
        });

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
      } catch (error) {
        logStartupModuleFailed('Notifications initialization', error);
        throw error;
      }
    };

    if (!api.hasAdminToken) {
      markNotificationsStarted();
      setAlertReadinessState('not_armed');
      markNotificationsCompleted({ skipped: 'missing-admin-token' });
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
  }, [armingCycle]);

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
      openBookingsInApp();
      void clearAdminBadge();
    });
    return () => {
      notifResponseRef.current?.remove();
    };
  }, [openBookingsInApp]);

  // Cold-start path: if a push notification tap stored the pending flag
  // before this screen mounted, open the bookings modal once.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const pending = await consumePendingOpenBookings();
      if (pending) {
        openBookingsInApp();
        void clearAdminBadge();
      }
    })();
  }, [openBookingsInApp]);

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
    openBookingsInApp();
  }, [markBookingsSeen, openBookingsInApp, urgentBookingId]);

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

  const handleOpenHeaderNotifications = useCallback(() => {
    setMoreOpen(false);
    if (hasNewCustomerBooking) {
      void markBookingsSeen();
      openBookingsInApp();
      return;
    }
    setNotifSetupOpen(true);
  }, [hasNewCustomerBooking, markBookingsSeen, openBookingsInApp]);

  const handleOpenHeaderChatHub = useCallback(() => {
    setMoreOpen(false);
    setChatHubOpen(true);
  }, []);

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
    draft.serviceType !== 'assess' &&
    draft.lockingNut.answer === 'no' &&
    draft.lockingNut.chargeGbp != null
      ? draft.lockingNut.chargeGbp
      : 0;
  const baseTotal = draft.quote?.total ?? 0;
  const backendBaseTotal = Math.round(
    (baseTotal -
      (
        typeof draft.quote?.adminAdjustmentAmount === 'number' &&
        Number.isFinite(draft.quote.adminAdjustmentAmount)
          ? draft.quote.adminAdjustmentAmount
          : 0
      )) * 100,
  ) / 100;
  const engineEffectiveTotal = baseTotal;
  const originalCalculatedPriceGbp = backendBaseTotal;
  // When the operator has typed a manual final price, that overrides the
  // backend total everywhere the customer-facing price is used. The override
  // is stored as a backend admin adjustment before save/finalize.
  const effectiveTotal = draft.manualPriceGbp != null ? draft.manualPriceGbp : engineEffectiveTotal;

  const price = useAssistedChatPrice({ draft, update });
  const locationShare = useAssistedChatLocationShare({ draft, update });
  const quoteActions = useAssistedChatQuoteActions({ draft, update, effectiveTotal, lockingNutCharge });
  const todayBookings = useTodayBookings();
  const recentCustomers = useRecentCustomers();
  const activeJobsForNearbyAlert = useActiveJobs(api.hasAdminToken);
  const nearbyAlertedBookingRefs = useRef<Set<string>>(new Set());
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
      const primaryTyre = primaryBookingTyreLine(draft);
      const tyreLines = buildBookingTyreLinePayload(draft.tyreLines);
      const item: TodayBookingItem = {
        bookingReference: response.refNumber,
        bookingId: response.bookingId,
        createdAtIso: new Date().toISOString(),
        paymentChoice,
        totalPence: Number.isFinite(total) ? Math.round(total * 100) : undefined,
        paymentLink: paymentLink?.paymentUrl,
        serviceType: draft.serviceType,
        customerPhone: draft.customer.phone || undefined,
        customerAddress: draft.location.address || undefined,
        tyreSize: primaryTyre.size || undefined,
        quantity: totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
      };
      todayBookings.addBooking(item);
      recentCustomers.saveCustomer({
        customerPhone: draft.customer.phone || undefined,
        customerName: draft.customer.name || undefined,
        customerEmail: draft.customer.email || undefined,
        customerAddress: draft.location.address || undefined,
        serviceType: draft.serviceType,
        lat: draft.location.lat,
        lng: draft.location.lng,
        postcode: draft.location.postcode,
        tyreSize: primaryTyre.size || undefined,
        quantity: totalBookingTyreQuantity(draft.tyreLines) || primaryTyre.quantity,
        tyreLines,
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

  // Whether the dispatched booking has both customer coordinates and a fresh
  // driver location fix — the prerequisites for the live tracking map.
  const trackingDriverLat = bookingTracking.data?.state.driverLat ?? null;
  const trackingDriverLng = bookingTracking.data?.state.driverLng ?? null;
  const trackingLastUpdatedAt = bookingTracking.data?.state.lastUpdatedAt ?? null;
  const trackingHasCustomerCoords =
    draft.location.lat != null && draft.location.lng != null;
  const trackingHasDriverLocation =
    trackingDriverLat != null && trackingDriverLng != null;
  // The live map can be opened whenever we have the booking ref + customer
  // location, even before the driver's first fix — the cockpit then shows the
  // customer marker and a "waiting for driver location" state.
  const canTrackDriver =
    trackingHasCustomerCoords &&
    draft.dispatchedRefNumber != null &&
    draft.dispatchedBookingId != null;
  // Driver fix older than 3 minutes (matching the backend stale window) reads stale.
  const trackingIsStale =
    trackingHasDriverLocation &&
    trackingLastUpdatedAt != null &&
    Date.now() - new Date(trackingLastUpdatedAt).getTime() > 180_000;
  const trackDriverHint = !trackingHasCustomerCoords
    ? 'Customer location unavailable'
    : !trackingHasDriverLocation
      ? 'Waiting for driver location'
      : trackingIsStale
        ? 'Tracking stale'
        : 'Live tracking available';

  // Stable ActiveJobItem for the dispatched booking so the live map modal can
  // reuse the existing /api/admin/active-jobs/[ref]/route endpoint. Driver
  // position is provided live by that endpoint, so it is intentionally kept
  // out of this memo to avoid resetting the map on every tracking poll.
  const trackingJob: ActiveJobItem | null = useMemo(() => {
    const ref = draft.dispatchedRefNumber;
    const id = draft.dispatchedBookingId;
    if (!ref || !id) return null;
    return {
      bookingRef: ref,
      bookingId: id,
      status: 'driver_assigned',
      scheduledAt: null,
      assignedAt: null,
      acceptedAt: null,
      customer: {
        name: draft.customer.name.trim() || 'Customer',
        phone: draft.customer.phone.trim() || null,
        address: draft.location.address || '',
        lat: draft.location.lat,
        lng: draft.location.lng,
      },
      driver: {
        id: '',
        name: 'Driver',
        phone: null,
        lat: null,
        lng: null,
        locationAt: null,
        locationSource: null,
        isStale: false,
      },
      paymentSummary: null,
      payment: null,
      distanceMiles: null,
      etaMinutes: null,
      driverSituation: {
        jobRef: ref,
        driverId: null,
        status: 'unavailable',
        label: 'Unavailable',
        dueBackAt: null,
        availableAfter: null,
        totalMinutes: null,
        delayMinutes: 0,
        reasons: ['route_unavailable'],
        reasonLabels: ['Route unavailable'],
        lastLocationAt: null,
        gpsState: null,
      },
    };
  }, [
    draft.dispatchedRefNumber,
    draft.dispatchedBookingId,
    draft.customer.name,
    draft.customer.phone,
    draft.location.address,
    draft.location.lat,
    draft.location.lng,
  ]);

  const currentActiveJob = useMemo(() => {
    return activeJobsForNearbyAlert.items.find((job) => {
      if (draft.dispatchedBookingId && job.bookingId === draft.dispatchedBookingId) return true;
      if (draft.dispatchedRefNumber && job.bookingRef === draft.dispatchedRefNumber) return true;
      return false;
    }) ?? null;
  }, [activeJobsForNearbyAlert.items, draft.dispatchedBookingId, draft.dispatchedRefNumber]);

  // Phone of the driver selected by the operator in DriverAssignSection.
  // Tracked only so the assign section can highlight the current pick.
  const [, setSelectedDriverPhone] = useState<string | null>(null);

  // Driver chat (admin_driver channel) stays inside the assisted-chat app.
  const [driverChatOpen, setDriverChatOpen] = useState(false);
  const handleOpenDriverChat = useCallback(() => {
    const bookingId = draft.dispatchedBookingId;
    if (!bookingId) return;
    setDriverChatOpen(true);
  }, [draft.dispatchedBookingId]);

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
  const paymentAutoCheckActive = activeStage === 'PAYMENT' || activeStage === 'DISPATCHED';
  // Admin-created Stripe payment links are verified by the backend checker.
  // Auto-checking runs only while the payment surface is visible.
  const paymentLinkActions = useAdminPaymentLink({
    draft,
    update,
    autoCheckActive: paymentAutoCheckActive,
  });
  const hasLocation = draft.location.lat != null && draft.location.lng != null;
  const hasTyre = hasAssistedChatTyre(draft);
  const quotePricingDistanceMiles = getQuotePricingDistanceMiles(draft.quote);
  const customerName = draft.customer.name.trim() || 'New customer';
  const customerPhone = draft.customer.phone.trim();
  const customerMessage = buildCustomerMessage({ draft, effectiveTotal, paymentChoice: draft.paymentChoice });
  const draftHasContent = hasDraftContent(draft);

  const flashNotice = useCallback((notice: ActionNotice) => {
    setActionNotice(notice);
    setTimeout(() => setActionNotice(null), 2200);
  }, []);

  const playDriverNearbyAlertSound = useCallback(() => {
    // Keep native launch isolated from native audio playback. The visual warning remains;
    // sound can be restored after TestFlight confirms this crash path is gone.
  }, []);

  useEffect(() => {
    if (!api.hasAdminToken) {
      nearbyAlertedBookingRefs.current.clear();
      return;
    }

    const jobs = activeJobsForNearbyAlert.items;
    const liveKeys = new Set(jobs.map((job) => job.bookingId || job.bookingRef));
    for (const key of Array.from(nearbyAlertedBookingRefs.current)) {
      if (!liveKeys.has(key)) nearbyAlertedBookingRefs.current.delete(key);
    }

    const nearbyJob = jobs.find((job) => {
      const eta = job.etaMinutes;
      if (eta == null || eta < 0 || eta > DRIVER_NEARBY_ALERT_MINUTES) return false;
      if (!job.driver.id || job.driver.isStale) return false;
      if (!['driver_assigned', 'en_route', 'arrived'].includes(job.status)) return false;
      const key = job.bookingId || job.bookingRef;
      return !nearbyAlertedBookingRefs.current.has(key);
    });

    if (!nearbyJob) return;

    const key = nearbyJob.bookingId || nearbyJob.bookingRef;
    nearbyAlertedBookingRefs.current.add(key);
    playDriverNearbyAlertSound();
    const eta = Math.max(0, Math.round(nearbyJob.etaMinutes ?? DRIVER_NEARBY_ALERT_MINUTES));
    flashNotice({
      kind: 'warn',
      text: `Driver is about ${eta} min away for ${nearbyJob.bookingRef}.`,
    });
  }, [activeJobsForNearbyAlert.items, flashNotice, playDriverNearbyAlertSound]);

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

  const handleCreateVirtualLandlineDraft = useCallback(
    (prefill: VirtualLandlineDraftPrefill) => {
      const matched = prefill.matchedCustomer;
      const phone = matched?.phone?.trim() || prefill.phone;
      const nextDraft: AssistedChatDraft = {
        ...EMPTY_DRAFT,
        customer: {
          phone,
          name: matched?.name?.trim() || '',
          email: matched?.email?.trim() || '',
        },
        virtualLandlineInteractionId: prefill.interactionId,
      };
      replace(nextDraft);
      setPhoneInput(phone);
      setPhoneSynced(true);
      setNoteInput('');
      setCallNotesInput('');
      setCallAssistMessage(null);
      setDuplicateAck(false);
      setEditingStage('CUSTOMER');
      flashNotice({ kind: 'ok', text: 'Virtual Landline call loaded into a new draft.' });
    },
    [flashNotice, replace],
  );

  const handlePhoneBlur = useCallback(() => {
    const phone = normalizeContactPhone(phoneInput);
    setPhoneInput(phone);
    update({ customer: { ...draft.customer, phone } });
  }, [draft.customer, phoneInput, update]);

  const handlePhoneChange = useCallback(
    (phone: string) => {
      setPhoneInput(phone);
      update({ customer: { ...draft.customer, phone } });
    },
    [draft.customer, update],
  );

  const handleEmailBlur = useCallback(() => {
    const email = normalizeEmailAddress(draft.customer.email);
    if (email !== draft.customer.email) {
      update({ customer: { ...draft.customer, email } });
    }
  }, [draft.customer, update]);

  const customerWhatsAppNumber = useMemo(() => {
    return normalizePhoneForWhatsApp(draft.customer.phone ?? '');
  }, [draft.customer.phone]);

  const customerDialNumber = useMemo(() => {
    return normalizePhoneForDial(draft.customer.phone ?? '');
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

  const handleDownloadHeaderInvoice = useCallback(async () => {
    const refNumber = draft.dispatchedRefNumber;
    if (!refNumber || headerInvoiceLoading) return;

    setHeaderInvoiceLoading(true);
    try {
      const result = await api.post<{ invoice: { id: string; invoiceNumber: string } }>(
        `/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}/invoice`,
        {},
      );
      const download = await downloadInvoicePdfToDevice({
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
      });
      flashNotice({
        kind: 'ok',
        text: download.openedSaveSheet
          ? `Invoice ${download.filename} ready to save.`
          : `Invoice ${download.filename} downloaded.`,
      });
    } catch (error) {
      flashNotice({
        kind: 'err',
        text: error instanceof Error ? error.message : 'Could not download invoice.',
      });
    } finally {
      setHeaderInvoiceLoading(false);
    }
  }, [draft.dispatchedRefNumber, flashNotice, headerInvoiceLoading]);

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
        serviceType: item.serviceType ?? 'fit',
        tyreLines: item.tyreLines?.length
          ? item.tyreLines
          : [createBookingTyreLine({ id: 'tyre-1', size: item.tyreSize ?? '', quantity: item.quantity ?? 1 })],
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
        tyreLines: [
          createBookingTyreLine({
            id: 'tyre-1',
            size: quote.tyreSize ?? '',
            quantity: quote.quantity,
          }),
        ],
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

    if (parsed.serviceType) {
      patch.serviceType = parsed.serviceType;
      patch.quote = null;
      patch.priceNeedsRefresh = Boolean(draft.quote || draft.priceNeedsRefresh);
      patch.paymentChoice = null;
      patch.paymentLink = null;
      patch.dispatchedRefNumber = null;
      patch.dispatchedBookingId = null;
      patch.savedQuoteId = null;
      patch.savedQuoteRef = null;
      applied.push(
        parsed.serviceType === 'repair'
          ? 'tyre repair'
          : parsed.serviceType === 'assess'
          ? 'inspection required'
          : 'replacement tyre',
      );
    }

    if (parsed.tyreSize || parsed.quantity) {
      const nextLines = buildBookingTyreLinePayload(draft.tyreLines);
      const firstLine = nextLines[0] ?? primaryBookingTyreLine(draft);
      patch.tyreLines = [
        {
          ...firstLine,
          ...(parsed.tyreSize ? { size: parsed.tyreSize } : {}),
          ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
        },
        ...nextLines.slice(1),
      ];
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

  const handleSendToDriver = useCallback(async () => {
    if (!draft.paymentChoice) return;
    const sent = await dispatch.choosePaymentAndDispatch(draft.paymentChoice);
    if (sent) setReviewOpen(false);
  }, [dispatch, draft.paymentChoice]);

  const handlePrimaryAction = useCallback(async () => {
    if (editingStage === 'LOCATION') {
      const method = draft.customer.phone.trim()
        ? 'whatsapp'
        : draft.customer.email.trim()
        ? 'email'
        : 'copy';
      await locationShare.requestLink(method);
      return;
    }

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
      openBookingsInApp(draft.dispatchedRefNumber);
    }
  }, [draft, editingStage, handleReviewDispatch, locationShare, openBookingsInApp, price, quoteActions, workflow]);

  const sheetActions = useMemo<SheetAction[]>(() => {
    const actions: SheetAction[] = [];
    const locationShareRelevant = !hasLocation || draft.location.status === 'pending' || Boolean(draft.location.link);
    const noToken = api.hasAdminToken ? null : 'Log in again before using admin actions.';

    actions.push(
      {
        id: 'today-bookings',
        label: `Today bookings (${todayBookings.count})`,
        description: 'Open bookings saved during this shift.',
        onPress: () => setHistoryOpen(true),
      },
      {
        id: 'recent-customers',
        label: 'Recent customers',
        description: 'Use details from a previous customer.',
        onPress: () => setRecentOpen(true),
      },
      {
        id: 'active-jobs',
        label: 'Active jobs',
        description: 'See jobs that are currently in progress.',
        disabledReason: noToken,
        onPress: () => setActiveJobsOpen(true),
      },
      {
        id: 'virtual-landline',
        label: 'Virtual Landline',
        icon: 'phone',
        description: 'Import and review Virtual Landline call history.',
        disabledReason: noToken,
        onPress: () => setVirtualLandlineOpen(true),
      },
      {
        id: 'driver-tracking',
        label: 'Tracking hub',
        description: 'Live map for all drivers and dispatch jobs.',
        disabledReason: noToken,
        onPress: () => setDriverTrackingOpen(true),
      },
      {
        id: 'chat-hub',
        label: 'Chat hub',
        description: 'All customer and driver conversations in one place.',
        disabledReason: noToken,
        onPress: () => setChatHubOpen(true),
      },
      {
        id: 'message-sender',
        label: 'Message sender',
        description: 'Send customer links and strong update templates.',
        onPress: () => setMessageSenderOpen(true),
      },
      {
        id: 'saved-quotes',
        label: 'Quotes',
        description: 'Find and reuse saved quotes.',
        disabledReason: noToken,
        onPress: () => setQuotesOpen(true),
      },
    );

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
          disabledReason: noToken ?? (!isValidUkPhone(draft.customer.phone) ? 'Add a valid UK mobile number first.' : null),
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
      onPress: () => openBookingsInApp(),
    });

    actions.push({
      id: 'admin-visitors',
      label: 'Visitors',
      description: 'Real-time visitor analytics and live feed.',
      disabledReason: noToken,
      onPress: () => setVisitorsOpen(true),
    });

    actions.push({
      id: 'admin-invoices',
      label: 'Invoices',
      description: 'Browse, send, and manage customer invoices.',
      disabledReason: noToken,
      onPress: () => setInvoicesOpen(true),
    });

    actions.push({
      id: 'admin-stock',
      label: 'Stock',
      description: 'Manage tyre stock levels, prices and availability.',
      disabledReason: noToken,
      onPress: () => setStockOpen(true),
    });

    actions.push({
      id: 'add-admin',
      label: 'Add Admin',
      icon: 'lock',
      description: 'Owner-protected admin account creation.',
      disabledReason: noToken,
      onPress: () => setAddAdminOpen(true),
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
    openBookingsInApp,
    quoteActions,
    todayBookings.count,
    urgentBookingId,
  ]);

  const primaryLabel = editingStage === 'LOCATION' ? 'Send Location Link' : editingStage ? 'Done Editing' : workflow.primaryActionLabel;
  const primaryDisabled = editingStage === 'LOCATION' ? Boolean(locationShare.busy) : editingStage ? false : workflow.primaryActionDisabled;
  const primaryDisabledReason = editingStage ? null : workflow.primaryActionDisabledReason;
  const hasCustomerSummary = Boolean(
    draft.customer.name.trim() || draft.customer.phone.trim() || draft.customer.email.trim(),
  );
  const showWorkflowSummary = Boolean(
    hasCustomerSummary ||
      hasLocation ||
      draft.location.status === 'pending' ||
      hasTyre ||
      (draft.quote && !draft.priceNeedsRefresh) ||
      savedQuoteRef ||
      draft.paymentChoice,
  );

  // Operator workflow projection: shared progress/next-action state derived
  // from the existing draft + workflow + quote/dispatch flags without
  // changing any backend behaviour.
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
        return 'tyre' as const;
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
  }, [activeStage]);
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
  const hasHeaderInvoiceRef = Boolean(draft.dispatchedRefNumber);
  const headerInvoiceBusy = headerInvoiceLoading;
  const headerNotificationUnreadCount = hasNewCustomerBooking ? 1 : 0;
  const headerNotificationVisualState: HeaderNotificationVisualState =
    alertReadinessState === 'checking'
      ? 'loading'
      : alertReadinessState === 'not_armed'
      ? 'offline'
      : 'ready';
  const heroStage = hasCustomerSummary ? activeStage : 'CUSTOMER';
  const heroCopy = heroCopyForStage(heroStage, customerName);
  const activePanelCopy = activePanelCopyForStage(activeStage);
  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          <PremiumAppHeader
            customerName={customerName}
            customerPhone={customerPhone || 'Add customer phone to call or WhatsApp'}
            heroTitle={heroCopy.title}
            heroHelper={heroCopy.helper}
            onMore={() => setMoreOpen(true)}
            onOpenChatHub={handleOpenHeaderChatHub}
            onOpenNotifications={handleOpenHeaderNotifications}
            notificationUnreadCount={headerNotificationUnreadCount}
            notificationState={headerNotificationVisualState}
            onCall={customerDialNumber ? handleCallCustomer : undefined}
            onWhatsApp={customerWhatsAppNumber ? handleOpenWhatsApp : undefined}
            onClearDraft={handleClear}
            clearDraftDisabled={!draftHasContent}
            onDownloadInvoice={hasHeaderInvoiceRef ? handleDownloadHeaderInvoice : undefined}
            invoiceBusy={headerInvoiceBusy}
          />

          {!api.hasAdminToken ? <InlineNotice kind="warn">No admin token. Log in to enable API calls.</InlineNotice> : null}
          {actionNotice ? <StatusBanner kind={actionNotice.kind} message={actionNotice.text} /> : null}
          {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind === 'ok' ? 'ok' : quoteActions.message.kind === 'err' ? 'err' : 'info'} message={quoteActions.message.text} /> : null}
          {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}

          <PrimaryActionDeck
            canCall={Boolean(customerDialNumber)}
            canWhatsApp={Boolean(customerWhatsAppNumber)}
            clearDraftDisabled={!draftHasContent}
            invoiceAvailable={hasHeaderInvoiceRef}
            invoiceBusy={headerInvoiceBusy}
            onCall={handleCallCustomer}
            onWhatsApp={handleOpenWhatsApp}
            onClearDraft={handleClear}
            onDownloadInvoice={handleDownloadHeaderInvoice}
          />

          <OperatorStepProgress
            steps={operatorSteps}
            activeStepId={activeOperatorStepId}
            onStepPress={handleSelectOperatorStep}
          />

          <ActiveWorkflowPanel
            icon={activePanelCopy.icon}
            title={activePanelCopy.title}
            helper={activePanelCopy.helper}
            tone={heroCopy.tone}
            plain={activeStage === 'LOCATION'}
          >
            {renderActiveStage({
              activeStage,
              draft,
              update,
              phoneInput,
              setPhoneInput,
              handlePhoneChange,
              handlePhoneBlur,
              handleEmailBlur,
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
              dispatch,
              handleCopyCustomerDetails,
              engineEffectiveTotal,
              originalCalculatedPriceGbp,
              setEditPriceOpen,
              breakdownVisible,
              setBreakdownVisible,
              openPaymentStage: () => setEditingStage('PAYMENT'),
              paymentLinkActions,
            })}
            {activeStage === 'DISPATCHED' && draft.dispatchedBookingId ? (
              <View style={styles.dispatchedStack}>
                <DriverAssignSection
                  bookingRef={draft.dispatchedRefNumber}
                  trackingData={bookingTracking.data}
                  customerLat={draft.location.lat}
                  customerLng={draft.location.lng}
                  onSelectDriver={(phone) => setSelectedDriverPhone(phone)}
                  onAssigned={() => { void bookingTracking.refresh(); }}
                />
                <BookingTrackingCard
                  data={bookingTracking.data}
                  ensureFailed={bookingTracking.ensureFailed}
                  busy={bookingTracking.busy}
                  customerPhone={draft.customer.phone.trim() || null}
                  onRetryEnsure={() => { void bookingTracking.ensure(); }}
                  onRefresh={() => { void bookingTracking.refresh(); }}
                  onTrackDriver={() => setTrackingMapOpen(true)}
                  canTrackDriver={canTrackDriver}
                  trackDriverHint={trackDriverHint}
                />
                <AppButton
                  label="Chat with driver"
                  variant="secondary"
                  onPress={handleOpenDriverChat}
                  disabled={!draft.dispatchedBookingId}
                  fullWidth
                />

                <SectionCard title="Payment">
                  {draft.paymentLink ? (
                    <>
                      <Text style={styles.paymentLinkAmount}>
                        Payment link created · {formatPence(draft.paymentLink.amountPence)}
                      </Text>
                      <View style={[
                        styles.paymentStatusBadge,
                        paymentLinkStatusBadgeStyle(paymentLinkActions.liveStatus),
                      ]}>
                        <Text style={[styles.paymentLinkStatus, { color: paymentLinkStatusColor(paymentLinkActions.liveStatus) }]}>
                          {getPaymentLinkStatusLabel(paymentLinkActions.liveStatus)}
                        </Text>
                      </View>
                      {paymentLinkActions.autoCheckMessage ? (
                        <Text style={styles.paymentAutoCheckText}>
                          {paymentLinkActions.autoCheckMessage}
                        </Text>
                      ) : null}
                      <AppButton
                        label="Copy link"
                        variant="secondary"
                        onPress={() => { void handleCopyPaymentLink(); }}
                        fullWidth
                      />
                      <AppButton
                        label="Send payment link"
                        variant="primary"
                        onPress={() => { void handleWhatsAppPaymentLink(); }}
                        fullWidth
                      />
                      <AppButton
                        label={paymentLinkActions.checking ? 'Checking Stripe...' : getStripeCheckButtonLabel(paymentLinkActions.liveStatus)}
                        variant="secondary"
                        onPress={() => { void paymentLinkActions.checkNow(); }}
                        loading={paymentLinkActions.checking}
                        disabled={paymentLinkActions.checking || paymentLinkActions.liveStatus === 'paid'}
                        fullWidth
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.paymentLinkHint}>
                        Create a Stripe link for the outstanding balance and send it to the customer.
                      </Text>
                      <AppButton
                        label="Create payment link"
                        variant="primary"
                        onPress={() => { void paymentLinkActions.createForDispatchedBooking(); }}
                        loading={paymentLinkActions.busy}
                        disabled={paymentLinkActions.busy}
                        fullWidth
                      />
                    </>
                  )}
                  {paymentLinkActions.error ? (
                    <StatusBanner kind="err" message={paymentLinkActions.error} />
                  ) : null}
                </SectionCard>
              </View>
            ) : null}
          </ActiveWorkflowPanel>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: bottomBarPaddingBottom }]}>
          <Pressable
            onPress={editingStage ? () => setEditingStage(null) : () => setMoreOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={editingStage ? 'Back' : 'Open quick actions'}
            style={({ pressed }) => [styles.bottomUtilityButton, pressed && styles.contactButtonPressed]}
          >
            <AppIcon name="bolt" size={26} color={colors.text} />
          </Pressable>
          <View style={styles.primaryWrap}>
            <PremiumBottomAction
              label={primaryLabel}
              helper={activeStage === 'LOCATION' ? 'Customer will receive the location link for confirmation' : primaryDisabledReason ?? 'Continue the assisted workflow'}
              onPress={() => {
                void handlePrimaryAction();
              }}
              loading={(editingStage === 'LOCATION' && Boolean(locationShare.busy)) || (!editingStage && (price.loading || quoteActions.busy === 'save' || quoteActions.busy === 'confirm' || dispatch.busy))}
              disabled={primaryDisabled}
            />
            {primaryDisabledReason ? <Text style={styles.primaryReason}>{primaryDisabledReason}</Text> : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      <GuidedActionSheet visible={moreOpen} title="More" actions={sheetActions} onClose={() => setMoreOpen(false)} />
      <DispatchReviewSheet
        visible={reviewOpen}
        draft={draft}
        activeQuote={activeQuote}
        selectedPaymentOption={selectedPaymentOption}
        effectiveTotal={effectiveTotal}
        quoteConfirmed={quoteConfirmed}
        dispatchBusy={dispatch.busy}
        dispatchError={dispatch.error}
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
      <AdminBookingsModal
        visible={bookingsOpen}
        onClose={closeBookingsInApp}
        initialRefNumber={bookingInitialRef}
      />
      <DeferredUrgentBookingPopup
        visible={urgentPopupOpen}
        booking={latestNewBooking}
        onOpenBookings={handleUrgentOpenBookings}
        onDismiss={handleUrgentDismiss}
      />
      <AdminVisitorsModal visible={visitorsOpen} onClose={() => setVisitorsOpen(false)} />
      <AdminInvoicesModal visible={invoicesOpen} onClose={() => setInvoicesOpen(false)} />
      <DeferredAdminStockModal visible={stockOpen} onClose={() => setStockOpen(false)} />
      <DeferredVirtualLandlineModal
        visible={virtualLandlineOpen}
        onClose={() => setVirtualLandlineOpen(false)}
        onCreateDraft={handleCreateVirtualLandlineDraft}
      />
      <AddAdminModal visible={addAdminOpen} onClose={() => setAddAdminOpen(false)} />
      <DeferredActiveJobsModal visible={activeJobsOpen} onClose={() => setActiveJobsOpen(false)} />
      <DeferredTrackingModal visible={driverTrackingOpen} onClose={() => setDriverTrackingOpen(false)} />
      <DeferredChatHubModal visible={chatHubOpen} onClose={() => setChatHubOpen(false)} />
      <MessageSenderModal
        visible={messageSenderOpen}
        draft={draft}
        effectiveTotal={effectiveTotal}
        trackingUrl={bookingTracking.data?.customerUrl ?? null}
        driverName={currentActiveJob?.driver.name ?? null}
        etaMinutes={currentActiveJob?.etaMinutes ?? draft.quote?.serviceOrigin?.etaMinutes ?? null}
        delayMinutes={currentActiveJob?.driverSituation.delayMinutes ?? null}
        locationBusy={locationShare.busy}
        canCreateLocationLink={api.hasAdminToken}
        onClose={() => setMessageSenderOpen(false)}
        onRequestLocation={locationShare.requestLink}
        onSaveCustomerContact={({ phone, email }) => {
          update({
            customer: {
              ...draft.customer,
              phone,
              email,
            },
          });
          setPhoneInput(phone);
        }}
        onNotice={flashNotice}
      />
      <DeferredActiveJobMapModal
        visible={trackingMapOpen}
        job={trackingJob}
        onClose={() => setTrackingMapOpen(false)}
      />
      <DeferredDriverChatModal
        visible={driverChatOpen}
        bookingId={draft.dispatchedBookingId}
        bookingRef={draft.dispatchedRefNumber}
        onClose={() => setDriverChatOpen(false)}
      />
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
        engineBaseTotal={backendBaseTotal}
        quickBookingId={draft.quickBookingId}
        onClose={() => setEditPriceOpen(false)}
        onSaved={(newPrice, quote) =>
          update({
            manualPriceGbp: newPrice,
            ...(quote ? { quote, priceNeedsRefresh: false } : {}),
          })
        }
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
  handlePhoneChange: (value: string) => void;
  handlePhoneBlur: () => void;
  handleEmailBlur: () => void;
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
  dispatch: ReturnType<typeof useAssistedChatDispatch>;
  handleCopyCustomerDetails: () => void | Promise<void>;
  engineEffectiveTotal: number;
  originalCalculatedPriceGbp: number;
  setEditPriceOpen: (value: boolean) => void;
  breakdownVisible: boolean;
  setBreakdownVisible: (value: boolean) => void;
  openPaymentStage: () => void;
  paymentLinkActions: ReturnType<typeof useAdminPaymentLink>;

}

function renderActiveStage(args: RenderActiveStageArgs) {
  const {
    activeStage,
    draft,
    update,
    phoneInput,
    handlePhoneChange,
    handlePhoneBlur,
    handleEmailBlur,
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
    dispatch,
    handleCopyCustomerDetails,
    engineEffectiveTotal,
    originalCalculatedPriceGbp,
    setEditPriceOpen,
    breakdownVisible,
    setBreakdownVisible,
    openPaymentStage,
    paymentLinkActions,
  } = args;

  if (activeStage === 'CUSTOMER') {
    const emailSuggestions = getEmailDomainSuggestions(draft.customer.email);

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
              onChangeText={handlePhoneChange}
              onBlur={handlePhoneBlur}
              placeholder="07... or 0141..."
              placeholderTextColor={colors.subtle}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <View style={styles.fieldGap} />
            <FieldLabel>
              {draft.customerEmailMode === 'send_customer_confirmation'
                ? 'Customer email *'
                : 'Customer email (optional)'}
            </FieldLabel>
            <TextInput
              value={draft.customer.email}
              onChangeText={(email) => update({ customer: { ...draft.customer, email } })}
              onBlur={handleEmailBlur}
              placeholder="you@example.com"
              placeholderTextColor={colors.subtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {emailSuggestions.length > 0 ? (
              <View style={styles.emailSuggestionRow}>
                {emailSuggestions.map((email) => (
                  <Pressable
                    key={email}
                    onPress={() => update({ customer: { ...draft.customer, email } })}
                    style={({ pressed }) => [
                      styles.emailSuggestionChip,
                      pressed && styles.emailSuggestionChipPressed,
                    ]}
                  >
                    <Text style={styles.emailSuggestionText} numberOfLines={1}>
                      {email}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.fieldGap} />
            {/* زر تبديل وضع البريد الإلكتروني */}
            <View style={styles.emailModeRow}>
              {(['walk_in_customer', 'send_customer_confirmation'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => update({ customerEmailMode: mode })}
                  style={[
                    styles.emailModeBtn,
                    draft.customerEmailMode === mode && styles.emailModeBtnActive,
                  ]}
                >
                  <Text style={[
                    styles.emailModeBtnText,
                    draft.customerEmailMode === mode && styles.emailModeBtnTextActive,
                  ]}>
                    {mode === 'walk_in_customer' ? 'Walk-in — no email' : 'Send confirmation'}
                  </Text>
                </Pressable>
              ))}
            </View>
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
        <DeferredLocationSection draft={draft} update={update} locationShare={locationShare} showInlineActions={false} />
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
      ? 'Enter a tyre size or choose Unknown / inspection required before getting the price.'
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
          originalCalculatedPriceGbp={originalCalculatedPriceGbp}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={false}
          payLabel="Choose payment"
          showPayAction={quoteConfirmed}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={openPaymentStage}
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
            serviceType={draft.serviceType}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? (
          <PaymentLinkInline
            link={draft.paymentLink}
            isManualPrice={draft.manualPriceGbp != null}
            liveStatus={paymentLinkActions.liveStatus}
            checking={paymentLinkActions.checking}
            error={paymentLinkActions.error}
            autoCheckMessage={paymentLinkActions.autoCheckMessage}
            onCheck={paymentLinkActions.checkNow}
          />
        ) : null}
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
          originalCalculatedPriceGbp={originalCalculatedPriceGbp}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={false}
          payLabel="Choose payment"
          showPayAction={quoteConfirmed}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={openPaymentStage}
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
            serviceType={draft.serviceType}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? (
          <PaymentLinkInline
            link={draft.paymentLink}
            isManualPrice={draft.manualPriceGbp != null}
            liveStatus={paymentLinkActions.liveStatus}
            checking={paymentLinkActions.checking}
            error={paymentLinkActions.error}
            autoCheckMessage={paymentLinkActions.autoCheckMessage}
            onCheck={paymentLinkActions.checkNow}
          />
        ) : null}
      </View>
    );
  }

  if (activeStage === 'CONFIRMATION') {
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
          originalCalculatedPriceGbp={originalCalculatedPriceGbp}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={false}
          payLabel="Choose payment"
          showPayAction={quoteConfirmed}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={openPaymentStage}
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
            serviceType={draft.serviceType}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? (
          <PaymentLinkInline
            link={draft.paymentLink}
            isManualPrice={draft.manualPriceGbp != null}
            liveStatus={paymentLinkActions.liveStatus}
            checking={paymentLinkActions.checking}
            error={paymentLinkActions.error}
            autoCheckMessage={paymentLinkActions.autoCheckMessage}
            onCheck={paymentLinkActions.checkNow}
          />
        ) : null}
      </View>
    );
  }

  if (activeStage === 'PAYMENT') {
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
          originalCalculatedPriceGbp={originalCalculatedPriceGbp}
          status={status}
          savedQuoteRef={savedQuoteRef}
          expiryText={quoteExpiryStatus}
          priceNeedsRefresh={draft.priceNeedsRefresh}
          priceLoading={price.loading}
          missingQuickBooking={!draft.quickBookingId || !draft.quote}
          saveBusy={quoteActions.busy === 'save'}
          payBusy={false}
          showPayAction={false}
          onEditPrice={() => setEditPriceOpen(true)}
          onSaveQuote={() => { void quoteActions.saveQuote(); }}
          onPay={() => {}}
          onToggleBreakdown={() => setBreakdownVisible(!breakdownVisible)}
          breakdownVisible={breakdownVisible}
        />
        <PaymentDispatchPanel
          effectiveTotal={effectiveTotal}
          selectedChoice={draft.paymentChoice}
          busy={dispatch.busy}
          paymentLink={draft.paymentLink}
          dispatchedRefNumber={draft.dispatchedRefNumber}
          onChoose={(choice) => { void dispatch.choosePaymentAndDispatch(choice); }}
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
            serviceType={draft.serviceType}
            showGetPriceAction={false}
            showPaymentOptions={false}
          />
        ) : null}
        {quoteActions.message ? <StatusBanner kind={quoteActions.message.kind} message={quoteActions.message.text} /> : null}
        {dispatch.error ? <StatusBanner kind="err" message={dispatch.error} /> : null}
        {draft.paymentLink ? (
          <PaymentLinkInline
            link={draft.paymentLink}
            isManualPrice={draft.manualPriceGbp != null}
            liveStatus={paymentLinkActions.liveStatus}
            checking={paymentLinkActions.checking}
            error={paymentLinkActions.error}
            autoCheckMessage={paymentLinkActions.autoCheckMessage}
            onCheck={paymentLinkActions.checkNow}
          />
        ) : null}
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
      if (!ctx.hasTyre) return 'Add tyre details or choose Unknown / inspection required before pricing.';
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
      if (!ctx.quoteConfirmed) return 'Approve the quote before dispatch.';
      if (!ctx.hasPaymentChoice) return 'Choose a payment option before dispatch.';
      return null;
  }
}

function tonePalette(tone: PremiumTone): {
  border: string;
  surface: string;
  soft: string;
  fg: string;
  shadow: string;
} {
  switch (tone) {
    case 'blue':
      return { border: colors.infoBorder, surface: colors.infoBg, soft: colors.blueBg, fg: colors.blue, shadow: colors.shadowCool };
    case 'green':
      return { border: colors.successBorder, surface: colors.successBg, soft: colors.successBg, fg: colors.success, shadow: colors.success };
    case 'red':
      return { border: colors.dangerBorder, surface: colors.dangerBg, soft: colors.dangerBg, fg: colors.danger, shadow: colors.danger };
    case 'warn':
      return { border: colors.warningBorder, surface: colors.warningBg, soft: colors.warningBg, fg: colors.warning, shadow: colors.warning };
    case 'neutral':
      return { border: colors.borderStrong, surface: colors.glass, soft: colors.panelSoft, fg: colors.muted, shadow: colors.shadowCool };
    case 'orange':
    default:
      return { border: colors.glowBorder, surface: colors.accentMuted, soft: colors.accentSoft, fg: colors.accent, shadow: colors.shadowWarm };
  }
}

function IconBadge({
  name,
  tone = 'orange',
  size = 'md',
}: {
  name: AppIconName;
  tone?: PremiumTone;
  size?: 'sm' | 'md' | 'lg';
}) {
  const palette = tonePalette(tone);
  const iconSize = size === 'lg' ? 24 : size === 'sm' ? 15 : 20;
  return (
    <View
      style={[
        styles.iconBadge,
        size === 'sm' && styles.iconBadgeSm,
        size === 'lg' && styles.iconBadgeLg,
        { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <AppIcon name={name} size={iconSize} color={palette.fg} />
    </View>
  );
}

function PremiumAppHeader({
  customerName,
  customerPhone,
  heroTitle,
  heroHelper,
  onMore,
  onOpenChatHub,
  onOpenNotifications,
  notificationUnreadCount,
  notificationState,
}: {
  customerName: string;
  customerPhone: string;
  heroTitle: string;
  heroHelper: string;
  onMore: () => void;
  onOpenChatHub: () => void;
  onOpenNotifications: () => void;
  notificationUnreadCount: number;
  notificationState: HeaderNotificationVisualState;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onClearDraft: () => void;
  clearDraftDisabled: boolean;
  onDownloadInvoice?: () => void;
  invoiceBusy: boolean;
}) {
  const titleParts = heroTitle.split(' ');
  const heroLead = titleParts.slice(0, -1).join(' ') || heroTitle;
  const heroAccent = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';
  const showCustomerMeta = customerName.trim().toLowerCase() !== 'new customer';
  return (
    <View style={styles.header} testID="assisted-chat-header">
      <HeaderVideoBackground />
      <View style={styles.headerTopRow}>
        <View style={styles.headerIdentityRow}>
          <Pressable
            onPress={onMore}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            testID="assisted-chat-header-more-button"
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.contactButtonPressed]}
          >
            <AppIcon name="bars" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTextBlock} testID="assisted-chat-header-info">
            <View style={styles.headerBrandRow}>
              <Pressable
                onPress={onOpenChatHub}
                accessibilityRole="button"
                accessibilityLabel="Open chat hub"
                testID="assisted-chat-header-chat-hub-button"
                style={({ pressed }) => [styles.assistedChatMarkButton, pressed && styles.contactButtonPressed]}
              >
                <View style={styles.assistedChatMark}>
                  <AppIcon name="comments-o" size={18} color={colors.accent} />
                </View>
              </Pressable>
              <Text style={styles.headerTitle} numberOfLines={1} testID="assisted-chat-header-title">Assisted Chat</Text>
            </View>
            <Text style={styles.headerCustomer} numberOfLines={1} ellipsizeMode="tail" testID="assisted-chat-header-customer">{showCustomerMeta ? customerName : ''}</Text>
            <Text style={styles.headerPhone} numberOfLines={1} ellipsizeMode="tail" testID="assisted-chat-header-phone">{showCustomerMeta ? customerPhone : ''}</Text>
          </View>
        </View>
        <View style={styles.headerUtilityRow}>
          <HeaderNotificationButton
            unreadCount={notificationUnreadCount}
            state={notificationState}
            onPress={onOpenNotifications}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.contactButtonPressed]}
          >
            <IconBadge name="user-circle" tone="blue" size="sm" />
          </Pressable>
        </View>
      </View>
      <View style={styles.heroCopyBlock}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          <Text>{heroLead}</Text>
          {heroAccent ? <Text style={styles.heroTitleAccent}> {heroAccent}</Text> : null}
        </Text>
        <Text style={styles.heroHelper} numberOfLines={2}>{heroHelper}</Text>
      </View>
    </View>
  );
}

function HeroPanel({
  title,
  helper,
  badge,
  tone,
}: {
  title: string;
  helper: string;
  badge: string;
  tone: PremiumTone;
}) {
  const palette = tonePalette(tone);
  return (
    <View style={[styles.heroPanel, { borderColor: palette.border }]}>
      <View style={styles.heroContent}>
        <View style={[styles.heroStatusBadge, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <View style={[styles.heroStatusDot, { backgroundColor: palette.fg }]} />
          <Text style={[styles.heroStatusText, { color: palette.fg }]} numberOfLines={1}>{badge}</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.heroHelper} numberOfLines={2}>{helper}</Text>
      </View>
    </View>
  );
}

function HeaderNotificationButton({
  unreadCount,
  state,
  onPress,
}: {
  unreadCount: number;
  state: HeaderNotificationVisualState;
  onPress: () => void;
}) {
  const badgeLabel = formatHeaderNotificationBadge(unreadCount, state);
  const accessibilityLabel = getHeaderNotificationAccessibilityLabel(unreadCount, state);
  const isLoading = state === 'loading';
  const isOffline = state === 'offline';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: isLoading }}
      testID="assisted-chat-header-notifications-button"
      style={({ pressed }) => [
        styles.headerNotificationButton,
        isOffline && styles.headerNotificationButtonOffline,
        pressed && !isOffline && styles.headerNotificationButtonPressed,
      ]}
    >
      <View style={styles.notificationBellGlow} />
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <AppIcon name="bell-o" size={21} color={isOffline ? colors.disabledText : colors.text} />
      )}
      {badgeLabel ? (
        <View style={styles.notificationBadge} testID="assisted-chat-header-notification-badge">
          <Text style={styles.notificationBadgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function HeaderVideoBackground() {
  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.headerVideoLayer, styles.pointerNone]} testID="assisted-chat-header-video-background">
        <HeaderVideoFallback />
      </View>
    );
  }

  return <HeaderVideoBackgroundWeb />;
}

function HeaderVideoBackgroundWeb() {
  const videoAsset = useMemo(() => {
    try {
      return Asset.fromModule(assistedChatHeaderVideoSource);
    } catch {
      if (__DEV__) {
        throw new Error('Assisted Chat header video asset could not be resolved.');
      }
      return null;
    }
  }, []);
  const webVideoRef = useRef<{ play?: () => Promise<void> | void; pause?: () => void } | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoDiagnostic, setVideoDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const preload = async () => {
      if (!videoAsset) {
        if (mounted) {
          setVideoFailed(true);
          setVideoDiagnostic('asset-module-unresolved');
        }
        return;
      }

      try {
        const loadedVideo = await videoAsset.downloadAsync();
        if (!mounted) return;
        const bundledUri = loadedVideo.localUri ?? videoAsset.localUri ?? loadedVideo.uri ?? videoAsset.uri ?? null;
        const validation = validateHeaderVideoUri(bundledUri, false);

        if (!validation.ok) {
          setVideoFailed(true);
          setVideoDiagnostic(validation.reason ?? 'invalid-video-uri');
          return;
        }

        setVideoUri(bundledUri);
        setVideoStarted(false);
        setVideoFailed(false);
        setVideoDiagnostic(null);
      } catch {
        if (mounted) {
          setVideoFailed(true);
          setVideoDiagnostic('asset-preload-failed');
        }
      }
    };

    void preload();

    return () => {
      mounted = false;
    };
  }, [videoAsset]);

  const sendVideoCommand = useCallback((command: 'pause' | 'play') => {
    if (command === 'pause') {
      webVideoRef.current?.pause?.();
      return;
    }

    const playResult = webVideoRef.current?.play?.();
    if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
      (playResult as Promise<void>).catch(() => {
        setVideoDiagnostic('web-playback-rejected');
      });
    }
  }, []);

  useEffect(() => {
    const onFocus = () => sendVideoCommand('play');
    const onBlur = () => sendVideoCommand('pause');
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
      }
    };
  }, [sendVideoCommand]);

  useEffect(() => {
    if (!videoUri || videoStarted || videoFailed) return undefined;

    const startupTimer = setTimeout(() => {
      setVideoFailed(true);
      setVideoDiagnostic('startup-timeout');
    }, 5000);

    return () => clearTimeout(startupTimer);
  }, [videoFailed, videoStarted, videoUri]);

  useEffect(() => {
    if (__DEV__ && videoDiagnostic) {
      console.warn('[assisted-chat-header-video]', sanitizeHeaderVideoDiagnostic(videoDiagnostic));
    }
  }, [videoDiagnostic]);

  const showFallback = shouldShowHeaderVideoFallback({ videoStarted, videoFailed, videoUri });

  return (
    <View style={[styles.headerVideoLayer, styles.pointerNone]} testID="assisted-chat-header-video-background">
      {showFallback ? <HeaderVideoFallback /> : null}
      {videoUri && !videoFailed
        ? createElement('video', {
            ref: webVideoRef,
            src: videoUri,
            autoPlay: true,
            muted: true,
            loop: true,
            playsInline: true,
            preload: 'auto',
            controls: false,
            'aria-hidden': true,
            tabIndex: -1,
            onPlaying: () => setVideoStarted(true),
            onPause: () => setVideoStarted(false),
            onEnded: () => setVideoStarted(false),
            onError: () => {
              setVideoFailed(true);
              setVideoDiagnostic('web-media-error');
            },
            style: {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: videoStarted ? 1 : 0,
              pointerEvents: 'none',
            },
          })
        : null}
    </View>
  );
}

function HeaderVideoFallback() {
  return (
    <View style={styles.headerVideoFallback}>
      <View style={styles.headerVideoFallbackSoftLight} />
      <View style={styles.headerVideoFallbackSurface} />
    </View>
  );
}

function PrimaryActionDeck({
  canCall,
  canWhatsApp,
  clearDraftDisabled,
  invoiceAvailable,
  invoiceBusy,
  onCall,
  onWhatsApp,
  onClearDraft,
  onDownloadInvoice,
}: {
  canCall: boolean;
  canWhatsApp: boolean;
  clearDraftDisabled: boolean;
  invoiceAvailable: boolean;
  invoiceBusy: boolean;
  onCall: () => void;
  onWhatsApp: () => void;
  onClearDraft: () => void;
  onDownloadInvoice: () => void;
}) {
  return (
    <View style={styles.headerActionsRow} testID="assisted-chat-header-actions">
      <PrimaryActionCard
        icon="phone"
        tone="blue"
        disabled={!canCall}
        onPress={onCall}
        accessibilityLabel="Call customer"
        testID="assisted-chat-header-call-button"
      />
      <PrimaryActionCard
        icon="whatsapp"
        tone="green"
        disabled={!canWhatsApp}
        onPress={onWhatsApp}
        accessibilityLabel="Send via WhatsApp"
        testID="assisted-chat-header-whatsapp-button"
      />
      {invoiceAvailable ? (
        <PrimaryActionCard
          icon="file-pdf-o"
          tone="blue"
          loading={invoiceBusy}
          disabled={invoiceBusy}
          onPress={onDownloadInvoice}
          accessibilityLabel="Download invoice"
          testID="assisted-chat-header-invoice-button"
        />
      ) : null}
      <PrimaryActionCard
        icon="trash"
        tone="red"
        disabled={clearDraftDisabled}
        onPress={onClearDraft}
        accessibilityLabel="Clear draft"
        testID="assisted-chat-header-clear-draft-button"
      />
    </View>
  );
}

function PrimaryActionCard({
  icon,
  tone,
  disabled,
  loading,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: AppIconName;
  tone: PremiumTone;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
}) {
  const isDisabled = Boolean(disabled || loading);
  const palette = tonePalette(tone);
  const { pressScaleStyle, pressIn, pressOut } = usePressScale(isDisabled, 0.975);
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDisabled) {
      glow.stopAnimation();
      glow.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, isDisabled]);

  const ringStyle = {
    opacity: glow.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.14, 0.44, 0.14],
    }),
    transform: [
      {
        scale: glow.interpolate({
          inputRange: [0, 1],
          outputRange: [0.88, 1.18],
        }),
      },
    ],
  };
  const iconLiftStyle = {
    transform: [
      {
        translateY: glow.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, -1.5, 0],
        }),
      },
    ],
  };
  const shineStyle = {
    opacity: glow.interpolate({
      inputRange: [0, 0.24, 0.52, 1],
      outputRange: [0, 0.2, 0.5, 0],
    }),
    transform: [
      {
        translateX: glow.interpolate({
          inputRange: [0, 1],
          outputRange: [-30, 30],
        }),
      },
      { rotate: '-18deg' },
    ],
  };

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      testID={testID}
      style={({ pressed }) => [
        styles.actionCard,
        { borderColor: palette.border, backgroundColor: palette.surface },
        disabled && styles.actionCardDisabled,
        pressed && !isDisabled && styles.actionCardPressed,
      ]}
    >
      <Animated.View style={[styles.actionCardInner, pressScaleStyle]}>
        <View style={styles.actionGlyphFrame}>
          <Animated.View
            style={[
              styles.actionGlyphRing,
              {
                borderColor: palette.border,
                backgroundColor: palette.soft,
              },
              ringStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.actionGlyph,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
              iconLiftStyle,
            ]}
          >
            <View style={[styles.actionGlyphCore, { backgroundColor: palette.soft }]}>
              <AppIcon name={icon} size={24} color={palette.fg} />
            </View>
            <Animated.View style={[styles.actionGlyphShine, shineStyle]} />
          </Animated.View>
        </View>
        {loading ? <ActivityIndicator color={palette.fg} style={styles.actionCardLoader} /> : null}
      </Animated.View>
    </Pressable>
  );
}

function ActiveWorkflowPanel({
  icon,
  title,
  helper,
  tone,
  plain = false,
  children,
}: {
  icon: AppIconName;
  title: string;
  helper: string;
  tone: PremiumTone;
  plain?: boolean;
  children: ReactNode;
}) {
  const palette = tonePalette(tone);
  if (plain) {
    return <View style={styles.activePanelPlain}>{children}</View>;
  }
  return (
    <View style={[styles.activeStepBlock, { borderColor: palette.border }]}>
      <View style={styles.activePanelHeader}>
        <IconBadge name={icon} tone={tone} size="lg" />
        <View style={styles.activePanelCopy}>
          <Text style={styles.activePanelTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.activePanelHelper} numberOfLines={2}>{helper}</Text>
        </View>
      </View>
      <View style={styles.activePanelBody}>{children}</View>
    </View>
  );
}

function PremiumBottomAction({
  label,
  helper,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  helper: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { pressScaleStyle, pressIn, pressOut } = usePressScale(disabled || loading, 0.985);
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.premiumCta,
        disabled && styles.premiumCtaDisabled,
        pressed && !disabled && !loading && styles.premiumCtaPressed,
      ]}
    >
      <Animated.View style={[styles.premiumCtaInner, pressScaleStyle]}>
        <View style={styles.premiumCtaIcon}>
          {loading ? <ActivityIndicator color={colors.text} /> : <AppIcon name="paper-plane" size={24} color={colors.text} />}
        </View>
        <View style={styles.premiumCtaCopy}>
          <Text style={styles.premiumCtaLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.premiumCtaHelper} numberOfLines={1}>{helper}</Text>
        </View>
        <AppIcon name="chevron-right" size={24} color={colors.accentText} />
      </Animated.View>
    </Pressable>
  );
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
  const markerStyle = [
    styles.summaryMarker,
    done && styles.summaryMarkerDone,
    active && styles.summaryMarkerActive,
  ];
  const content = (
    <View style={styles.summaryMain}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue} numberOfLines={title === 'Tyre' ? 3 : 1}>{value}</Text>
      <Text style={styles.summaryDetail} numberOfLines={2}>{detail}</Text>
    </View>
  );

  if (rightLabel && onRightPress) {
    return (
      <View style={cardStyle}>
        <View style={markerStyle}>
          <View style={styles.summaryMarkerDot} />
        </View>
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
      <View style={markerStyle}>
        <View style={styles.summaryMarkerDot} />
      </View>
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

function paymentLinkStatusColor(status: PaymentLinkLiveStatus | null): string {
  switch (status) {
    case 'paid':
      return colors.success;
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return colors.danger;
    case 'expired':
    case 'partial':
    case 'checking':
      return colors.warning;
    case 'awaiting':
    default:
      return colors.warning;
  }
}

function paymentLinkStatusBadgeStyle(status: PaymentLinkLiveStatus | null): ViewStyle | null {
  switch (status) {
    case 'paid':
      return styles.paymentStatusBadgePaid;
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return styles.paymentStatusBadgeFailed;
    case 'expired':
    case 'partial':
    case 'checking':
      return styles.paymentStatusBadgeChecking;
    case 'awaiting':
    default:
      return null;
  }
}

function PaymentLinkInline({
  link,
  isManualPrice = false,
  liveStatus,
  checking,
  error,
  autoCheckMessage,
  onCheck,
}: {
  link: StripePaymentLinkState;
  isManualPrice?: boolean;
  liveStatus: PaymentLinkLiveStatus | null;
  checking: boolean;
  error: string | null;
  autoCheckMessage: string | null;
  onCheck: () => Promise<PaymentLinkLiveStatus | null>;
}) {
  const kindLabel = link.kind === 'deposit' ? 'Deposit payment link' : 'Full payment link';
  const handleOpen = (): void => {
    void Linking.openURL(link.paymentUrl);
  };
  const handleCopy = (): void => {
    void copyToClipboard(link.paymentUrl);
  };
  const statusLabel = getPaymentLinkStatusLabel(liveStatus);
  const checkLabel = checking ? 'Checking Stripe...' : getStripeCheckButtonLabel(liveStatus);
  const checkDisabled = checking || liveStatus === 'paid';
  return (
    <SectionCard title={kindLabel}>
      <Text style={styles.paymentLinkMeta} numberOfLines={2}>{link.paymentUrl}</Text>
      <Text style={styles.paymentLinkMeta}>Amount: {formatPence(link.amountPence)}</Text>
      {isManualPrice ? (
        <Text style={styles.paymentLinkMeta}>Manual price used for payment</Text>
      ) : null}
      <View style={[styles.paymentStatusBadge, paymentLinkStatusBadgeStyle(liveStatus)]}>
        <Text style={[styles.paymentLinkStatus, { color: paymentLinkStatusColor(liveStatus) }]}>
          {statusLabel}
        </Text>
      </View>
      {autoCheckMessage ? (
        <Text style={styles.paymentAutoCheckText}>{autoCheckMessage}</Text>
      ) : null}
      <View style={styles.paymentLinkActions}>
        <AppButton label="Copy link" variant="secondary" onPress={handleCopy} style={styles.flexActionButton} />
        <AppButton label="Open" variant="ghost" onPress={handleOpen} style={styles.flexActionButton} />
        <AppButton
          label={checkLabel}
          variant="secondary"
          onPress={() => { void onCheck(); }}
          loading={checking}
          disabled={checkDisabled}
          style={styles.flexActionButton}
        />
      </View>
      {error ? <StatusBanner kind="err" message={error} /> : null}
    </SectionCard>
  );
}

const SHEET_ACTION_ICONS: Record<string, AppIconName> = {
  'today-bookings': 'calendar-check-o',
  'recent-customers': 'users',
  'active-jobs': 'briefcase',
  'driver-tracking': 'map',
  'chat-hub': 'comments-o',
  'message-sender': 'paper-plane',
  'saved-quotes': 'file-text-o',
  'copy-location-link': 'link',
  'location-whatsapp': 'whatsapp',
  'location-sms': 'mobile',
  'location-email': 'envelope-o',
  'open-maps': 'map-marker',
  'open-directions': 'location-arrow',
  'open-waze': 'road',
  'copy-route': 'copy',
  'copy-coords': 'crosshairs',
  'copy-quote-message': 'quote-left',
  'send-quote': 'send',
  'copy-customer-message': 'commenting-o',
  'send-customer-whatsapp': 'whatsapp',
  'copy-job-details': 'clipboard',
  'copy-payment-instructions': 'credit-card',
  'copy-payment-link': 'link',
  'open-payment-link': 'external-link',
  'whatsapp-payment-link': 'whatsapp',
  'admin-bookings': 'list-alt',
  'virtual-landline': 'phone',
  'admin-visitors': 'line-chart',
  'admin-invoices': 'file-pdf-o',
  'admin-stock': 'cubes',
  'add-admin': 'lock',
  'notification-setup': 'bell-o',
  'test-urgent-alert': 'exclamation-triangle',
  'clear-draft': 'trash',
  logout: 'sign-out',
};

function iconForSheetAction(action: SheetAction): AppIconName {
  return action.icon ?? SHEET_ACTION_ICONS[action.id] ?? 'circle-o';
}

function PaymentDispatchPanel({
  effectiveTotal,
  selectedChoice,
  busy,
  paymentLink,
  dispatchedRefNumber,
  onChoose,
}: {
  effectiveTotal: number;
  selectedChoice: AssistedChatPaymentChoice | null;
  busy: boolean;
  paymentLink: StripePaymentLinkState | null;
  dispatchedRefNumber: string | null;
  onChoose: (choice: AssistedChatPaymentChoice) => void;
}) {
  const totalPence = Math.max(0, Math.round(effectiveTotal * 100));
  const deposit = getDepositSummary(totalPence);
  const disabled = busy || Boolean(dispatchedRefNumber);
  const doneMessage = dispatchedRefNumber
    ? paymentLink
      ? `${paymentLink.kind === 'deposit' ? '20% deposit' : 'Full payment'} link ready for ${dispatchedRefNumber}.`
      : `Booking ${dispatchedRefNumber} created as cash on arrival.`
    : null;
  const options: Array<{ choice: AssistedChatPaymentChoice; label: string; detail: string }> = [
    { choice: 'full', label: 'Full payment link', detail: `Stripe link for ${formatPence(totalPence)}.` },
    {
      choice: 'deposit',
      label: 'Deposit 20%',
      detail: `${formatPence(deposit.depositAmountPence)} now. ${formatPence(deposit.remainingBalancePence)} balance on arrival.`,
    },
    { choice: 'cash', label: 'Cash on arrival', detail: `Driver collects ${formatPence(totalPence)} from the customer.` },
  ];

  return (
    <SectionCard title="Payment">
      <View style={styles.readySummary}>
        <DetailRow label="Quote total" value={formatPence(totalPence)} />
      </View>
      <View style={styles.paymentList}>
        {options.map((option) => {
          const selected = selectedChoice === option.choice;
          return (
            <Pressable
              key={option.choice}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChoose(option.choice)}
              style={({ pressed }) => [
                styles.paymentOption,
                selected && styles.paymentOptionSelected,
                pressed && !disabled && styles.paymentOptionPressed,
                disabled && styles.paymentOptionDisabled,
              ]}
            >
              <View style={styles.radioOuter}>
                {busy && selected ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : selected ? (
                  <View style={styles.radioInner} />
                ) : null}
              </View>
              <View style={styles.paymentCopy}>
                <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>{option.label}</Text>
                <Text style={styles.paymentDetail}>{option.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {doneMessage ? <StatusBanner kind="ok" message={doneMessage} /> : null}
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
            <AppButton label="Close" variant="danger" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetList}>
            {actions.map((action) => {
              const disabled = Boolean(action.disabledReason);
              const iconName = iconForSheetAction(action);
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
                  <View style={styles.sheetActionRow}>
                    <View
                      style={[
                        styles.sheetActionIcon,
                        action.destructive && styles.sheetActionDangerIcon,
                        disabled && styles.sheetActionIconDisabled,
                      ]}
                    >
                      <AppIcon
                        name={iconName}
                        size={17}
                        color={action.destructive ? colors.danger : disabled ? colors.muted : colors.accent}
                      />
                    </View>
                    <View style={styles.sheetActionCopy}>
                      <View style={styles.sheetActionLabelRow}>
                        <Text
                          style={[styles.sheetActionLabel, action.destructive && styles.sheetActionDangerLabel]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {action.label}
                        </Text>
                        <AppIcon
                          name="angle-right"
                          size={16}
                          color={disabled ? colors.subtle : action.destructive ? colors.danger : colors.muted}
                          style={styles.sheetActionChevron}
                        />
                      </View>
                      {action.description ? (
                        <Text style={styles.sheetActionDescription} numberOfLines={2}>
                          {action.description}
                        </Text>
                      ) : null}
                      {action.disabledReason ? <Text style={styles.sheetActionReason}>{action.disabledReason}</Text> : null}
                    </View>
                  </View>
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
  dispatchError,
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
  dispatchError: string | null;
  onClose: () => void;
  onSend: () => void;
}) {
  const distanceMiles = getQuotePricingDistanceMiles(draft.quote);
  const driveTime = draft.quote?.serviceOrigin?.etaMinutes ?? null;
  const stripeCharge =
    draft.paymentChoice === 'deposit'
      ? effectiveTotal * 0.20
      : draft.paymentChoice === 'full'
      ? effectiveTotal
      : null;
  const stripeAmountTooLow = stripeCharge != null && stripeCharge < 0.30;
  const canSend = Boolean(draft.paymentChoice && draft.quote && draft.quickBookingId && quoteConfirmed && !draft.dispatchedRefNumber && !stripeAmountTooLow);
  const disabledReason = !draft.quote
    ? 'Get a price before dispatching.'
    : !draft.quickBookingId
    ? 'Get a current quick booking before dispatching.'
    : !quoteConfirmed
    ? 'Confirm the saved quote before dispatching.'
    : !draft.paymentChoice
    ? 'Choose a payment option before dispatching.'
    : stripeAmountTooLow && stripeCharge != null
    ? `Payment link cannot be sent for ${formatGbp(stripeCharge)}. Stripe minimum is £0.30. Edit the quote price or choose cash.`
    : draft.dispatchedRefNumber
    ? `Already dispatched as ${draft.dispatchedRefNumber}.`
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.reviewBackdrop}>
        <View style={styles.reviewSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Review dispatch</Text>
            <AppButton label="Close" variant="danger" onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <ScrollView contentContainerStyle={styles.reviewContent}>
            <DetailRow label="Customer" value={draft.customer.name.trim() || 'New customer'} />
            <DetailRow label="Phone" value={draft.customer.phone.trim() || 'Not set'} />
            <DetailRow label="Service" value={formatAssistedChatServiceType(draft.serviceType)} />
            <DetailRow label="Tyres" value={summarizeBookingTyreLines(draft.tyreLines).join('\n') || 'Not set'} />
            <DetailRow label="Address/location" value={draft.location.address.trim() || draft.location.status} />
            <DetailRow label="Price" value={formatGbp(effectiveTotal)} />
            <DetailRow label="Quote ref" value={activeQuote?.quoteRef ?? draft.savedQuoteRef ?? 'Not saved'} />
            <DetailRow label="Selected payment" value={paymentOptionLabel(selectedPaymentOption)} />
            <DetailRow label="Payment status" value={draft.paymentLink ? 'Payment link ready' : draft.paymentChoice ? paymentChoiceLabel(draft.paymentChoice) : 'Not selected'} />
            <DetailRow label="Distance" value={distanceMiles != null ? `${distanceMiles.toFixed(1)} miles` : 'Not available'} />
            <DetailRow label="Drive time" value={driveTime != null ? `${driveTime} minutes` : 'Not available'} />
            <DetailRow label="Driver/admin note" value={draft.note.trim() || 'None'} />
            {disabledReason ? <StatusBanner kind="warn" message={disabledReason} /> : null}
            {dispatchError ? <StatusBanner kind="err" message={dispatchError} /> : null}
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
  minHeight: 50,
  borderColor: colors.borderStrong,
  borderWidth: 1,
  borderRadius: radius.md,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: fontSize.md,
  color: colors.text,
  backgroundColor: colors.inputBg,
};

const premiumPanelShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 18px 42px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.36,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 6,
      }
) as ViewStyle;

const compactCardShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 28px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.28,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 9 },
        elevation: 4,
      }
) as ViewStyle;

const warmActionShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 28px rgba(255,122,24,0.32), 0 0 22px rgba(255,122,24,0.20)' }
    : {
        shadowColor: colors.shadowWarm,
        shadowOpacity: 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
      }
) as ViewStyle;

const coolActionShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 12px 28px rgba(92,167,255,0.22)' }
    : {
        shadowColor: colors.shadowCool,
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }
) as ViewStyle;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  pointerNone: { pointerEvents: 'none' },
  keyboardAvoider: { flex: 1, zIndex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: {
    minHeight: 220,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 0,
    backgroundColor: 'rgba(4,7,20,0.92)',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 0,
    ...(premiumPanelShadow ?? {}),
  },
  headerVideoLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  headerVideoNative: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  headerVideoHidden: {
    opacity: 0,
  },
  headerVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,20,0.96)',
  },
  headerVideoFallbackSoftLight: {
    position: 'absolute',
    left: -80,
    right: 24,
    bottom: -90,
    height: 170,
    borderRadius: 120,
    backgroundColor: 'rgba(255,123,18,0.16)',
    opacity: 0.72,
  },
  headerVideoFallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,20,0.42)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'nowrap',
    minHeight: 46,
    zIndex: 4,
  },
  headerIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: '100%',
    paddingRight: 112,
  },
  headerTextBlock: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: ASSISTED_CHAT_HEADER_INFO_MIN_WIDTH,
    minWidth: 0,
    maxWidth: '100%',
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  assistedChatMarkButton: {
    borderRadius: 15,
  },
  assistedChatMark: {
    width: 34,
    height: 34,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: 'rgba(255,122,24,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  headerCustomer: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900', marginTop: 3, minWidth: 0 },
  headerPhone: { color: colors.muted, fontSize: 11, marginTop: 1, fontWeight: '800', minWidth: 0 },
  headerUtilityRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    flexShrink: 0,
    zIndex: 5,
  },
  headerIconButton: {
    minWidth: 46,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 23,
    backgroundColor: 'rgba(17,27,51,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(compactCardShadow ?? {}),
  },
  headerNotificationButton: {
    minWidth: 46,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    borderRadius: 23,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    ...(warmActionShadow ?? {}),
  },
  headerNotificationButtonPressed: {
    opacity: 0.84,
  },
  headerNotificationButtonOffline: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.glassStrong,
    opacity: 0.72,
  },
  notificationBellGlow: {
    position: 'absolute',
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
  },
  notificationBadge: {
    position: 'absolute',
    right: -3,
    top: -5,
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
    paddingHorizontal: 4,
  },
  notificationBadgeText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '900',
  },
  headerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 10,
  },
  compactContactButton: {
    minHeight: ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    ...(warmActionShadow ?? {}),
  },
  callButton: { backgroundColor: colors.accent, borderColor: colors.accent },
  whatsappButton: { backgroundColor: '#25D366', borderColor: '#1FB855' },
  compactContactLabel: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: '800' },
  headerInvoiceButton: {
    minHeight: ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 132,
    minWidth: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
    paddingHorizontal: 12,
    ...(coolActionShadow ?? {}),
  },
  headerInvoiceButtonDisabled: {
    opacity: 0.62,
  },
  headerInvoiceLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerWhatsAppButton: {
    minHeight: ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 94,
    minWidth: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1FB855',
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    ...(compactCardShadow ?? {}),
  },
  headerWhatsAppButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.card,
    opacity: 0.72,
  },
  headerWhatsAppLabel: {
    color: '#052E16',
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerWhatsAppLabelDisabled: { color: colors.muted },
  headerClearDraftButton: {
    minHeight: ASSISTED_CHAT_HEADER_MIN_BUTTON_HEIGHT,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 108,
    minWidth: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 12,
    ...(compactCardShadow ?? {}),
  },
  headerClearDraftButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.card,
    opacity: 0.58,
  },
  headerClearDraftLabel: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerClearDraftLabelDisabled: { color: colors.muted },
  contactButtonPressed: { opacity: 0.82 },
  scroll: { paddingHorizontal: 14, paddingTop: 0, gap: 10, paddingBottom: 148 },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSm: { width: 26, height: 26, borderRadius: 10 },
  iconBadgeLg: { width: 56, height: 56, borderRadius: 20 },
  heroPanel: {
    minHeight: 212,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.hero,
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    padding: space.lg,
    ...(premiumPanelShadow ?? {}),
  },
  heroContent: {
    flex: 1,
    minWidth: 0,
    zIndex: 2,
    justifyContent: 'flex-end',
    paddingRight: 86,
  },
  heroStatusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: space.sm,
  },
  heroStatusDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatusText: { fontSize: fontSize.xs, fontWeight: '900' },
  heroTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
    letterSpacing: 0,
  },
  heroTitleAccent: { color: colors.accent },
  heroHelper: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 20,
    marginTop: 3,
    maxWidth: 330,
  },
  heroCopyBlock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    zIndex: 3,
  },
  actionCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(compactCardShadow ?? {}),
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  actionCardPressed: { opacity: 0.84 },
  actionCardDisabled: { opacity: 0.56 },
  actionCardLoader: { position: 'absolute' },
  actionGlyphFrame: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionGlyphRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionGlyph: {
    width: 46,
    height: 46,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.26), 0 10px 22px rgba(0,0,0,0.34)' }
      : {
          shadowColor: colors.shadow,
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 7 },
          elevation: 4,
        }),
  },
  actionGlyphCore: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  actionGlyphShine: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 18,
    backgroundColor: 'rgba(255,255,255,0.34)',
    zIndex: 3,
  },
  activePanelPlain: { gap: 0 },
  priorityBookingButton: { minHeight: 48 },
  summaryStack: { gap: 10 },
  summaryCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: 12,
    overflow: 'hidden',
    position: 'relative',
    ...(compactCardShadow ?? {}),
  },
  summaryCardDone: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  summaryCardActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  summaryCardPressed: { backgroundColor: colors.panel },
  summaryMarker: {
    width: 10,
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    backgroundColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMarkerDone: { backgroundColor: colors.success },
  summaryMarkerActive: { backgroundColor: colors.accent },
  summaryMarkerDot: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryMainButton: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', borderRadius: radius.sm },
  summaryTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0 },
  summaryValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '800', marginTop: 2 },
  summaryDetail: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  summaryRightButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
  },
  summaryRightText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '800' },
  activeStepBlock: {
    gap: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    padding: space.lg,
    ...(premiumPanelShadow ?? {}),
  },
  activePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  activePanelCopy: { flex: 1, minWidth: 0 },
  activePanelTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '900', letterSpacing: 0 },
  activePanelHelper: { color: colors.muted, fontSize: fontSize.sm, marginTop: 3, lineHeight: 19 },
  activePanelBody: { gap: space.md },
  dispatchedStack: { gap: space.md },
  stepStack: { gap: 12 },
  input: baseInput,
  fieldGap: { height: 10 },
  emailSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  emailSuggestionChip: {
    maxWidth: '100%',
    minHeight: 32,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  emailSuggestionChipPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.ripple,
  },
  emailSuggestionText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  emailModeRow: { flexDirection: 'row', gap: 8 },
  emailModeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center' as const,
    backgroundColor: colors.glass,
  },
  emailModeBtnActive: { borderColor: colors.accent, backgroundColor: colors.ripple },
  emailModeBtnText: { fontSize: 11, fontWeight: '600' as const, color: colors.subtle, textAlign: 'center' as const },
  emailModeBtnTextActive: { color: colors.accent },
  note: { ...baseInput, minHeight: 96, textAlignVertical: 'top' },
  callNotesInput: { ...baseInput, minHeight: 92, lineHeight: 20, textAlignVertical: 'top' },
  callNotesActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  flexActionButton: { flexGrow: 1, flexBasis: 130 },
  inlineNoticeTop: { marginTop: 10 },
  inlineNoticeWrap: { marginBottom: 10 },
  quoteHeaderBox: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: 12,
    gap: 4,
    ...(compactCardShadow ?? {}),
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
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(compactCardShadow ?? {}),
  },
  paymentOptionSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  paymentOptionPressed: { borderColor: colors.glowBorder, backgroundColor: colors.panel },
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
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: 12,
    gap: 5,
    ...(compactCardShadow ?? {}),
  },
  paymentLinkTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  paymentLinkMeta: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 17 },
  paymentAutoCheckText: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 17 },
  paymentLinkActions: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  paymentStatusBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentStatusBadgePaid: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  paymentStatusBadgeFailed: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  paymentStatusBadgeChecking: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  bottomSpacer: { height: 4 },
  bottomBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: 'rgba(6,10,24,0.96)',
    ...(premiumPanelShadow ?? {}),
  },
  backButton: { minWidth: 76, minHeight: 66 },
  bottomUtilityButton: {
    width: 58,
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...(compactCardShadow ?? {}),
  },
  primaryWrap: { flex: 1, minWidth: 0 },
  premiumCta: {
    minHeight: 70,
    borderRadius: 20,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentHover,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    ...(warmActionShadow ?? {}),
  },
  premiumCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minWidth: 0,
  },
  premiumCtaDisabled: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.borderStrong,
    opacity: 0.72,
  },
  premiumCtaPressed: { opacity: 0.86 },
  premiumCtaIcon: {
    width: 54,
    height: 46,
    borderRadius: 18,
    backgroundColor: 'rgba(8,11,18,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  premiumCtaCopy: { flex: 1, minWidth: 0 },
  premiumCtaLabel: { color: colors.accentText, fontSize: 22, fontWeight: '900' },
  premiumCtaHelper: { color: 'rgba(8,11,18,0.72)', fontSize: fontSize.xs, fontWeight: '800', marginTop: 2 },
  premiumCtaArrow: { color: colors.accentText, fontSize: 24, fontWeight: '900', paddingHorizontal: 4 },
  primaryReason: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700', marginTop: 5 },
  paymentLinkHint: { color: colors.muted, fontSize: fontSize.sm, marginBottom: 8 },
  paymentLinkAmount: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginBottom: 2 },
  paymentLinkStatus: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700' },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  actionSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
    padding: 16,
    ...(premiumPanelShadow ?? {}),
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  sheetTitle: { flex: 1, color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  sheetCloseButton: { minWidth: 96 },
  sheetList: { gap: 9, paddingBottom: space.md },
  sheetAction: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    backgroundColor: 'rgba(17,24,48,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: 'center',
    ...(compactCardShadow ?? {}),
  },
  sheetActionPressed: { backgroundColor: 'rgba(30,41,79,0.94)', borderColor: colors.glowBorder },
  sheetActionDisabled: { opacity: 0.58 },
  sheetActionDanger: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  sheetActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: 'rgba(255,122,24,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 18px rgba(255,122,24,0.12)' }
      : {
          shadowColor: colors.shadowWarm,
          shadowOpacity: 0.16,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 5 },
          elevation: 2,
        }),
  },
  sheetActionDangerIcon: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  sheetActionIconDisabled: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.glass,
  },
  sheetActionCopy: { flex: 1, minWidth: 0 },
  sheetActionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  sheetActionLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sheetActionDangerLabel: { color: colors.danger },
  sheetActionChevron: { flexShrink: 0 },
  sheetActionDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
    fontWeight: '600',
    letterSpacing: 0,
  },
  sheetActionReason: { color: colors.warning, fontSize: 11, lineHeight: 16, marginTop: 4, fontWeight: '800' },
  reviewBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  reviewSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
    padding: 16,
    ...(premiumPanelShadow ?? {}),
  },
  reviewContent: { gap: 8, paddingBottom: 12 },
  reviewActions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  reviewPrimary: { minHeight: 56 },
  notifSetupOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  notifSetupSheet: {
    backgroundColor: colors.surfaceOverlay,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    padding: space.lg,
    gap: space.md,
    ...(premiumPanelShadow ?? {}),
  },
  notifSetupClose: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  notifSetupClosePressed: { opacity: 0.76, backgroundColor: 'rgba(255,77,99,0.22)' },
  notifSetupCloseLabel: { color: colors.danger, fontSize: fontSize.md, fontWeight: '900' },
});

logStartupModuleCompleted('Assisted Chat module');
