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
  RESEND_API_KEY: required('RESEND_API_KEY'),
  SITE_URL: optional('NEXTAUTH_URL', 'https://www.tyrerescue.uk'),
  MAPBOX_TOKEN: optional('NEXT_PUBLIC_MAPBOX_TOKEN', ''),
} as const;
