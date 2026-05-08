/**
 * WhatsApp Quick Help Sheet — message option builder.
 *
 * Pure functions only. Safe to import from server or client.
 * No DOM, no localStorage, no analytics calls.
 *
 * The customer-facing UI lets the user pick one of a small set of
 * pre-written messages. We never include payment IDs, Stripe secrets,
 * internal database IDs, admin notes or any private data.
 */

export type WhatsAppContextSource = 'home' | 'quote' | 'checkout' | 'tracking';

/**
 * Context describing what the visitor is currently doing.
 * Caller passes through whatever it knows safely. Missing fields
 * are tolerated — message templates degrade gracefully.
 */
export interface WhatsAppContext {
  /** Where the sheet was opened from. */
  source: WhatsAppContextSource;
  /** Optional snapshot of in-progress quote details (client-side only). */
  quote?: {
    /** Free-text address or postcode the customer entered. */
    location?: string | null;
    /** Vehicle registration mark, if known. */
    registration?: string | null;
    /** Customer-described tyre problem, if known. */
    problem?: string | null;
  } | null;
  /** Public booking reference (e.g. "TR-1234"), never the DB id. */
  trackingId?: string | null;
}

export type WhatsAppOptionId =
  | 'emergency'
  | 'send-location'
  | 'no-tyre-size'
  | 'continue-quote'
  | 'checkout-help'
  | 'tracking-help';

export interface WhatsAppOption {
  id: WhatsAppOptionId;
  /** Short title shown in the option card. */
  title: string;
  /** One-line preview of the message under the title. */
  preview: string;
  /** Final WhatsApp message body (UTF-8, decoded). */
  message: string;
}

const MAX_LOCATION_LEN = 140;
const MAX_REG_LEN = 12;
const MAX_PROBLEM_LEN = 160;
const MAX_TRACKING_LEN = 32;

function clean(value: string | null | undefined, maxLen: number): string | null {
  if (!value) return null;
  // Strip control chars and collapse whitespace.
  const trimmed = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

function safeQuote(ctx: WhatsAppContext) {
  return {
    location: clean(ctx.quote?.location ?? null, MAX_LOCATION_LEN),
    registration: clean(ctx.quote?.registration ?? null, MAX_REG_LEN),
    problem: clean(ctx.quote?.problem ?? null, MAX_PROBLEM_LEN),
  };
}

function hasAnyQuoteProgress(ctx: WhatsAppContext): boolean {
  const q = safeQuote(ctx);
  return Boolean(q.location || q.registration || q.problem);
}

/**
 * Build the (max 4) ordered list of WhatsApp options for a given context.
 *
 * Rules:
 * - Homepage: default four options.
 * - Quote: replaces "Continue my quote" with a quote-completion message
 *   that appends only the safe quote fields that are present.
 * - Checkout: first option becomes a payment-help message. We never
 *   include payment IDs, Stripe client secrets, card data or internal
 *   payment data.
 * - Tracking: first option becomes a booking-status message that
 *   includes the public booking reference if provided.
 */
export function buildWhatsAppOptions(ctx: WhatsAppContext): WhatsAppOption[] {
  const q = safeQuote(ctx);

  const emergency: WhatsAppOption = {
    id: 'emergency',
    title: 'Emergency tyre help',
    preview: 'Tell us you need help right now.',
    message: 'Hi, I need emergency tyre help.',
  };

  const sendLocation: WhatsAppOption = q.location
    ? {
        id: 'send-location',
        title: 'Send my location',
        preview: 'Share the location you entered.',
        message: `Hi, I need emergency tyre help. My location is: ${q.location}.`,
      }
    : {
        id: 'send-location',
        title: 'Send my location',
        preview: 'Offer to share your location.',
        message: 'Hi, I need emergency tyre help. I can send my location.',
      };

  const noTyreSize: WhatsAppOption = {
    id: 'no-tyre-size',
    title: 'I don\u2019t know my tyre size',
    preview: 'Get help identifying your tyre size.',
    message: 'Hi, I need tyre help but I don\u2019t know my tyre size.',
  };

  const continueQuote = ((): WhatsAppOption => {
    if (!hasAnyQuoteProgress(ctx)) {
      return {
        id: 'continue-quote',
        title: 'Continue my quote',
        preview: 'Get help finishing your quote.',
        message: 'Hi, I need help getting an emergency tyre quote.',
      };
    }
    const lines: string[] = ['Hi, I started an emergency tyre quote and need help finishing it.'];
    if (q.registration) lines.push(`Vehicle registration: ${q.registration}`);
    if (q.problem) lines.push(`Tyre problem: ${q.problem}`);
    if (q.location) lines.push(`Location: ${q.location}`);
    return {
      id: 'continue-quote',
      title: 'Continue my quote',
      preview: 'Send your quote details so far.',
      message: lines.join('\n'),
    };
  })();

  if (ctx.source === 'quote') {
    const lines: string[] = ['Hi, I\u2019m completing an emergency tyre quote and need help.'];
    if (q.registration) lines.push(`Vehicle registration: ${q.registration}`);
    if (q.problem) lines.push(`Tyre problem: ${q.problem}`);
    if (q.location) lines.push(`Location: ${q.location}`);
    const quoteHelp: WhatsAppOption = {
      id: 'continue-quote',
      title: 'Help with my quote',
      preview: 'Send your quote details so far.',
      message: lines.join('\n'),
    };
    return [quoteHelp, sendLocation, noTyreSize, emergency];
  }

  if (ctx.source === 'checkout') {
    // Never include payment IDs, Stripe client secret, card data or
    // internal payment fields in this message.
    const checkoutHelp: WhatsAppOption = {
      id: 'checkout-help',
      title: 'Help with my payment',
      preview: 'Get help completing payment.',
      message: 'Hi, I need help with my emergency tyre payment.',
    };
    return [checkoutHelp, continueQuote, noTyreSize, emergency];
  }

  if (ctx.source === 'tracking') {
    const ref = clean(ctx.trackingId ?? null, MAX_TRACKING_LEN);
    const trackingHelp: WhatsAppOption = ref
      ? {
          id: 'tracking-help',
          title: 'Check my booking',
          preview: `Reference: ${ref}`,
          message: `Hi, I\u2019m checking my Tyre Rescue booking ${ref}.`,
        }
      : {
          id: 'tracking-help',
          title: 'Check my booking',
          preview: 'Ask about your booking status.',
          message: 'Hi, I\u2019m checking my Tyre Rescue booking.',
        };
    return [trackingHelp, sendLocation, noTyreSize, emergency];
  }

  // Default (home) — four canonical options.
  return [emergency, sendLocation, noTyreSize, continueQuote];
}

/**
 * Encode a WhatsApp deep link for the given message body.
 *
 * Phone is taken from NEXT_PUBLIC_WHATSAPP_NUMBER if present,
 * otherwise falls back to the long-standing site number used in
 * the floating contact bar and SEO schema.
 *
 * Pass `phone` to override (used by callers that already resolve
 * the site config phone target).
 */
export const DEFAULT_WHATSAPP_PHONE = '447423262955';

export function buildWhatsAppHref(message: string, phone?: string): string {
  const raw = (phone ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? DEFAULT_WHATSAPP_PHONE) || DEFAULT_WHATSAPP_PHONE;
  const cleanPhone = raw.replace(/[^\d]/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/** Default fallback message used when JS fails or the sheet cannot open. */
export const FALLBACK_WHATSAPP_MESSAGE = 'Hi, I need emergency tyre help.';
