import 'server-only';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export interface OutboundOrigin {
  userUuid: string;
  lineId: number;
  context: string;
}

export interface OutboundConfig {
  scope: string;
  baseUrl: string;
  token: string;
  tenantUuid: string;
  origin: OutboundOrigin;
}

export interface OutboundCapability {
  enabled: boolean;
  reason: string;
  message: string;
}

export type OutboundConfiguration =
  | { capability: OutboundCapability & { enabled: false }; config: null }
  | { capability: OutboundCapability & { enabled: true }; config: OutboundConfig };

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function disabled(reason: string, message: string): OutboundConfiguration {
  return { capability: { enabled: false, reason, message }, config: null };
}

/** Configuration is server-owned: no request parameter can choose a host, line or user. */
export function getOutboundConfiguration(adminUserId: string, env: Readonly<Record<string, string | undefined>> = process.env): OutboundConfiguration {
  if (env.BONLINE_OUTBOUND_ENABLED !== 'true') {
    return disabled('not_configured', 'bOnline click-to-call has not been activated for this account.');
  }
  if (env.BONLINE_OUTBOUND_PROVIDER !== 'wazo' || env.BONLINE_OUTBOUND_PROVIDER_VERIFIED !== 'true') {
    return disabled('provider_not_verified', 'bOnline must confirm call-origination API access before calls can be started.');
  }
  try {
    const url = new URL(env.BONLINE_OUTBOUND_API_BASE_URL ?? '');
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || (url.port && url.port !== '443') || isIP(hostname) || hostname.startsWith('[')
      || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(hostname)
      || /(?:^|\.)(localhost|local|internal|test|invalid|example)$/.test(hostname)
      || !['/1.0', '/1.0/', '/api/calld/1.0', '/api/calld/1.0/'].includes(url.pathname)) {
      return disabled('invalid_configuration', 'The verified bOnline calling endpoint has not been configured correctly.');
    }
    const token = env.BONLINE_OUTBOUND_API_TOKEN ?? '';
    const tenantUuid = env.BONLINE_OUTBOUND_TENANT_UUID ?? '';
    if (!/^[\x21-\x7e]{16,4096}$/.test(token) || !UUID_PATTERN.test(tenantUuid)) {
      return disabled('invalid_configuration', 'The bOnline calling credentials have not been configured correctly.');
    }
    const origins: unknown = JSON.parse(env.BONLINE_OUTBOUND_ADMIN_ORIGINS ?? '{}');
    const origin = origins && typeof origins === 'object' && !Array.isArray(origins)
      && Object.hasOwn(origins, adminUserId) ? (origins as Record<string, unknown>)[adminUserId] : null;
    if (!origin || typeof origin !== 'object' || Array.isArray(origin)) {
      return disabled('origin_not_assigned', 'No verified bOnline phone line is assigned to this admin.');
    }
    const item = origin as Record<string, unknown>;
    if (typeof item.userUuid !== 'string' || !UUID_PATTERN.test(item.userUuid)
      || !Number.isSafeInteger(item.lineId) || Number(item.lineId) < 1
      || typeof item.context !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(item.context)) {
      return disabled('invalid_configuration', 'The assigned bOnline phone line has not been configured correctly.');
    }
    const baseUrl = url.href.replace(/\/$/, '');
    return {
      capability: { enabled: true, reason: 'ready', message: 'Your assigned bOnline phone will ring first. Answer it to connect to the customer.' },
      config: {
        baseUrl, token, tenantUuid,
        scope: createHash('sha256').update(`${baseUrl}\0${tenantUuid}`).digest('hex'),
        origin: { userUuid: item.userUuid, lineId: Number(item.lineId), context: item.context },
      },
    };
  } catch {
    return disabled('invalid_configuration', 'The bOnline calling connection has not been configured correctly.');
  }
}
