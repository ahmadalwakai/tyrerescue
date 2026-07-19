import type {
  AssistedChatDraft,
  AssistedChatPaymentChoice,
} from '@/types/assisted-chat';
import { formatGbp, normalizePhoneForWhatsApp } from './money';
import {
  formatAssistedChatServiceType,
  summarizeBookingTyreLines,
  totalBookingTyreQuantity,
} from './assisted-chat-workflow';

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

function serviceNoun(draft: AssistedChatDraft): string {
  if (draft.serviceType === 'repair') return 'tyre repair';
  if (draft.serviceType === 'assess') return 'inspection';
  return 'replacement tyre';
}

function bookingPaymentIntro(choice: AssistedChatPaymentChoice, draft: AssistedChatDraft): string {
  if (choice === 'deposit') {
    return `Your booking is ready. Please pay the 20% deposit to confirm your ${serviceNoun(draft)}.`;
  }
  if (choice === 'cash') return 'Your booking has been created. Payment will be collected in cash.';
  return `Your booking is ready. Please complete the full payment to confirm your ${serviceNoun(draft)}.`;
}

function quotePaymentIntro(choice: AssistedChatPaymentChoice, draft: AssistedChatDraft): string {
  if (choice === 'deposit') {
    return `Your quote is ready. Please pay the 20% deposit to confirm your ${serviceNoun(draft)}.`;
  }
  if (choice === 'cash') return 'Your quote is ready. Payment will be collected in cash if you confirm.';
  return `Your quote is ready. Please complete the full payment to confirm your ${serviceNoun(draft)}.`;
}

function isBookingDraft(draft: AssistedChatDraft): boolean {
  return Boolean(draft.dispatchedRefNumber || draft.dispatchedBookingId);
}

function isQuoteDraft(draft: AssistedChatDraft): boolean {
  return Boolean(draft.savedQuoteRef || draft.savedQuoteId || draft.quote);
}

/**
 * Build the customer-facing message body. Falls back to a generic "Hi, this
 * is Tyre Rescue." opener when no payment choice has been made yet (so the
 * header WhatsApp button can still send something useful pre-payment).
 */
export function buildCustomerMessage(input: CustomerMessageInput): string {
  const { draft, effectiveTotal, paymentChoice } = input;
  const bookingDraft = isBookingDraft(draft);
  const quoteDraft = !bookingDraft && isQuoteDraft(draft);
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  if (paymentChoice) {
    lines.push(
      bookingDraft
        ? bookingPaymentIntro(paymentChoice, draft)
        : quotePaymentIntro(paymentChoice, draft),
    );
  } else if (bookingDraft) {
    lines.push('Your booking has been created.');
  } else if (quoteDraft) {
    lines.push('Here are your quote details.');
  } else {
    lines.push('Here are your details so far.');
  }

  const detail: string[] = [];
  detail.push(`Service: ${formatAssistedChatServiceType(draft.serviceType)}`);
  if (draft.dispatchedRefNumber) {
    detail.push(`Booking ref: ${draft.dispatchedRefNumber}`);
  } else if (draft.savedQuoteRef) {
    detail.push(`Quote ref: ${draft.savedQuoteRef}`);
  }
  const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
  if (draft.serviceType === 'assess') {
    detail.push('Final tyre cost will be confirmed after inspection.');
  } else if (tyreSummary.length > 0) {
    detail.push('Tyres:');
    tyreSummary.forEach((line) => detail.push(`- ${line}`));
  } else {
    const totalQuantity = totalBookingTyreQuantity(draft.tyreLines);
    if (totalQuantity) detail.push(`Quantity: ${totalQuantity}`);
  }
  if (draft.location.address) {
    detail.push(`Address: ${draft.location.address}`);
  }
  if (draft.lockingNut.answer === 'no' && draft.lockingNut.chargeGbp != null) {
    detail.push(`Locking wheel nut removal: ${formatGbp(draft.lockingNut.chargeGbp)}`);
  }
  if (draft.quote && Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    detail.push(`${bookingDraft ? 'Total to pay' : 'Quote total'}: ${formatGbp(effectiveTotal)}`);
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
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
