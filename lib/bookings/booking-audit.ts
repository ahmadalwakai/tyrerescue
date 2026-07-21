type NullableDate = Date | string | null | undefined;

export interface BookingAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
}

export interface BookingAuditRow extends BookingAuditActor {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: NullableDate;
}

export interface BookingTimelineEntry extends BookingAuditRow {
  createdAt: string | null;
  actorDisplayName: string;
  action: string;
  description: string | null;
}

export interface BookingInformation {
  createdBy: string;
  createdByUserId: string | null;
  createdAt: string | null;
  lastUpdatedBy: string;
  lastUpdatedByUserId: string | null;
  lastUpdatedAt: string | null;
  currentAssignedAdmin?: string | null;
}

const STATUS_ACTIONS: Record<string, string> = {
  paid: 'Payment received',
  deposit_paid: 'Payment received',
  driver_assigned: 'Booking dispatched',
  en_route: 'Booking dispatched',
  completed: 'Booking completed',
  cancelled: 'Booking cancelled',
  refunded: 'Booking refunded',
  refunded_partial: 'Booking refunded',
  cancelled_refund_pending: 'Refund pending',
};

const CUSTOMER_FIELDS = ['customerName', 'customerEmail', 'customerPhone'];
const LOCATION_FIELDS = ['addressLine', 'lat', 'lng', 'distanceMiles', 'distanceSource', 'scheduledAt'];
const TYRE_FIELDS = ['tyreSizeDisplay', 'quantity', 'serviceType', 'bookingType', 'lockingNutStatus'];
const PRICE_FIELDS = ['subtotal', 'vatAmount', 'totalAmount', 'priceSnapshot'];

function toIso(value: NullableDate): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function timestamp(value: NullableDate): number {
  const iso = toIso(value);
  if (!iso) return Number.POSITIVE_INFINITY;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function hasAnyField(note: string, fields: string[]): boolean {
  return fields.some((field) => note.includes(field.toLowerCase()));
}

export function formatBookingAuditActor(entry: BookingAuditActor | null | undefined): string {
  if (!entry) return 'Unknown';

  const name = entry.actorName?.trim();
  if (name) return name;

  const id = entry.actorUserId?.trim();
  const role = entry.actorRole?.trim().toLowerCase() ?? '';
  if (id && role === 'admin') return `Admin #${id.slice(0, 8)}`;
  if (id && role === 'driver') return `Driver #${id.slice(0, 8)}`;
  if (id && role === 'customer') return `Customer #${id.slice(0, 8)}`;

  if (role === 'system') return 'System';
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);
  return 'Unknown';
}

export function classifyBookingAuditAction(entry: Pick<BookingAuditRow, 'fromStatus' | 'toStatus' | 'note'>): string {
  const note = entry.note?.trim() ?? '';
  const lowerNote = note.toLowerCase();

  if (entry.fromStatus == null || lowerNote.includes('booking created') || lowerNote.includes('quick booking')) {
    return 'Booking created';
  }
  if (lowerNote.includes('invoice')) return 'Invoice downloaded';
  if (lowerNote.includes('payment link') || lowerNote.includes('link created') || lowerNote.includes('link sent')) {
    return 'Payment requested';
  }
  if (
    lowerNote.includes('payment checked') ||
    lowerNote.includes('payment confirmed') ||
    lowerNote.includes('manual_paid') ||
    STATUS_ACTIONS[entry.toStatus] === 'Payment received'
  ) {
    return 'Payment received';
  }
  if (lowerNote.includes('quote confirmed')) return 'Quote confirmed';
  if (lowerNote.includes('quote saved')) return 'Quote saved';
  if (lowerNote.includes('driver assigned') || lowerNote.includes('driver reassigned') || lowerNote.includes('driver removed')) {
    return 'Driver changed';
  }
  if (STATUS_ACTIONS[entry.toStatus]) return STATUS_ACTIONS[entry.toStatus];

  if (lowerNote.includes('booking edited')) {
    if (hasAnyField(lowerNote, PRICE_FIELDS) || lowerNote.includes('price') || lowerNote.includes('pricing')) {
      return 'Price recalculated';
    }
    if (hasAnyField(lowerNote, LOCATION_FIELDS) || lowerNote.includes('location')) {
      return 'Location changed';
    }
    if (hasAnyField(lowerNote, TYRE_FIELDS) || lowerNote.includes('tyre')) {
      return 'Tyres changed';
    }
    if (hasAnyField(lowerNote, CUSTOMER_FIELDS) || lowerNote.includes('customer')) {
      return 'Customer updated';
    }
    return 'Booking updated';
  }

  return 'Status changed';
}

export function buildBookingTimeline(rows: BookingAuditRow[]): BookingTimelineEntry[] {
  return rows.map((row) => ({
    ...row,
    createdAt: toIso(row.createdAt),
    actorDisplayName: formatBookingAuditActor(row),
    action: classifyBookingAuditAction(row),
    description: row.note?.trim() || null,
  }));
}

export function deriveBookingInformation(input: {
  timeline: BookingTimelineEntry[];
  bookingCreatedAt: NullableDate;
  bookingUpdatedAt: NullableDate;
  currentAssignedAdmin?: string | null;
}): BookingInformation {
  const chronological = [...input.timeline].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
  const createdEvent =
    chronological.find((entry) => entry.action === 'Booking created') ??
    chronological[0] ??
    null;
  const updatedEvent = chronological[chronological.length - 1] ?? null;

  return {
    createdBy: createdEvent ? createdEvent.actorDisplayName : 'Unknown',
    createdByUserId: createdEvent?.actorUserId ?? null,
    createdAt: createdEvent?.createdAt ?? toIso(input.bookingCreatedAt),
    lastUpdatedBy: updatedEvent ? updatedEvent.actorDisplayName : 'Unknown',
    lastUpdatedByUserId: updatedEvent?.actorUserId ?? null,
    lastUpdatedAt: updatedEvent?.createdAt ?? toIso(input.bookingUpdatedAt),
    ...(input.currentAssignedAdmin !== undefined ? { currentAssignedAdmin: input.currentAssignedAdmin } : {}),
  };
}
