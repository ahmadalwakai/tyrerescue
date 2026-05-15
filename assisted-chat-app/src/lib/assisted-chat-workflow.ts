import type { AssistedChatDraft } from '@/types/assisted-chat';
import type { AdminQuotePaymentOption, AdminQuoteStatus } from '@/types/admin-quotes';

export const ASSISTED_CHAT_STAGE_ORDER = [
  'CUSTOMER',
  'LOCATION',
  'TYRE',
  'PRICE',
  'QUOTE',
  'CONFIRMATION',
  'PAYMENT',
  'READY_TO_DISPATCH',
  'DISPATCHED',
] as const;

export type AssistedChatStage = (typeof ASSISTED_CHAT_STAGE_ORDER)[number];

export type AssistedChatTimelineStep =
  | 'CUSTOMER'
  | 'LOCATION'
  | 'TYRE'
  | 'PRICE'
  | 'QUOTE'
  | 'PAYMENT'
  | 'DISPATCH';

export type AssistedChatStepState = 'done' | 'active' | 'todo';

export type AssistedChatSecondaryAction =
  | 'COPY_LOCATION_LINK'
  | 'SEND_LOCATION_WHATSAPP'
  | 'SEND_LOCATION_SMS'
  | 'SEND_LOCATION_EMAIL'
  | 'COPY_QUOTE_MESSAGE'
  | 'SEND_QUOTE'
  | 'COPY_JOB_DETAILS'
  | 'CLEAR_DRAFT';

export interface AssistedChatWorkflowInput {
  draft: AssistedChatDraft;
  quoteStatus?: AdminQuoteStatus | null;
  quoteConfirmedAt?: string | null;
  quoteSelectedPaymentOption?: AdminQuotePaymentOption | null;
  quoteExpired?: boolean;
  quoteBusy?: boolean;
  priceLoading?: boolean;
  dispatchBusy?: boolean;
  canUseApi?: boolean;
}

export interface AssistedChatTimelineItem {
  key: AssistedChatTimelineStep;
  label: string;
  state: AssistedChatStepState;
}

export interface AssistedChatWorkflow {
  currentStage: AssistedChatStage;
  completedSteps: AssistedChatTimelineStep[];
  timeline: AssistedChatTimelineItem[];
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  primaryActionDisabledReason: string | null;
  secondaryActions: AssistedChatSecondaryAction[];
}

const CONFIRMED_QUOTE_STATUSES: readonly AdminQuoteStatus[] = [
  'CONFIRMED_BY_PHONE',
  'PAYMENT_PENDING',
  'PAID',
];

function hasCustomerDetails(draft: AssistedChatDraft): boolean {
  return Boolean(
    draft.customer.name.trim() ||
      draft.customer.phone.trim() ||
      draft.customer.email.trim(),
  );
}

function hasLocation(draft: AssistedChatDraft): boolean {
  return draft.location.lat != null && draft.location.lng != null;
}

export function normalizeAssistedChatTyreSize(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  const standardMatch =
    trimmed.match(/^(\d{3})[\s/-]*(\d{2,3})[\s/-]*R\s*(\d{2})(C?)$/i) ??
    trimmed.match(/^(\d{3})[\s/-]+(\d{2,3})[\s/-]+(\d{2})(C?)$/i);
  if (standardMatch) {
    const width = Number(standardMatch[1]);
    const aspect = Number(standardMatch[2]);
    const rim = Number(standardMatch[3]);
    if (aspect > 0 && isValidTyreRange(width, aspect, rim)) {
      return `${width}/${aspect}/R${rim}${standardMatch[4].toUpperCase()}`;
    }
  }

  const compactMatch = trimmed.match(/^(\d{3})[\s/-]*R\s*(\d{2})(C?)$/i);
  if (compactMatch) {
    const width = Number(compactMatch[1]);
    const rim = Number(compactMatch[2]);
    if (isValidTyreRange(width, 0, rim)) {
      return `${width}/R${rim}${compactMatch[3].toUpperCase()}`;
    }
  }

  return null;
}

export function compactAssistedChatTyreSize(input: string): string {
  return (normalizeAssistedChatTyreSize(input) ?? input.trim().toUpperCase())
    .replace(/\s+/g, '')
    .replace('/R', 'R');
}

function isValidTyreRange(width: number, aspect: number, rim: number): boolean {
  return width >= 100 && width <= 400 && aspect >= 0 && aspect <= 100 && rim >= 10 && rim <= 26;
}

export function hasAssistedChatTyre(draft: AssistedChatDraft): boolean {
  return Boolean(normalizeAssistedChatTyreSize(draft.tyre.size) && draft.tyre.quantity >= 1);
}

function hasSavedQuote(draft: AssistedChatDraft): boolean {
  return Boolean(draft.savedQuoteId || draft.savedQuoteRef);
}

function hasConfirmedQuote(input: AssistedChatWorkflowInput): boolean {
  return Boolean(
    input.quoteConfirmedAt ||
      input.quoteSelectedPaymentOption ||
      (input.quoteStatus && CONFIRMED_QUOTE_STATUSES.includes(input.quoteStatus)),
  );
}

export function getAssistedChatStage(input: AssistedChatWorkflowInput): AssistedChatStage {
  const { draft } = input;
  const quoteConfirmed = hasConfirmedQuote(input);

  if (draft.dispatchedRefNumber) return 'DISPATCHED';
  if (!hasLocation(draft)) return 'LOCATION';
  if (!hasAssistedChatTyre(draft)) return 'TYRE';
  if (!draft.quote || draft.priceNeedsRefresh) return 'PRICE';
  if (!hasSavedQuote(draft)) return 'QUOTE';
  if (!quoteConfirmed) return 'CONFIRMATION';
  if (!draft.paymentChoice) return 'PAYMENT';
  return 'READY_TO_DISPATCH';
}

export function getAssistedChatBlockedReason(input: AssistedChatWorkflowInput): string | null {
  const { draft } = input;
  const stage = getAssistedChatStage(input);
  const quoteConfirmed = hasConfirmedQuote(input);

  if (input.canUseApi === false && stage !== 'CUSTOMER' && stage !== 'TYRE' && stage !== 'DISPATCHED') {
    return 'Log in again before using admin actions.';
  }

  if (stage === 'PRICE') {
    if (!hasLocation(draft)) return 'Confirm the customer location before pricing.';
    if (!hasAssistedChatTyre(draft)) return 'Enter a valid tyre size and quantity before pricing.';
    if (input.priceLoading) return 'Price is already being calculated.';
    return null;
  }

  if (stage === 'QUOTE') {
    if (!draft.quote) return 'Get a price before saving the quote.';
    if (input.quoteBusy) return 'Quote action is already running.';
    return null;
  }

  if (stage === 'CONFIRMATION') {
    if (!hasSavedQuote(draft)) return 'Save the quote before confirming it.';
    if (input.quoteExpired) return 'Refresh the quote before confirming it.';
    if (input.quoteBusy) return 'Quote action is already running.';
    return null;
  }

  if (stage === 'READY_TO_DISPATCH') {
    if (!draft.quickBookingId) return 'Get a current price before dispatching.';
    if (!draft.quote) return 'Get a price before dispatching.';
    if (!quoteConfirmed) return 'Confirm the saved quote before dispatching.';
    if (!draft.paymentChoice) return 'Choose a payment option before dispatching.';
    if (input.dispatchBusy) return 'Dispatch is already running.';
    return null;
  }

  if (stage === 'LOCATION') {
    if (input.canUseApi === false) return 'Log in again before sending a location link.';
    return null;
  }

  if (stage === 'DISPATCHED') return null;

  return null;
}

export function getAssistedChatPrimaryAction(input: AssistedChatWorkflowInput): {
  label: string;
  disabled: boolean;
  disabledReason: string | null;
} {
  const stage = getAssistedChatStage(input);
  const blockedReason = getAssistedChatBlockedReason(input);

  const labelByStage: Record<AssistedChatStage, string> = {
    CUSTOMER: 'Continue to Location',
    LOCATION: 'Send Location Link',
    TYRE: 'Continue to Price',
    PRICE: input.draft.priceNeedsRefresh ? 'Refresh Price' : 'Get Price',
    QUOTE: 'Save Quote',
    CONFIRMATION: 'Confirm Quote',
    PAYMENT: 'Choose Payment',
    READY_TO_DISPATCH: 'Review & Dispatch',
    DISPATCHED: 'Open Booking',
  };

  return {
    label: labelByStage[stage],
    disabled: blockedReason !== null,
    disabledReason: blockedReason,
  };
}

function timelineState(
  key: AssistedChatTimelineStep,
  activeKey: AssistedChatTimelineStep,
  completedSteps: AssistedChatTimelineStep[],
): AssistedChatStepState {
  if (key === activeKey) return 'active';
  if (completedSteps.includes(key)) return 'done';
  return 'todo';
}

function timelineKeyForStage(stage: AssistedChatStage): AssistedChatTimelineStep {
  if (stage === 'CONFIRMATION') return 'QUOTE';
  if (stage === 'READY_TO_DISPATCH' || stage === 'DISPATCHED') return 'DISPATCH';
  return stage;
}

export function getAssistedChatWorkflow(input: AssistedChatWorkflowInput): AssistedChatWorkflow {
  const { draft } = input;
  const currentStage = getAssistedChatStage(input);
  const quoteConfirmed = hasConfirmedQuote(input);
  const completedSteps: AssistedChatTimelineStep[] = [];

  if (hasCustomerDetails(draft)) completedSteps.push('CUSTOMER');
  if (hasLocation(draft)) completedSteps.push('LOCATION');
  if (hasAssistedChatTyre(draft)) completedSteps.push('TYRE');
  if (draft.quote && !draft.priceNeedsRefresh) completedSteps.push('PRICE');
  if (hasSavedQuote(draft) && quoteConfirmed) completedSteps.push('QUOTE');
  else if (hasSavedQuote(draft) && currentStage !== 'QUOTE') completedSteps.push('QUOTE');
  if (draft.paymentChoice) completedSteps.push('PAYMENT');
  if (draft.dispatchedRefNumber) completedSteps.push('DISPATCH');

  const activeKey = timelineKeyForStage(currentStage);
  const timeline: AssistedChatTimelineItem[] = [
    { key: 'CUSTOMER', label: 'Customer', state: timelineState('CUSTOMER', activeKey, completedSteps) },
    { key: 'LOCATION', label: 'Location', state: timelineState('LOCATION', activeKey, completedSteps) },
    { key: 'TYRE', label: 'Tyre', state: timelineState('TYRE', activeKey, completedSteps) },
    { key: 'PRICE', label: 'Price', state: timelineState('PRICE', activeKey, completedSteps) },
    { key: 'QUOTE', label: 'Quote', state: timelineState('QUOTE', activeKey, completedSteps) },
    { key: 'PAYMENT', label: 'Payment', state: timelineState('PAYMENT', activeKey, completedSteps) },
    { key: 'DISPATCH', label: 'Dispatch', state: timelineState('DISPATCH', activeKey, completedSteps) },
  ];

  const primary = getAssistedChatPrimaryAction(input);
  const secondaryActions: AssistedChatSecondaryAction[] = [
    'COPY_LOCATION_LINK',
    'SEND_LOCATION_WHATSAPP',
    'SEND_LOCATION_SMS',
    'SEND_LOCATION_EMAIL',
    'COPY_QUOTE_MESSAGE',
    'SEND_QUOTE',
    'COPY_JOB_DETAILS',
    'CLEAR_DRAFT',
  ];

  return {
    currentStage,
    completedSteps,
    timeline,
    primaryActionLabel: primary.label,
    primaryActionDisabled: primary.disabled,
    primaryActionDisabledReason: primary.disabledReason,
    secondaryActions,
  };
}
