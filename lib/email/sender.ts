import { hasZeptoMail, getPrimaryProvider } from './config';
import { ZeptoMailProvider } from './providers/zeptomail';
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

/**
 * Send email via ZeptoMail.
 */
export async function sendWithFallback(
  options: EmailOptions
): Promise<FallbackEmailResult> {
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
  const result = await provider.send(options);

  return {
    ...result,
    attemptedProviders,
    fallbackUsed: false,
  };
}
