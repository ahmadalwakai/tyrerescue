/** Postal text only; links and bare coordinates are separate location actions. */
export function formatBookingAddressForCopy(address?: string | null, postcode?: string | null): string {
  const text = (address ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
  if (!text || /^(?:not (?:set|provided|available)|no address(?: available)?|address (?:unavailable|not provided)|location unavailable|unknown|[-—])\.?$/i.test(text)
    || /^(?:https?:\/\/|www\.)/i.test(text)
    || /^-?\d+(?:\.\d+)?\s*[,;]\s*-?\d+(?:\.\d+)?$/.test(text)) return '';
  const postalCode = (postcode ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
    .replace(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/, '$1 $2');
  if (!postalCode || text.replace(/\s/g, '').toUpperCase().includes(postalCode.replace(/\s/g, ''))) return text;
  return `${text}\n${postalCode}`;
}
