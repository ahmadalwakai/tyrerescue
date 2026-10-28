export interface IncomingPhoneCall {
  ledgerId?: string;
  id: string;
  callId: string;
  phone: string;
  createdAt: string;
  receivedAt: string;
}

export interface IncomingPhoneCallResponse {
  enabled: boolean;
  cursor: string;
  serverTime: string;
  events: IncomingPhoneCall[];
}

const MAX_EVENT_AGE_MS = 90_000;
const MAX_REMEMBERED_CALLS = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validEvent(value: unknown): value is IncomingPhoneCall {
  if (!isRecord(value)) return false;
  return (value.ledgerId === undefined || (typeof value.ledgerId === 'string' && /^[a-f0-9]{64}$/.test(value.ledgerId)))
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200
    && typeof value.callId === 'string' && value.callId.length > 0 && value.callId.length <= 200
    && typeof value.phone === 'string' && /^\+?[0-9]{7,15}$/.test(value.phone)
    && validTimestamp(value.createdAt) && validTimestamp(value.receivedAt);
}

/** Reject malformed batches before moving the cursor or touching the booking. */
export function parseIncomingPhoneCalls(value: unknown): IncomingPhoneCallResponse | null {
  if (!isRecord(value) || typeof value.enabled !== 'boolean'
    || typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > 512
    || !validTimestamp(value.serverTime) || !Array.isArray(value.events) || value.events.length > 50
    || !value.events.every(validEvent)) return null;
  return value as unknown as IncomingPhoneCallResponse;
}

/** One feed per signed-in workspace; the server returns only active calls. */
export class IncomingPhoneCallFeed {
  cursor: string | null = null;
  private seen = new Set<string>();

  reset(): void {
    this.cursor = null;
    this.seen.clear();
  }

  accept(response: IncomingPhoneCallResponse): IncomingPhoneCall | null {
    this.cursor = response.cursor;
    if (!response.enabled) return null;

    const now = Date.parse(response.serverTime);
    let candidate: IncomingPhoneCall | null = null;
    for (const event of response.events) {
      if (this.seen.has(event.callId)) continue;
      this.seen.add(event.callId);
      if (this.seen.size > MAX_REMEMBERED_CALLS) {
        const oldest = this.seen.values().next().value;
        if (oldest !== undefined) this.seen.delete(oldest);
      }
      // A fresh active call is deliberately accepted on first open, so the
      // operator can switch from the bOnline ringing overlay into this form.
      const age = now - Date.parse(event.receivedAt);
      if (age < 0 || age > MAX_EVENT_AGE_MS) continue;
      if (!candidate || Date.parse(event.receivedAt) >= Date.parse(candidate.receivedAt)) candidate = event;
    }
    return candidate;
  }
}

export interface IncomingPhoneAutofillContext {
  phoneInput: string;
  customerPhone: string;
  phoneFocused: boolean;
  hasSavedBooking: boolean;
}

/** Manual typing and existing bookings always retain their customer number. */
export function canAutofillIncomingPhone(context: IncomingPhoneAutofillContext): boolean {
  return !context.phoneFocused && !context.hasSavedBooking
    && context.phoneInput.trim() === '' && context.customerPhone.trim() === '';
}
