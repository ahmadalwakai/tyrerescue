const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatGbp(value: number): string {
  if (!Number.isFinite(value)) return GBP.format(0);
  return GBP.format(value);
}

// Mirrors lib/voodoo-sms.ts normalizeUkPhoneNumber so the SMS button can be
// gated client-side without a network round-trip.
export function isValidUkPhone(input: string): boolean {
  if (!input) return false;
  const digits = input.replace(/[^\d+]/g, '');
  if (/^07\d{9}$/.test(digits)) return true;
  if (/^\+447\d{9}$/.test(digits)) return true;
  if (/^447\d{9}$/.test(digits)) return true;
  if (/^0[12]\d{8,9}$/.test(digits)) return true;
  return false;
}
