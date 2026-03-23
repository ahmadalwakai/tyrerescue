/**
 * Provider-agnostic email contract.
 * All providers and the orchestrator conform to these types.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  notificationId?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type EmailProviderName = 'zeptomail' | 'resend';

export interface EmailProviderResult extends EmailResult {
  provider: EmailProviderName;
  statusCode?: number;
  rawError?: string;
  /** false = ambiguous failure (e.g. timeout after server may have accepted) — do NOT fall back */
  retriable?: boolean;
}

export interface EmailSender {
  send(options: EmailOptions): Promise<EmailProviderResult>;
}
