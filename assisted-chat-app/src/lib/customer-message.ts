import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
} from '@/types/assisted-chat';
import { formatGbp } from './money';

/**
 * Templates the operator-side customer messages. Pure, deterministic, and
 * intentionally NOT a hook — easy to unit-test and reuse in copy/WhatsApp
 * actions. Only fields that exist on the draft are emitted; missing fields
 * are skipped so the customer never sees "undefined" / "null".
 *
 */

export interface CustomerMessageInput {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  paymentChoice?: AssistedChatPaymentChoice | null;
}

const PAYMENT_INTRO: Record<AssistedChatPaymentChoice, string> = {
  deposit:
    'Your booking is ready. Please pay the 15% deposit to confirm your tyre fitting.',
  cash:
    'Your booking has been created. Payment will be collected in cash.',
  full:
    'Your booking is ready. Please complete the full payment to confirm your tyre fitting.',
};

/**
 * Build the customer-facing message body. Falls back to a generic "Hi, this
 * is Tyre Rescue." opener when no payment choice has been made yet (so the
 * header WhatsApp button can still send something useful pre-payment).
 */
export function buildCustomerMessage(input: CustomerMessageInput): string {
  const { draft, effectiveTotal, paymentChoice } = input;
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  if (paymentChoice) {
    lines.push(PAYMENT_INTRO[paymentChoice]);
  } else if (draft.dispatchedRefNumber) {
    lines.push('Your booking has been created.');
  } else {
    lines.push('Here are your booking details so far.');
  }

  const detail: string[] = [];
  if (draft.dispatchedRefNumber) {
    detail.push(`Reference: ${draft.dispatchedRefNumber}`);
  }
  if (draft.tyre.size) {
    detail.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  } else if (draft.tyre.quantity) {
    detail.push(`Quantity: ${draft.tyre.quantity}`);
  }
  if (draft.location.address) {
    detail.push(`Address: ${draft.location.address}`);
  }
  if (draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null) {
    detail.push(`Locking wheel nut removal: ${formatGbp(draft.lockingNut.chargeGbp)}`);
  }
  if (draft.quote && Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    detail.push(`Total to pay: ${formatGbp(effectiveTotal)}`);
  }
  if (draft.paymentLink) {
    detail.push(
      draft.paymentLink.kind === 'deposit'
        ? `Deposit link: ${draft.paymentLink.paymentUrl}`
        : `Payment link: ${draft.paymentLink.paymentUrl}`,
    );
  }

  if (detail.length) {
    lines.push('');
    lines.push(...detail);
  }
  return lines.join('\n');
}

/**
 * Build a `wa.me` URL for the supplied UK-leaning phone number, normalizing
 * a leading 0 to the +44 country code. Returns `null` when no usable digits
 * are present so callers can disable the button.
 */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const raw = phone ?? '';
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  let normalized: string;
  if (raw.trim().startsWith('+')) normalized = digits;
  else if (digits.startsWith('44')) normalized = digits;
  else if (digits.startsWith('0')) normalized = `44${digits.slice(1)}`;
  else normalized = digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
