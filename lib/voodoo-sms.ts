/**
 * Voodoo SMS Service — server-side only
 *
 * Sends SMS via the Voodoo SMS REST API (https://api.voodoosms.com).
 * Auth: Bearer token via VOODOO_SMS_API_KEY.
 * Never import this from client components.
 */

const VOODOO_REST_BASE = 'https://api.voodoosms.com';
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Types ──────────────────────────────────────────────

export interface SendSmsParams {
  to: string;
  message: string;
  senderId?: string;
}

export interface SmsResult {
  ok: boolean;
  provider: 'voodoo';
  providerMessageId?: string;
  statusCode?: number;
  error?: string;
}

// ─── Phone normalisation ────────────────────────────────

/**
 * Normalise a UK phone number to international format without leading +.
 * Returns null if the input cannot be recognised as a valid UK mobile.
 *
 * Accepted inputs:
 *   07xxxxxxxxx   → 447xxxxxxxxx
 *   +447xxxxxxxxx → 447xxxxxxxxx
 *   447xxxxxxxxx  → 447xxxxxxxxx
 *   00447xxxxxxxx → 447xxxxxxxxx
 */
export function normalizeUkPhoneNumber(input: string): string | null {
  // Strip everything except digits and leading +
  let cleaned = input.replace(/[\s\-\(\)]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Remove leading 00 international prefix
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  // Convert local 0 prefix to 44
  if (cleaned.startsWith('0')) {
    cleaned = '44' + cleaned.slice(1);
  }

  // Must now start with 44 and be 12 digits (447xxxxxxxxx)
  if (!/^447\d{9}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

// ─── Config helpers ─────────────────────────────────────

function getApiKey(): string | null {
  return process.env.VOODOO_SMS_API_KEY || null;
}

function getSenderId(): string {
  return process.env.VOODOO_SMS_SENDER_ID || 'TyreRescue';
}

function isEnabled(): boolean {
  return process.env.VOODOO_SMS_ENABLED !== 'false';
}

// ─── Send SMS ───────────────────────────────────────────

export async function sendVoodooSms(params: SendSmsParams): Promise<SmsResult> {
  if (!isEnabled()) {
    return {
      ok: false,
      provider: 'voodoo',
      error: 'SMS sending is disabled (VOODOO_SMS_ENABLED=false)',
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      provider: 'voodoo',
      error: 'SMS service not configured (missing VOODOO_SMS_API_KEY)',
    };
  }

  const normalized = normalizeUkPhoneNumber(params.to);
  if (!normalized) {
    return {
      ok: false,
      provider: 'voodoo',
      error: `Invalid UK phone number: ${params.to.slice(0, 6)}...`,
    };
  }

  if (!params.message || params.message.length === 0) {
    return {
      ok: false,
      provider: 'voodoo',
      error: 'Message body is empty',
    };
  }

  const senderId = params.senderId || getSenderId();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const body = {
      to: normalized,
      from: senderId,
      msg: params.message,
    };

    console.log('[VoodooSMS] Sending to', normalized.slice(0, 5) + '***');

    const res = await fetch(`${VOODOO_REST_BASE}/sendsms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const statusCode = res.status;
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg = data?.error?.msg || data?.error || `HTTP ${statusCode}`;
      console.error('[VoodooSMS] API error:', statusCode, JSON.stringify(data).slice(0, 300));
      return {
        ok: false,
        provider: 'voodoo',
        statusCode,
        error: `Voodoo: ${errMsg}`,
      };
    }

    // REST API returns { count, messages: [{ id, recipient, status }], ... }
    const messageId = data?.messages?.[0]?.id;
    return {
      ok: true,
      provider: 'voodoo',
      providerMessageId: messageId || undefined,
      statusCode,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('[VoodooSMS] Request timed out');
      return {
        ok: false,
        provider: 'voodoo',
        error: 'SMS request timed out',
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[VoodooSMS] Unexpected error:', message);
    return {
      ok: false,
      provider: 'voodoo',
      error: message,
    };
  }
}
