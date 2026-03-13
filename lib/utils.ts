/**
 * Utility functions for the application
 */

/**
 * Generate a booking reference number
 * Format: TYR-YYYY-XXXXX
 */
export function generateRefNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000 + Math.random() * 90000); // 5-digit number
  return `TYR-${year}-${random}`;
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Format a date and time for display
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format a time for display
 */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Calculate minutes until a future time
 */
export function minutesUntil(futureDate: Date): number {
  const now = new Date();
  const diffMs = futureDate.getTime() - now.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Format tyre size for display
 */
export function formatTyreSize(width: number, aspect: number, rim: number): string {
  return `${width}/${aspect}/R${rim}`;
}

/**
 * Validate UK phone number
 */
export function isValidUKPhone(phone: string): boolean {
  const cleanedPhone = phone.replace(/\s/g, '');
  // UK phone numbers start with 0 or +44
  const ukPhoneRegex = /^(\+44|0)[1-9]\d{8,10}$/;
  return ukPhoneRegex.test(cleanedPhone);
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UK postcode
 */
export function isValidUKPostcode(postcode: string): boolean {
  const postcodeRegex = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  return postcodeRegex.test(postcode);
}

/**
 * Slugify a string for URLs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
