/**
 * Centralized email configuration.
 * Reads env vars and determines which providers are available.
 * Never throws at import time — providers are optional for fallback architecture.
 */

export const emailConfig = {
  zeptomail: {
    apiKey: process.env.ZEPTOMAIL_API_KEY ?? '',
    fromEmail: process.env.ZEPTOMAIL_FROM_EMAIL ?? 'noreply@tyrerescue.uk',
    apiUrl: process.env.ZEPTOMAIL_API_URL ?? 'https://api.zeptomail.eu/v1.1/email',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'support@tyrerescue.uk',
  },
} as const;

export const hasZeptoMail = emailConfig.zeptomail.apiKey.length > 0;
export const hasResend = emailConfig.resend.apiKey.length > 0;

export type PrimaryProvider = 'zeptomail' | 'resend' | null;

export function getPrimaryProvider(): PrimaryProvider {
  if (hasZeptoMail) return 'zeptomail';
  if (hasResend) return 'resend';
  return null;
}
