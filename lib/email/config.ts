/**
 * Centralized email configuration.
 * Reads env vars and determines if ZeptoMail is available.
 */

export const emailConfig = {
  zeptomail: {
    apiKey: process.env.ZEPTOMAIL_API_KEY ?? '',
    fromEmail: process.env.ZEPTOMAIL_FROM_EMAIL ?? 'noreply@tyrerescue.uk',
    apiUrl: process.env.ZEPTOMAIL_API_URL ?? 'https://api.zeptomail.eu/v1.1/email',
  },
} as const;

export const hasZeptoMail = emailConfig.zeptomail.apiKey.length > 0;

export type PrimaryProvider = 'zeptomail' | null;

export function getPrimaryProvider(): PrimaryProvider {
  if (hasZeptoMail) return 'zeptomail';
  return null;
}
