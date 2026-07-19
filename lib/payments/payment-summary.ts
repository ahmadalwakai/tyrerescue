import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, paymentEvents, payments, type PaymentEvent } from '@/lib/db';

export type PaymentMethod =
  | 'cash'
  | 'card_link'
  | 'deposit_link'
  | 'manual'
  | 'unknown';

export type PaymentLinkStatus =
  | 'not_sent'
  | 'created'
  | 'sent'
  | 'opened'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'unknown';

export type PaidVia =
  | 'cash'
  | 'payment_link'
  | 'manual'
  | null;

export type CanonicalPaymentState =
  | 'paid'
  | 'deposit_paid'
  | 'balance_due'
  | 'cash_to_collect'
  | 'pending'
  | 'needs_checking'
  | 'failed'
  | 'unknown';

export type PaymentReason =
  | 'evidence_paid'
  | 'paid_amount_covers_total'
  | 'deposit_paid_balance_due'
  | 'cash_unpaid'
  | 'link_created_waiting'
  | 'link_sent_waiting'
  | 'link_opened_waiting'
  | 'link_failed'
  | 'link_expired'
  | 'manual_paid'
  | 'cash_confirmed'
  | 'booking_paid_without_payment_evidence'
  | 'conflicting_fields'
  | 'missing_payment_fields'
  | 'unknown';

export type PaymentTone = 'success' | 'warning' | 'danger' | 'neutral';

export type PaymentEventType =
  | 'link_created'
  | 'link_sent'
  | 'link_opened'
  | 'link_expired'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'deposit_succeeded'
  | 'cash_confirmed'
  | 'manual_paid'
  | 'refund_created'
  | 'refund_succeeded'
  | 'payment_needs_checking';

export type PaymentEventSource =
  | 'stripe_webhook'
  | 'admin'
  | 'assisted_chat'
  | 'quick_book'
  | 'public_booking'
  | 'driver_confirmation'
  | 'system';

export type PaymentSummary = {
  state: CanonicalPaymentState;
  label: string;
  instruction: string;
  tone: PaymentTone;
  method: PaymentMethod;
  methodLabel: string;
  linkStatus: PaymentLinkStatus;
  paidVia: PaidVia;
  totalPence: number | null;
  paidPence: number | null;
  depositAmountPence: number | null;
  depositPaidPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number | null;
  paymentUpdatedAt: string | null;
  depositPaidAt: string | null;
  linkSentAt: string | null;
  linkOpenedAt: string | null;
  linkExpiresAt: string | null;
  reason: PaymentReason;
};

const FINAL_INVOICE_BLOCKED_STATUSES = new Set([
  'cancelled',
  'cancelled_refund_pending',
  'payment_failed',
  'refunded',
  'refunded_partial',
]);

type JsonRecord = Record<string, unknown>;

export interface PaymentBookingInput {
  id: string;
  refNumber: string;
  status: string | null;
  paymentType: string | null;
  totalAmount: string | number | null;
  subtotal?: string | number | null;
  vatAmount?: string | number | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  depositPaidAt: Date | string | null;
  stripePiId: string | null;
  stripeDepositPiId?: string | null;
}

export interface RecordPaymentEventInput {
  bookingId: string;
  bookingRef?: string | null;
  eventType: PaymentEventType;
  paymentMethod?: PaymentMethod | null;
  paidVia?: PaidVia;
  linkStatus?: PaymentLinkStatus | null;
  amountPence?: number | null;
  currency?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeCheckoutUrl?: string | null;
  source: PaymentEventSource;
  status?: string | null;
  metadata?: JsonRecord | null;
  occurredAt?: Date | null;
  expiresAt?: Date | null;
}

interface LegacyPaymentRow {
  id: string;
  bookingId: string | null;
  stripePiId: string;
  amount: string | number | null;
  currency: string | null;
  status: string;
  stripePayload: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface CanonicalEvent {
  eventType: PaymentEventType;
  paymentMethod: PaymentMethod | null;
  paidVia: PaidVia;
  linkStatus: PaymentLinkStatus | null;
  amountPence: number | null;
  currency: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeCheckoutUrl: string | null;
  source: PaymentEventSource | string;
  status: string | null;
  metadata: JsonRecord | null;
  occurredAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

let warnedMissingPaymentEventsTable = false;

const SETTLED_LIFECYCLE_STATUSES = new Set([
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
]);

const SUCCEEDED_PAYMENT_STATUSES = new Set(['succeeded', 'paid']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'canceled', 'cancelled']);
const PENDING_PAYMENT_STATUSES = new Set([
  'pending',
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

function isMissingPaymentEventsTableError(error: unknown): boolean {
  let current: unknown = error;

  while (current != null && typeof current === 'object') {
    const record = current as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
      table?: unknown;
    };
    const message = typeof record.message === 'string' ? record.message : '';

    if (
      record.code === '42P01' &&
      (record.table == null || record.table === 'payment_events')
    ) {
      return true;
    }

    if (message.includes('relation "payment_events" does not exist')) {
      return true;
    }

    current = record.cause;
  }

  return false;
}

function warnMissingPaymentEventsTable(): void {
  if (warnedMissingPaymentEventsTable) return;
  warnedMissingPaymentEventsTable = true;
  console.warn(
    'payment_events table is missing; falling back to legacy payment data until migrations are applied.',
  );
}

function toPence(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function normalisePence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function payloadObject(value: unknown): JsonRecord | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return null;
}

function payloadString(payload: unknown, key: string): string | null {
  const object = payloadObject(payload);
  const value = object?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function eventTime(event: CanonicalEvent): Date | null {
  return event.occurredAt ?? event.updatedAt ?? event.createdAt;
}

function compareEvents(a: CanonicalEvent, b: CanonicalEvent): number {
  return (eventTime(a)?.getTime() ?? 0) - (eventTime(b)?.getTime() ?? 0);
}

function latest(events: CanonicalEvent[], type: PaymentEventType): CanonicalEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].eventType === type) return events[index];
  }
  return null;
}

function rowToCanonicalEvent(row: PaymentEvent): CanonicalEvent {
  return {
    eventType: row.eventType as PaymentEventType,
    paymentMethod: row.paymentMethod as PaymentMethod | null,
    paidVia: row.paidVia as PaidVia,
    linkStatus: row.linkStatus as PaymentLinkStatus | null,
    amountPence: row.amountPence,
    currency: row.currency,
    stripeSessionId: row.stripeSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeCheckoutUrl: row.stripeCheckoutUrl,
    source: row.source,
    status: row.status,
    metadata: payloadObject(row.metadata),
    occurredAt: row.occurredAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isDepositLegacyPayment(booking: PaymentBookingInput, row: LegacyPaymentRow): boolean {
  const amountPence = toPence(row.amount) ?? 0;
  const depositPence = normalisePence(booking.depositAmountPence);
  return (
    booking.paymentType === 'deposit' ||
    booking.stripeDepositPiId === row.stripePiId ||
    (depositPence != null && amountPence > 0 && amountPence <= depositPence + 1)
  );
}

function legacyRowToCanonicalEvents(
  booking: PaymentBookingInput,
  row: LegacyPaymentRow,
): CanonicalEvent[] {
  const amountPence = toPence(row.amount);
  const stripeSessionId =
    row.stripePiId.startsWith('cs_') ? row.stripePiId : payloadString(row.stripePayload, 'sessionId');
  const stripePaymentIntentId = row.stripePiId.startsWith('pi_') ? row.stripePiId : null;
  const stripeCheckoutUrl = payloadString(row.stripePayload, 'checkoutUrl');
  const isDeposit = isDepositLegacyPayment(booking, row);
  const paymentMethod: PaymentMethod = isDeposit ? 'deposit_link' : 'card_link';
  const base = {
    paymentMethod,
    amountPence,
    currency: row.currency ?? 'gbp',
    stripeSessionId,
    stripePaymentIntentId,
    stripeCheckoutUrl,
    source: 'system',
    metadata: { legacyPaymentId: row.id, legacyPaymentStatus: row.status },
    occurredAt: row.updatedAt ?? row.createdAt,
    expiresAt: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies Omit<CanonicalEvent, 'eventType' | 'paidVia' | 'linkStatus' | 'status'>;

  if (SUCCEEDED_PAYMENT_STATUSES.has(row.status)) {
    return [{
      ...base,
      eventType: isDeposit ? 'deposit_succeeded' : 'payment_succeeded',
      paidVia: 'payment_link',
      linkStatus: 'paid',
      status: 'succeeded',
    }];
  }

  if (FAILED_PAYMENT_STATUSES.has(row.status)) {
    return [{
      ...base,
      eventType: 'payment_failed',
      paidVia: null,
      linkStatus: 'failed',
      status: 'failed',
    }];
  }

  if (PENDING_PAYMENT_STATUSES.has(row.status) && stripeCheckoutUrl) {
    return [{
      ...base,
      eventType: 'link_sent',
      paidVia: null,
      linkStatus: 'sent',
      status: 'pending',
    }];
  }

  return [];
}

function hasMatchingLedgerEvent(events: CanonicalEvent[], candidate: CanonicalEvent): boolean {
  return events.some((event) => {
    if (event.eventType !== candidate.eventType) return false;
    if (
      candidate.stripePaymentIntentId &&
      event.stripePaymentIntentId === candidate.stripePaymentIntentId
    ) {
      return true;
    }
    if (
      candidate.stripeSessionId &&
      event.stripeSessionId === candidate.stripeSessionId
    ) {
      return true;
    }
    const candidateLegacyId = candidate.metadata?.legacyPaymentId;
    return (
      typeof candidateLegacyId === 'string' &&
      event.metadata?.legacyPaymentId === candidateLegacyId
    );
  });
}

function inferMethod(
  booking: PaymentBookingInput,
  events: CanonicalEvent[],
): PaymentMethod {
  const paidEvent = [...events].reverse().find((event) =>
    event.eventType === 'cash_confirmed' ||
    event.eventType === 'manual_paid' ||
    event.eventType === 'deposit_succeeded' ||
    event.eventType === 'payment_succeeded' ||
    event.eventType === 'link_sent' ||
    event.eventType === 'link_created' ||
    event.eventType === 'link_opened'
  );

  if (paidEvent?.paymentMethod) return paidEvent.paymentMethod;
  if (booking.paymentType === 'cash') return 'cash';
  if (booking.paymentType === 'deposit') return 'deposit_link';
  if (booking.paymentType === 'full' || booking.paymentType === 'stripe' || booking.stripePiId) return 'card_link';
  return 'unknown';
}

function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'card_link':
      return 'Payment link';
    case 'deposit_link':
      return 'Deposit link';
    case 'manual':
      return 'Manual confirmation';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function amountCoversTotal(totalPence: number | null, paidPence: number): boolean {
  if (totalPence == null) return false;
  return paidPence >= Math.max(0, totalPence - 1);
}

export function isPaymentFullySettledForInvoice(
  summary: Pick<PaymentSummary, 'state' | 'totalPence' | 'paidPence' | 'amountToCollectPence'>,
  bookingStatus?: string | null,
): boolean {
  if (bookingStatus && FINAL_INVOICE_BLOCKED_STATUSES.has(bookingStatus)) return false;
  if (summary.state !== 'paid') return false;

  const paidPence = summary.paidPence ?? 0;
  if (!amountCoversTotal(summary.totalPence, paidPence)) return false;

  return summary.amountToCollectPence == null || summary.amountToCollectPence <= 1;
}

function newestEventDate(events: CanonicalEvent[]): Date | null {
  let newest: Date | null = null;
  for (const event of events) {
    const at = eventTime(event);
    if (at && (!newest || at > newest)) newest = at;
  }
  return newest;
}

function linkStatusFromEvents(
  events: CanonicalEvent[],
  hasPaidOnlineEvidence: boolean,
): PaymentLinkStatus {
  if (hasPaidOnlineEvidence) return 'paid';
  if (latest(events, 'payment_failed')) return 'failed';
  if (latest(events, 'link_expired')) return 'expired';
  if (latest(events, 'link_opened')) return 'opened';
  if (latest(events, 'link_sent')) return 'sent';
  if (latest(events, 'link_created')) return 'created';
  return events.length > 0 ? 'unknown' : 'not_sent';
}

function summaryText(input: {
  state: CanonicalPaymentState;
  reason: PaymentReason;
  amountToCollectPence: number | null;
  linkStatus: PaymentLinkStatus;
}): { label: string; instruction: string; tone: PaymentTone } {
  switch (input.state) {
    case 'paid':
      return { label: 'Paid', instruction: 'No payment to collect.', tone: 'success' };
    case 'balance_due':
    case 'deposit_paid':
      return {
        label: 'Deposit paid - balance due',
        instruction: 'Collect the remaining balance before fitting.',
        tone: 'warning',
      };
    case 'cash_to_collect':
      return {
        label: 'Cash to collect',
        instruction: 'Collect cash from the customer before completion.',
        tone: 'warning',
      };
    case 'pending':
      return {
        label:
          input.linkStatus === 'opened'
            ? 'Payment link opened'
            : input.linkStatus === 'sent'
              ? 'Payment link sent'
              : 'Payment pending',
        instruction: 'Payment has not been confirmed yet.',
        tone: 'warning',
      };
    case 'failed':
      return { label: 'Payment failed', instruction: 'Call admin before fitting.', tone: 'danger' };
    case 'needs_checking':
      return { label: 'Payment needs checking', instruction: 'Confirm payment with admin.', tone: 'warning' };
    case 'unknown':
    default:
      return { label: 'Payment unknown', instruction: 'Check payment with admin.', tone: 'neutral' };
  }
}

async function selectPaymentEventsForBooking(bookingId: string): Promise<PaymentEvent[]> {
  try {
    return await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.bookingId, bookingId))
      .orderBy(paymentEvents.createdAt);
  } catch (error) {
    if (isMissingPaymentEventsTableError(error)) {
      warnMissingPaymentEventsTable();
      return [];
    }

    throw error;
  }
}

async function selectPaymentEventsForBookings(bookingIds: string[]): Promise<PaymentEvent[]> {
  try {
    return await db
      .select()
      .from(paymentEvents)
      .where(inArray(paymentEvents.bookingId, bookingIds))
      .orderBy(paymentEvents.createdAt);
  } catch (error) {
    if (isMissingPaymentEventsTableError(error)) {
      warnMissingPaymentEventsTable();
      return [];
    }

    throw error;
  }
}

async function selectLegacyPaymentRowsForBooking(bookingId: string): Promise<LegacyPaymentRow[]> {
  return db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      stripePiId: payments.stripePiId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      stripePayload: payments.stripePayload,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));
}

async function selectLegacyPaymentRowsForBookings(bookingIds: string[]): Promise<LegacyPaymentRow[]> {
  return db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      stripePiId: payments.stripePiId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      stripePayload: payments.stripePayload,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .where(inArray(payments.bookingId, bookingIds));
}

export function buildPaymentSummary(
  booking: PaymentBookingInput,
  eventRows: PaymentEvent[],
  legacyPaymentRows: LegacyPaymentRow[] = [],
): PaymentSummary {
  const ledgerEvents = eventRows.map(rowToCanonicalEvent);
  const fallbackEvents = legacyPaymentRows
    .flatMap((row) => legacyRowToCanonicalEvents(booking, row))
    .filter((event) => !hasMatchingLedgerEvent(ledgerEvents, event));
  const events = [...ledgerEvents, ...fallbackEvents].sort(compareEvents);

  const totalPence = toPence(booking.totalAmount);
  const depositAmountPence = normalisePence(booking.depositAmountPence);
  const manualPaid = latest(events, 'manual_paid');
  const cashConfirmed = latest(events, 'cash_confirmed');
  const fullPaidEvents = events.filter((event) => event.eventType === 'payment_succeeded');
  const depositEvents = events.filter((event) => event.eventType === 'deposit_succeeded');
  const onlinePaidEvents = [...fullPaidEvents, ...depositEvents];
  const failedEvent = latest(events, 'payment_failed');
  const needsCheckingEvent = latest(events, 'payment_needs_checking');
  const expiredEvent = latest(events, 'link_expired');

  const fullPaidPence = fullPaidEvents.reduce((sum, event) => sum + (event.amountPence ?? 0), 0);
  const depositPaidPenceFromEvents = depositEvents.reduce((sum, event) => sum + (event.amountPence ?? 0), 0);
  const cashPaidPence = cashConfirmed?.amountPence ?? 0;
  const manualPaidPence = manualPaid?.amountPence ?? 0;
  const totalPaidPence = fullPaidPence + depositPaidPenceFromEvents + cashPaidPence + manualPaidPence;
  const hasPaidOnlineEvidence = onlinePaidEvents.length > 0 || fullPaidPence > 0 || depositPaidPenceFromEvents > 0;
  const linkStatus = linkStatusFromEvents(events, hasPaidOnlineEvidence);
  const method = inferMethod(booking, events);

  const bookingDepositPaidAt = parseDate(booking.depositPaidAt);
  const firstDepositEvent = depositEvents[0] ?? null;
  const depositPaidAt = firstDepositEvent ? eventTime(firstDepositEvent) : bookingDepositPaidAt;
  const depositPaidPence =
    depositPaidPenceFromEvents > 0
      ? depositPaidPenceFromEvents
      : bookingDepositPaidAt
        ? normalisePence(booking.depositAmountPence)
        : null;

  const explicitRemaining = normalisePence(booking.remainingBalancePence);
  const inferredRemaining =
    totalPence != null && depositPaidPence != null
      ? Math.max(0, totalPence - depositPaidPence)
      : null;
  const remainingBalancePence = explicitRemaining ?? inferredRemaining;
  const paidPence = totalPaidPence > 0 ? totalPaidPence : null;

  let state: CanonicalPaymentState = 'unknown';
  let reason: PaymentReason = 'unknown';
  let paidVia: PaidVia = null;
  let amountToCollectPence: number | null = totalPence;

  if (manualPaid) {
    state = 'paid';
    reason = 'manual_paid';
    paidVia = 'manual';
    amountToCollectPence = 0;
  } else if (cashConfirmed) {
    state = 'paid';
    reason = 'cash_confirmed';
    paidVia = 'cash';
    amountToCollectPence = 0;
  } else if (amountCoversTotal(totalPence, totalPaidPence)) {
    state = 'paid';
    reason = 'paid_amount_covers_total';
    paidVia = 'payment_link';
    amountToCollectPence = 0;
  } else if (depositPaidPence != null && depositPaidPence > 0 && (remainingBalancePence ?? 0) > 0) {
    state = 'balance_due';
    reason = 'deposit_paid_balance_due';
    paidVia = 'payment_link';
    amountToCollectPence = remainingBalancePence;
  } else if (failedEvent) {
    state = 'failed';
    reason = 'link_failed';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (expiredEvent) {
    state = 'needs_checking';
    reason = 'link_expired';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (needsCheckingEvent) {
    state = 'needs_checking';
    reason = needsCheckingEvent.metadata?.reason === 'booking_lifecycle_without_payment_evidence'
      ? 'booking_paid_without_payment_evidence'
      : 'conflicting_fields';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (method === 'cash') {
    state = 'cash_to_collect';
    reason = 'cash_unpaid';
    amountToCollectPence = totalPence;
  } else if (linkStatus === 'opened') {
    state = 'pending';
    reason = 'link_opened_waiting';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (linkStatus === 'sent') {
    state = 'pending';
    reason = 'link_sent_waiting';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (booking.status != null && SETTLED_LIFECYCLE_STATUSES.has(booking.status)) {
    state = 'needs_checking';
    reason = 'booking_paid_without_payment_evidence';
    amountToCollectPence = totalPence;
  } else if (linkStatus === 'created' || booking.stripePiId || booking.paymentType === 'full' || booking.paymentType === 'stripe' || booking.paymentType === 'deposit') {
    state = 'pending';
    reason = 'link_created_waiting';
    amountToCollectPence = totalPence == null ? null : Math.max(0, totalPence - totalPaidPence);
  } else if (totalPence == null) {
    state = 'unknown';
    reason = 'missing_payment_fields';
    amountToCollectPence = null;
  }

  const text = summaryText({ state, reason, amountToCollectPence, linkStatus });
  const linkSent = latest(events, 'link_sent');
  const linkOpened = latest(events, 'link_opened');
  const linkExpiringEvent = [...events].reverse().find((event) => event.expiresAt != null) ?? null;

  return {
    state,
    label: text.label,
    instruction: text.instruction,
    tone: text.tone,
    method,
    methodLabel: methodLabel(method),
    linkStatus: state === 'paid' && paidVia === 'payment_link' ? 'paid' : linkStatus,
    paidVia,
    totalPence,
    paidPence,
    depositAmountPence,
    depositPaidPence,
    remainingBalancePence,
    amountToCollectPence,
    paymentUpdatedAt: toIso(newestEventDate(events)),
    depositPaidAt: toIso(depositPaidAt),
    linkSentAt: toIso(linkSent ? eventTime(linkSent) : null),
    linkOpenedAt: toIso(linkOpened ? eventTime(linkOpened) : null),
    linkExpiresAt: toIso(linkExpiringEvent?.expiresAt ?? null),
    reason,
  };
}

export async function getBookingPaymentSummary(
  booking: PaymentBookingInput,
): Promise<PaymentSummary> {
  const [events, legacyRows] = await Promise.all([
    selectPaymentEventsForBooking(booking.id),
    selectLegacyPaymentRowsForBooking(booking.id),
  ]);

  return buildPaymentSummary(booking, events, legacyRows);
}

export async function getBookingPaymentSummaryMap(
  bookingInputs: PaymentBookingInput[],
): Promise<Map<string, PaymentSummary>> {
  const ids = Array.from(new Set(bookingInputs.map((booking) => booking.id).filter(Boolean)));
  const result = new Map<string, PaymentSummary>();
  if (ids.length === 0) return result;

  const [eventRows, legacyRows] = await Promise.all([
    selectPaymentEventsForBookings(ids),
    selectLegacyPaymentRowsForBookings(ids),
  ]);

  const eventsByBooking = new Map<string, PaymentEvent[]>();
  for (const event of eventRows) {
    if (!event.bookingId) continue;
    const list = eventsByBooking.get(event.bookingId) ?? [];
    list.push(event);
    eventsByBooking.set(event.bookingId, list);
  }

  const legacyByBooking = new Map<string, LegacyPaymentRow[]>();
  for (const row of legacyRows) {
    if (!row.bookingId) continue;
    const list = legacyByBooking.get(row.bookingId) ?? [];
    list.push(row);
    legacyByBooking.set(row.bookingId, list);
  }

  for (const booking of bookingInputs) {
    result.set(
      booking.id,
      buildPaymentSummary(
        booking,
        eventsByBooking.get(booking.id) ?? [],
        legacyByBooking.get(booking.id) ?? [],
      ),
    );
  }

  return result;
}

function metadataStripeEventId(metadata: JsonRecord | null | undefined): string | null {
  const value = metadata?.stripeEventId;
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function recordPaymentEvent(input: RecordPaymentEventInput): Promise<void> {
  try {
    const stripeEventId = metadataStripeEventId(input.metadata);
    const duplicateChecks: SQL[] = [
      eq(paymentEvents.bookingId, input.bookingId),
      eq(paymentEvents.eventType, input.eventType),
    ];

    if (input.stripePaymentIntentId) {
      duplicateChecks.push(eq(paymentEvents.stripePaymentIntentId, input.stripePaymentIntentId));
    } else if (input.stripeSessionId) {
      duplicateChecks.push(eq(paymentEvents.stripeSessionId, input.stripeSessionId));
    } else if (stripeEventId) {
      duplicateChecks.push(sql`${paymentEvents.metadata}->>'stripeEventId' = ${stripeEventId}`);
    } else {
      duplicateChecks.push(eq(paymentEvents.source, input.source));
    }

    const [existing] = await db
      .select({ id: paymentEvents.id })
      .from(paymentEvents)
      .where(and(...duplicateChecks))
      .orderBy(desc(paymentEvents.createdAt))
      .limit(1);

    if (existing) return;

    await db.insert(paymentEvents).values({
      bookingId: input.bookingId,
      bookingRef: input.bookingRef ?? null,
      eventType: input.eventType,
      paymentMethod: input.paymentMethod ?? null,
      paidVia: input.paidVia ?? null,
      linkStatus: input.linkStatus ?? null,
      amountPence: normalisePence(input.amountPence) ?? null,
      currency: input.currency?.toLowerCase() ?? 'gbp',
      stripeSessionId: input.stripeSessionId ?? null,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      stripeCheckoutUrl: input.stripeCheckoutUrl ?? null,
      source: input.source,
      status: input.status ?? null,
      metadata: input.metadata ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
      updatedAt: new Date(),
    });
  } catch (error) {
    if (isMissingPaymentEventsTableError(error)) {
      warnMissingPaymentEventsTable();
      return;
    }

    throw error;
  }
}
