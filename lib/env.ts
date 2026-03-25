/**
 * Centralized environment variable validation.
 * Import this at the top of any server module that needs env vars.
 * Throws at import time if a required variable is missing,
 * so broken deploys fail fast instead of at runtime.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/** Server-side only env — never import from client components */
export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  NEXTAUTH_SECRET: required('NEXTAUTH_SECRET'),
  STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: required('STRIPE_WEBHOOK_SECRET'),
  SITE_URL: optional('NEXTAUTH_URL', 'https://www.tyrerescue.uk'),
  MAPBOX_TOKEN: optional('NEXT_PUBLIC_MAPBOX_TOKEN', ''),
  VOODOO_SMS_API_KEY: optional('VOODOO_SMS_API_KEY', ''),
  VOODOO_SMS_SENDER_ID: optional('VOODOO_SMS_SENDER_ID', 'TyreRescue'),
  VOODOO_SMS_ENABLED: optional('VOODOO_SMS_ENABLED', 'true'),

  // Email providers — optional to support fallback architecture
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  RESEND_FROM_EMAIL: optional('RESEND_FROM_EMAIL', 'support@tyrerescue.uk'),
  ZEPTOMAIL_API_KEY: optional('ZEPTOMAIL_API_KEY', ''),
  ZEPTOMAIL_FROM_EMAIL: optional('ZEPTOMAIL_FROM_EMAIL', 'noreply@tyrerescue.uk'),
  ZEPTOMAIL_API_URL: optional('ZEPTOMAIL_API_URL', 'https://api.zeptomail.eu/v1.1/email'),

  // Weather API — optional, neutral pricing fallback when missing
  WEATHER_API_KEY: optional('WEATHER_API_KEY', ''),
  WEATHER_API_BASE_URL: optional('WEATHER_API_BASE_URL', 'https://api.openweathermap.org'),

  // Firebase Cloud Messaging — direct push delivery (replaces Expo Push relay)
  FCM_PROJECT_ID: optional('FCM_PROJECT_ID', ''),
  FCM_SERVICE_ACCOUNT_JSON: optional('FCM_SERVICE_ACCOUNT_JSON', ''),
} as const;
