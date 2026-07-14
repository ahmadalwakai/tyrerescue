import type { AssistedChatDraft } from '@/types/assisted-chat';
import { summarizeBookingTyreLines, totalBookingTyreQuantity } from './assisted-chat-workflow';
import { formatGbp } from './money';

export type WhatsAppTemplateId =
  | 'price'
  | 'booking_confirmation'
  | 'driver_en_route'
  | 'driver_nearby'
  | 'delay'
  | 'job_completed';

export interface WhatsAppTemplateContext {
  draft: AssistedChatDraft;
  effectiveTotal: number;
  trackingUrl?: string | null;
  driverName?: string | null;
  etaMinutes?: number | null;
  delayMinutes?: number | null;
}

function customerName(draft: AssistedChatDraft): string {
  const first = draft.customer.name.trim().split(/\s+/)[0];
  return first || 'there';
}

function referenceLines(draft: AssistedChatDraft): string[] {
  if (draft.dispatchedRefNumber) return [`Booking ref: ${draft.dispatchedRefNumber}`];
  if (draft.savedQuoteRef) return [`Quote ref: ${draft.savedQuoteRef}`];
  return [];
}

function jobDetailLines(draft: AssistedChatDraft, effectiveTotal: number): string[] {
  const lines: string[] = [];
  const tyreSummary = summarizeBookingTyreLines(draft.tyreLines);
  if (tyreSummary.length > 0) {
    lines.push('Tyres:');
    tyreSummary.forEach((line) => lines.push(`- ${line}`));
  } else {
    const quantity = totalBookingTyreQuantity(draft.tyreLines);
    if (quantity > 0) lines.push(`Quantity: ${quantity}`);
  }
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.quote && Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    lines.push(`${draft.dispatchedRefNumber ? 'Total' : 'Quote total'}: ${formatGbp(effectiveTotal)}`);
  }
  if (draft.paymentLink) {
    lines.push(
      draft.paymentLink.kind === 'deposit'
        ? `Deposit link: ${draft.paymentLink.paymentUrl}`
        : `Payment link: ${draft.paymentLink.paymentUrl}`,
    );
  }
  return lines;
}

function withFooter(lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

export function buildWhatsAppTemplateMessage(
  templateId: WhatsAppTemplateId,
  context: WhatsAppTemplateContext,
): string {
  const { draft, effectiveTotal, trackingUrl, driverName, etaMinutes, delayMinutes } = context;
  const name = customerName(draft);
  const refLines = referenceLines(draft);
  const detailLines = jobDetailLines(draft, effectiveTotal);
  const eta = typeof etaMinutes === 'number' && Number.isFinite(etaMinutes)
    ? Math.max(0, Math.round(etaMinutes))
    : null;
  const delay = typeof delayMinutes === 'number' && Number.isFinite(delayMinutes) && delayMinutes > 0
    ? Math.round(delayMinutes)
    : null;

  if (templateId === 'price') {
    return withFooter([
      `Hi ${name}, this is Tyre Rescue.`,
      'Your tyre quote is ready.',
      '',
      ...refLines,
      ...detailLines,
      '',
      'Please reply to confirm you are happy to go ahead.',
    ]);
  }

  if (templateId === 'booking_confirmation') {
    return withFooter([
      `Hi ${name}, your Tyre Rescue booking is confirmed.`,
      '',
      ...refLines,
      ...detailLines,
      trackingUrl ? `Track your driver here: ${trackingUrl}` : '',
      '',
      'We will keep you updated when the driver is on the way.',
    ]);
  }

  if (templateId === 'driver_en_route') {
    return withFooter([
      `Hi ${name}, your Tyre Rescue driver is on the way now.`,
      driverName ? `Driver: ${driverName}` : '',
      eta != null ? `Estimated arrival: around ${eta} minutes.` : '',
      trackingUrl ? `Track live here: ${trackingUrl}` : '',
      '',
      'Please make sure the vehicle is accessible.',
    ]);
  }

  if (templateId === 'driver_nearby') {
    return withFooter([
      `Hi ${name}, your Tyre Rescue driver is nearby.`,
      eta != null && eta > 0 ? `They should be with you in about ${eta} minutes.` : 'They should be with you very shortly.',
      '',
      'Please have the locking wheel nut key ready if your vehicle has one.',
    ]);
  }

  if (templateId === 'delay') {
    return withFooter([
      `Hi ${name}, quick update from Tyre Rescue.`,
      delay != null
        ? `Your driver is delayed by around ${delay} minutes.`
        : 'Your driver has been slightly delayed.',
      'We are monitoring the job and will keep you updated.',
      trackingUrl ? `Live tracking: ${trackingUrl}` : '',
    ]);
  }

  return withFooter([
    `Hi ${name}, your Tyre Rescue job is now complete.`,
    ...refLines,
    '',
    'Thank you for choosing Tyre Rescue.',
  ]);
}
