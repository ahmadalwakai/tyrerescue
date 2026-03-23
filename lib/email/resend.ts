/**
 * Email facade — backward-compatible API surface.
 *
 * All 16+ call sites import from '@/lib/email/resend'.
 * This module keeps those imports working while routing through
 * the provider-agnostic orchestrator (sender.ts).
 *
 * Re-exports canonical types from types.ts for convenience.
 */

import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendWithFallback } from './sender';
import type {
  EmailOptions as CanonicalEmailOptions,
  EmailResult as CanonicalEmailResult,
} from './types';

// Re-export the canonical types so existing `import { EmailOptions } from '@/lib/email/resend'` still works
export type EmailOptions = CanonicalEmailOptions;
export type EmailResult = CanonicalEmailResult;

/**
 * Send an email via the provider orchestrator (ZeptoMail → Resend fallback).
 * On success: updates notifications table status to sent, records sent_at
 * On failure: increments attempts counter, records last_error, keeps status as failed
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const result = await sendWithFallback(options);

  // Update notification record if one was attached
  if (options.notificationId) {
    const [existing] = await db
      .select({ attempts: notifications.attempts })
      .from(notifications)
      .where(eq(notifications.id, options.notificationId))
      .limit(1);

    if (result.success) {
      await db
        .update(notifications)
        .set({
          status: 'sent',
          sentAt: new Date(),
          lastError: null,
          attempts: (existing?.attempts ?? 0) + 1,
        })
        .where(eq(notifications.id, options.notificationId));
    } else {
      await db
        .update(notifications)
        .set({
          status: 'failed',
          lastError: result.error ?? 'Unknown error',
          attempts: (existing?.attempts ?? 0) + 1,
        })
        .where(eq(notifications.id, options.notificationId));
    }
  }

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}

export interface CreateNotificationAndSendOptions {
  to: string;
  subject: string;
  html: string;
  type: string;
  userId?: string | null;
  bookingId?: string | null;
  text?: string;
  attachments?: EmailOptions['attachments'];
}

/**
 * Create a notification record and send the email
 * Used for all booking-related emails so every send attempt is logged
 */
export async function createNotificationAndSend(
  options: CreateNotificationAndSendOptions
): Promise<EmailResult & { notificationId: string }> {
  // Insert notification with pending status
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: options.userId || null,
      bookingId: options.bookingId || null,
      type: options.type,
      channel: 'email',
      status: 'pending',
      attempts: 0,
    })
    .returning({ id: notifications.id });

  // Send the email with notification tracking
  const result = await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    notificationId: notification.id,
    attachments: options.attachments,
  });

  return {
    ...result,
    notificationId: notification.id,
  };
}

/**
 * Send email with retry logic (exponential backoff)
 */
export async function sendEmailWithRetry(
  options: EmailOptions,
  maxAttempts: number = 3
): Promise<EmailResult & { attempts: number }> {
  let attempts = 0;
  let lastError: string | undefined;

  while (attempts < maxAttempts) {
    attempts++;

    const result = await sendEmail(options);

    if (result.success) {
      return { ...result, attempts };
    }

    lastError = result.error;

    // Don't retry on the last attempt
    if (attempts < maxAttempts) {
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempts - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError || 'Max retry attempts reached',
    attempts,
  };
}
