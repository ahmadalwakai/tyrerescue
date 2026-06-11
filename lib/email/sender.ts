import { hasZeptoMail, getPrimaryProvider } from './config';
import { ZeptoMailProvider } from './providers/zeptomail';
import { validateRecipientEmail } from './validate-recipient';
import type { EmailOptions, EmailProviderResult, EmailProviderName } from './types';

/**
 * Email sender using ZeptoMail.
 * No database writes — callers handle notification tracking.
 */

// Lazy singleton — only created when first needed
let zeptoMailProvider: ZeptoMailProvider | null = null;

function getZeptoMail(): ZeptoMailProvider {
  if (!zeptoMailProvider) zeptoMailProvider = new ZeptoMailProvider();
  return zeptoMailProvider;
}

/** @internal Reset cached provider singletons (for tests only) */
export function _resetProviders() {
  zeptoMailProvider = null;
}

export interface FallbackEmailResult extends EmailProviderResult {
  attemptedProviders: EmailProviderName[];
  fallbackUsed: boolean;
}

// Retry policy for transient ZeptoMail failures (5xx, network errors).
// Tuned to recover from brief upstream blips without delaying API responses too long.
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES = 3
const RETRY_BACKOFF_MS = [500, 1500] as const;

/**
 * Send email via ZeptoMail with retry on transient failures.
 *
 * يتحقق من صحة جميع عناوين المستلمين قبل أي طلب إلى Zepto Mail.
 * إذا كان أي عنوان غير صالح (فارغ، وهمي، أو غير مُنسَّق)، يُرفض الإرسال فوراً.
 */
export async function sendWithFallback(
  options: EmailOptions
): Promise<FallbackEmailResult> {
  // التحقق من جميع عناوين المستلمين قبل الاتصال بـ Zepto Mail
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  for (const addr of recipients) {
    const check = validateRecipientEmail(addr);
    if (!check.ok) {
      console.warn(`[email] Blocked send to invalid recipient: ${check.reason}`);
      return {
        success: false,
        provider: 'zeptomail',
        error: `Recipient email blocked: ${check.reason}`,
        attemptedProviders: [],
        fallbackUsed: false,
      };
    }
  }

  const primary = getPrimaryProvider();
  const attemptedProviders: EmailProviderName[] = [];

  if (!primary || !hasZeptoMail) {
    return {
      success: false,
      provider: 'zeptomail',
      error: 'No email provider configured (ZeptoMail API key not set)',
      attemptedProviders: [],
      fallbackUsed: false,
    };
  }

  attemptedProviders.push('zeptomail');
  const provider = getZeptoMail();

  let result = await provider.send(options);
  let attempt = 0;

  while (!result.success && result.retriable && attempt < MAX_RETRIES) {
    const wait = RETRY_BACKOFF_MS[attempt] ?? 1500;
    await new Promise((resolve) => setTimeout(resolve, wait));
    attempt++;
    console.warn(
      `[email] ZeptoMail send failed (attempt ${attempt}/${MAX_RETRIES + 1}), retrying: ${result.error}`,
    );
    result = await provider.send(options);
  }

  return {
    ...result,
    attemptedProviders,
    fallbackUsed: false,
  };
}
