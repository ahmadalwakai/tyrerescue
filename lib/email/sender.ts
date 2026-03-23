import { hasZeptoMail, hasResend, getPrimaryProvider } from './config';
import { ZeptoMailProvider } from './providers/zeptomail';
import { ResendProvider } from './providers/resend';
import type { EmailOptions, EmailProviderResult, EmailProviderName } from './types';

/**
 * Orchestrator: tries the primary provider first, falls back to the secondary.
 * No database writes — callers handle notification tracking.
 */

// Lazy singletons — only created when first needed
let zeptoMailProvider: ZeptoMailProvider | null = null;
let resendProvider: ResendProvider | null = null;

function getZeptoMail(): ZeptoMailProvider {
  if (!zeptoMailProvider) zeptoMailProvider = new ZeptoMailProvider();
  return zeptoMailProvider;
}

function getResend(): ResendProvider {
  if (!resendProvider) resendProvider = new ResendProvider();
  return resendProvider;
}

/** @internal Reset cached provider singletons (for tests only) */
export function _resetProviders() {
  zeptoMailProvider = null;
  resendProvider = null;
}

export interface FallbackEmailResult extends EmailProviderResult {
  attemptedProviders: EmailProviderName[];
  fallbackUsed: boolean;
}

/**
 * Send email with automatic fallback.
 * Order: ZeptoMail (primary) → Resend (fallback), if both are configured.
 */
export async function sendWithFallback(
  options: EmailOptions
): Promise<FallbackEmailResult> {
  const primary = getPrimaryProvider();
  const attemptedProviders: EmailProviderName[] = [];

  if (!primary) {
    return {
      success: false,
      provider: 'zeptomail',
      error: 'No email provider configured',
      attemptedProviders: [],
      fallbackUsed: false,
    };
  }

  // Build ordered provider list
  const providerOrder: Array<{ name: EmailProviderName; available: boolean }> = [
    { name: 'zeptomail', available: hasZeptoMail },
    { name: 'resend', available: hasResend },
  ];

  // Sort so the primary comes first
  if (primary === 'resend') {
    providerOrder.reverse();
  }

  for (const { name, available } of providerOrder) {
    if (!available) continue;

    attemptedProviders.push(name);

    const provider =
      name === 'zeptomail' ? getZeptoMail() : getResend();

    const result = await provider.send(options);

    if (result.success) {
      return {
        ...result,
        attemptedProviders,
        fallbackUsed: attemptedProviders.length > 1,
      };
    }

    // retriable === false means the failure is ambiguous (e.g. timeout
    // after the server may have accepted). Do NOT fall back — risk of
    // duplicate delivery.
    if (result.retriable === false) {
      console.warn(
        `[email] ${name} failed with non-retriable error: ${result.error}`
      );
      return {
        ...result,
        attemptedProviders,
        fallbackUsed: false,
      };
    }

    console.warn(
      `[email] ${name} failed: ${result.error}${attemptedProviders.length < providerOrder.filter((p) => p.available).length ? ' — falling back' : ''}`
    );
  }

  // All providers failed
  return {
    success: false,
    provider: attemptedProviders[attemptedProviders.length - 1] ?? 'zeptomail',
    error: 'All email providers failed',
    attemptedProviders,
    fallbackUsed: attemptedProviders.length > 1,
  };
}
