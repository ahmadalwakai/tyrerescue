import { Resend } from 'resend';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

if (!process.env.RESEND_API_KEY) {
  console.warn('Missing RESEND_API_KEY - emails will not be sent');
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'support@tyrerescue.uk';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  notificationId?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email via Resend
 * On success: updates notifications table status to sent, records sent_at
 * On failure: increments attempts counter, records last_error, keeps status as failed
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!resend) {
    console.warn('Resend not configured - email not sent:', options.subject);
    
    // Update notification if provided
    if (options.notificationId) {
      await db
        .update(notifications)
        .set({
          status: 'failed',
          lastError: 'Email service not configured',
          attempts: 1,
        })
        .where(eq(notifications.id, options.notificationId));
    }
    
    return {
      success: false,
      error: 'Email service not configured',
    };
  }

  try {
    const result = await resend.emails.send({
      from: `Tyre Rescue <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (result.error) {
      // Update notification on failure
      if (options.notificationId) {
        const [existing] = await db
          .select({ attempts: notifications.attempts })
          .from(notifications)
          .where(eq(notifications.id, options.notificationId))
          .limit(1);
        
        await db
          .update(notifications)
          .set({
            status: 'failed',
            lastError: result.error.message,
            attempts: (existing?.attempts ?? 0) + 1,
          })
          .where(eq(notifications.id, options.notificationId));
      }
      
      return {
        success: false,
        error: result.error.message,
      };
    }

    // Update notification on success
    if (options.notificationId) {
      const [existing] = await db
        .select({ attempts: notifications.attempts })
        .from(notifications)
        .where(eq(notifications.id, options.notificationId))
        .limit(1);
      
      await db
        .update(notifications)
        .set({
          status: 'sent',
          sentAt: new Date(),
          attempts: (existing?.attempts ?? 0) + 1,
        })
        .where(eq(notifications.id, options.notificationId));
    }

    return {
      success: true,
      messageId: result.data?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to send email:', errorMessage);
    
    // Update notification on exception
    if (options.notificationId) {
      const [existing] = await db
        .select({ attempts: notifications.attempts })
        .from(notifications)
        .where(eq(notifications.id, options.notificationId))
        .limit(1);
      
      await db
        .update(notifications)
        .set({
          status: 'failed',
          lastError: errorMessage,
          attempts: (existing?.attempts ?? 0) + 1,
        })
        .where(eq(notifications.id, options.notificationId));
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
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
