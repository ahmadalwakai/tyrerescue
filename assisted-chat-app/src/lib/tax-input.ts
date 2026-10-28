export const TAX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function taxRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function isTaxDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function londonTaxToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
}
export function parseTaxPounds(value: string, signed = false): number {
  const text = value.trim();
  if (!(signed ? /^-?\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}(?:\.\d{1,2})?$/).test(text)) throw new Error('Enter a GBP amount with at most two decimal places.');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(pence)) throw new Error('This amount is too large.');
  return text.startsWith('-') ? -pence : pence;
}
export function taxMoney(pence: number | null): string {
  return pence === null ? 'Not calculated' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}
export function taxRequestMessage(error: unknown): string {
  const row = taxRecord(error); const details = taxRecord(row?.details);
  if (row?.status === 404) return 'This company or payroll record is not available to your account. Return to Tax & Payroll and check your company access.';
  if (row?.status === 405) return 'This tax action is not available. Return to Tax & Payroll and retry the action from there.';
  return typeof details?.error === 'string' ? details.error : error instanceof Error ? error.message : 'The request could not be verified. Please retry.';
}
/** Retry the same saved form with the same key; generate a new key only after confirmation. */
export function newTaxRequestKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
