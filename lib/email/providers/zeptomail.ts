import { emailConfig } from '../config';
import type { EmailOptions, EmailProviderResult, EmailSender } from '../types';

/**
 * ZeptoMail provider — fetch-based, no SDK dependency.
 * API docs: https://www.zoho.com/zeptomail/help/api/email-sending.html
 */
export class ZeptoMailProvider implements EmailSender {
  private apiKey: string;
  private fromEmail: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = emailConfig.zeptomail.apiKey;
    this.fromEmail = emailConfig.zeptomail.fromEmail;
    this.apiUrl = emailConfig.zeptomail.apiUrl;
  }

  async send(options: EmailOptions): Promise<EmailProviderResult> {
    if (!this.apiKey) {
      return {
        success: false,
        provider: 'zeptomail',
        error: 'ZeptoMail API key not configured',
      };
    }

    const toAddresses = (
      Array.isArray(options.to) ? options.to : [options.to]
    ).map((email) => ({ email_address: { address: email } }));

    const body: Record<string, unknown> = {
      from: {
        address: this.fromEmail,
        name: 'Tyre Rescue',
      },
      to: toAddresses,
      subject: options.subject,
      htmlbody: options.html,
    };

    if (options.text) {
      body.textbody = options.text;
    }

    if (options.attachments?.length) {
      body.attachments = options.attachments.map((a) => ({
        name: a.filename,
        content: a.content.toString('base64'),
        mime_type: a.contentType,
      }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Zoho-enczapikey ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // 2xx = email accepted by ZeptoMail — treat as success even if
      // the response body is unparseable, to avoid duplicate sends.
      if (response.ok) {
        let messageId: string | undefined;
        try {
          const json = (await response.json()) as Record<string, unknown>;
          messageId =
            typeof json.request_id === 'string' ? json.request_id : undefined;
        } catch {
          // Body parse failed but email was accepted — still success
        }
        return {
          success: true,
          provider: 'zeptomail',
          messageId,
          statusCode: response.status,
        };
      }

      // Non-2xx: email was NOT sent, safe to fall back
      let errorMessage = `ZeptoMail error ${response.status}`;
      let rawError: string | undefined;
      try {
        const json = (await response.json()) as Record<string, unknown>;
        if (typeof json.message === 'string') errorMessage = json.message;
        rawError = JSON.stringify(json);
      } catch {
        // Can't parse error body — use status code message
      }
      return {
        success: false,
        provider: 'zeptomail',
        statusCode: response.status,
        error: errorMessage,
        rawError,
        retriable: true,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const message = isAbort
        ? 'ZeptoMail request timed out'
        : err instanceof Error
          ? err.message
          : 'Unknown ZeptoMail error';
      return {
        success: false,
        provider: 'zeptomail',
        error: message,
        rawError: message,
        // Timeout is ambiguous — server may have accepted the email.
        // Do NOT fall back to avoid duplicate sends.
        retriable: !isAbort,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
