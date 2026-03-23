import { Resend } from 'resend';
import { emailConfig } from '../config';
import type { EmailOptions, EmailProviderResult, EmailSender } from '../types';

/**
 * Resend provider — wraps the Resend SDK into the EmailSender contract.
 * No DB writes; that responsibility stays in the facade (resend.ts).
 */
export class ResendProvider implements EmailSender {
  private client: Resend | null;
  private fromEmail: string;

  constructor() {
    this.client = emailConfig.resend.apiKey
      ? new Resend(emailConfig.resend.apiKey)
      : null;
    this.fromEmail = emailConfig.resend.fromEmail;
  }

  async send(options: EmailOptions): Promise<EmailProviderResult> {
    if (!this.client) {
      return {
        success: false,
        provider: 'resend',
        error: 'Resend API key not configured',
      };
    }

    try {
      const result = await this.client.emails.send({
        from: `Tyre Rescue <${this.fromEmail}>`,
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
        return {
          success: false,
          provider: 'resend',
          error: result.error.message,
          rawError: JSON.stringify(result.error),
          retriable: true,
        };
      }

      return {
        success: true,
        provider: 'resend',
        messageId: result.data?.id,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Resend error';
      return {
        success: false,
        provider: 'resend',
        error: message,
        rawError: message,
        retriable: true,
      };
    }
  }
}
