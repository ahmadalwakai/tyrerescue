const CALL_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Europe/London',
});
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatBonlineCallTime(value: string | null): string {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? CALL_DATE.format(timestamp) : 'Time unavailable';
}

/** The API reports revenue in integer pence; missing data is never shown as zero. */
export function formatBonlineMoneyPence(pence: number | null): string {
  return pence !== null && Number.isSafeInteger(pence) ? GBP.format(pence / 100) : '—';
}

export function formatBonlineRate(rate: number | null): string {
  return rate !== null && Number.isFinite(rate) && rate >= 0 && rate <= 1
    ? `${(rate * 100).toFixed(1)}%` : '—';
}

/** Only ordinary phone numbers can reach the originate request, never dial strings. */
export function normalizeBonlineDestination(value: string): string | null {
  const input = value.trim();
  if (!input || !/^[+\d\s().-]+$/.test(input)) return null;
  let number = input.replace(/[\s().-]/g, '');
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  if (/^0[1-9]\d{8,9}$/.test(number)) number = `+44${number.slice(1)}`;
  if (/^44\d{10}$/.test(number)) number = `+${number}`;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}
