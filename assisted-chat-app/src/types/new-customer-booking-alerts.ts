export interface CustomerBookingAlertInput {
  sourceApp?: string | null;
  sourceLabel?: string | null;
  externalReference?: string | null;
  bookingType?: string | null;
  bookingOrigin?: string | null;
  isCustomerOriginated?: boolean | null;
  customerName?: string | null;
  scheduledAt?: string | null;
}

export function isIntegratedProjectBooking(item: CustomerBookingAlertInput): boolean {
  const sourceApp = (item.sourceApp ?? '').trim().toLowerCase();
  return Boolean(sourceApp && sourceApp !== 'tyre_rescue');
}

export function isScheduledBooking(item: CustomerBookingAlertInput): boolean {
  return item.bookingType?.trim().toLowerCase() === 'scheduled';
}

/** Origin and booking type determine eligibility; urgency is separate. */
export function shouldTriggerBookingAlert(item: CustomerBookingAlertInput): boolean {
  if (isIntegratedProjectBooking(item)) return true;
  const customerOrigin = typeof item.isCustomerOriginated === 'boolean'
    ? item.isCustomerOriginated
    : item.bookingOrigin?.trim().toLowerCase() === 'customer';
  if (!customerOrigin) return false;
  const bookingType = item.bookingType?.trim().toLowerCase();
  return bookingType === 'emergency' || bookingType === 'scheduled';
}

export function isUrgentBookingAlert(item: CustomerBookingAlertInput): boolean {
  return isIntegratedProjectBooking(item)
    || (shouldTriggerBookingAlert(item) && item.bookingType?.trim().toLowerCase() === 'emergency');
}

/** Input is the unseen batch in newest-first order; urgent work wins. */
export function selectBookingAlertCandidate<T extends CustomerBookingAlertInput>(items: readonly T[]): T | undefined {
  return items.find((item) => shouldTriggerBookingAlert(item) && isUrgentBookingAlert(item))
    ?? items.find(shouldTriggerBookingAlert);
}

export function sourceDisplayFor(item: CustomerBookingAlertInput): string | null {
  const label = item.sourceLabel?.trim();
  const reference = item.externalReference?.trim();
  return label && reference ? `${label} reference ${reference}` : null;
}

export function formatBookingAlertDate(value: string | null | undefined): string {
  if (!value) return 'To be confirmed';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'To be confirmed';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function getBookingAlertCopy(item: CustomerBookingAlertInput) {
  const project = isIntegratedProjectBooking(item);
  const scheduled = isScheduledBooking(item);
  const emergency = item.bookingType?.trim().toLowerCase() === 'emergency';
  const title = scheduled
    ? project ? 'Scheduled project booking received' : 'Scheduled booking received'
    : project ? 'New project booking received'
      : emergency ? 'Emergency booking received' : 'New booking received';
  const eyebrow = project
    ? scheduled ? 'Project booking · Scheduled' : 'Project booking'
    : scheduled ? 'Scheduled booking' : emergency ? 'Urgent' : 'New booking';
  const customer = item.customerName?.trim();
  const source = sourceDisplayFor(item) ?? (project ? item.sourceLabel?.trim() || item.sourceApp?.trim() : null);
  const detail = source
    ? `${source}${customer ? ` from ${customer}` : ''}`
    : customer ? `New ${scheduled ? 'scheduled' : emergency ? 'emergency' : 'customer'} booking from ${customer}`
      : scheduled ? 'A customer has created a scheduled booking'
        : emergency ? 'A customer has created an emergency booking' : 'A customer has created a new booking';
  const appointment = formatBookingAlertDate(item.scheduledAt);
  const scheduleDetail = appointment === 'To be confirmed'
    ? '. Scheduled time to be confirmed'
    : ` for ${appointment} (UK time)`;
  const body = `${detail}${scheduled ? scheduleDetail : ''}. Open bookings to review.`;
  return { title, eyebrow, body, bookingTypeLabel: scheduled ? 'Scheduled' : emergency ? 'Emergency' : 'Project booking' };
}
