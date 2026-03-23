/**
 * Provider-neutral email entry point.
 * New code should import from '@/lib/email' instead of '@/lib/email/resend'.
 */

// Public API
export { sendEmail, createNotificationAndSend, sendEmailWithRetry } from './resend';

// Orchestrator
export { sendWithFallback } from './sender';
export type { FallbackEmailResult } from './sender';

// Types
export type {
  EmailOptions,
  EmailResult,
  EmailProviderName,
  EmailProviderResult,
  EmailAttachment,
  EmailSender,
} from './types';

// Config
export { emailConfig, hasZeptoMail, hasResend, getPrimaryProvider } from './config';
