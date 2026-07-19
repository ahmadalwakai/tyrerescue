const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const EMAIL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'yahoo.com',
  'live.co.uk',
  'googlemail.com',
  'btinternet.com',
  'aol.com',
  'me.com',
] as const;

export function formatGbp(value: number): string {
  if (!Number.isFinite(value)) return GBP.format(0);
  return GBP.format(value);
}

// Mirrors lib/voodoo-sms.ts normalizeUkPhoneNumber so the SMS button can be
// gated client-side without a network round-trip.
export function normalizeUkMobilePhoneNumber(input: string): string | null {
  let cleaned = normalizeContactPhone(input);
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = `44${cleaned.slice(1)}`;
  return /^447\d{9}$/.test(cleaned) ? cleaned : null;
}

export function normalizeContactPhone(input: string): string {
  return (input ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\(0\)/g, '')
    .replace(/[^\d+]/g, '')
    .replace(/(?!^)\+/g, '');
}

export function normalizeEmailAddress(input: string): string {
  let cleaned = (input ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/^mailto:/i, '')
    .trim();
  const wrappedEmail = cleaned.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  if (wrappedEmail?.[1]) cleaned = wrappedEmail[1];
  return cleaned.replace(/[.,;:]+$/g, '').trim().toLowerCase();
}

export function normalizePhoneForWhatsApp(input: string): string | null {
  let cleaned = normalizeContactPhone(input);
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = `44${cleaned.slice(1)}`;
  return cleaned || null;
}

export function normalizePhoneForDial(input: string): string | null {
  const cleaned = normalizeContactPhone(input);
  return cleaned || null;
}

export function isValidUkPhone(input: string): boolean {
  return normalizeUkMobilePhoneNumber(input) !== null;
}

export function getEmailDomainSuggestions(input: string, limit = 4): string[] {
  const cleaned = (input ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned || /\s/.test(cleaned)) return [];

  const atIndex = cleaned.indexOf('@');
  if (atIndex === -1) {
    if (cleaned.length < 2 || cleaned.includes('.')) return [];
    return EMAIL_DOMAINS.slice(0, limit).map((domain) => `${cleaned}@${domain}`);
  }

  const localPart = cleaned.slice(0, atIndex);
  const domainPart = cleaned.slice(atIndex + 1);
  if (!localPart || domainPart.includes('@')) return [];
  if (EMAIL_DOMAINS.includes(domainPart as (typeof EMAIL_DOMAINS)[number])) return [];

  const matchingDomains = EMAIL_DOMAINS.filter((domain) => domain.startsWith(domainPart));
  return (matchingDomains.length ? matchingDomains : EMAIL_DOMAINS)
    .slice(0, limit)
    .map((domain) => `${localPart}@${domain}`);
}
