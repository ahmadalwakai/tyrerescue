export function cleanContactText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function normalizeCustomerPhoneInput(input: unknown): string {
  if (typeof input !== 'string') return '';

  let cleaned = cleanContactText(input)
    .replace(/\(0\)/g, '')
    .replace(/[^\d+]/g, '');

  if (!cleaned) return '';
  cleaned = cleaned.replace(/(?!^)\+/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  return cleaned;
}

export function normalizeRecipientEmailInput(input: unknown): string {
  if (typeof input !== 'string') return '';

  let cleaned = cleanContactText(input).replace(/^mailto:/i, '').trim();
  const wrappedEmail = cleaned.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  if (wrappedEmail?.[1]) cleaned = wrappedEmail[1];

  return cleaned.replace(/[.,;:]+$/g, '').trim().toLowerCase();
}

export function normalizeUkPhoneForMatching(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  let cleaned = normalizeCustomerPhoneInput(input);
  if (!cleaned) return null;

  cleaned = cleaned.replace(/(?!^)\+/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = `44${cleaned.slice(1)}`;

  if (!/^44\d{9,10}$/.test(cleaned)) return null;
  return cleaned;
}
