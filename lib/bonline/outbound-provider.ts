import 'server-only';
import type { OutboundConfig } from './outbound-config';

export type OriginationResult =
  | { status: 'accepted'; providerCallId: string; failureCode: null }
  | { status: 'failed' | 'unknown'; providerCallId: null; failureCode: string };

/**
 * Documented Wazo adapter; account-specific bOnline entitlement is NOT implied.
 * https://wazo-platform.org/documentation/api/application.html
 * https://github.com/wazo-platform/wazo-calld/blob/master/wazo_calld/plugins/calls/api.yml
 * Required ACL: calld.calls.create. The configured base URL includes /1.0.
 * No retries: a timeout can occur after the provider has already started a call.
 */
export async function originateOutboundCall(
  config: OutboundConfig,
  phone: string,
  fetcher: typeof fetch = fetch,
): Promise<OriginationResult> {
  try {
    const response = await fetcher(`${config.baseUrl}/calls`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': config.token, 'Wazo-Tenant': config.tenantUuid },
      body: JSON.stringify({
        source: { user: config.origin.userUuid, line_id: config.origin.lineId, auto_answer: false },
        destination: { extension: phone, context: config.origin.context, priority: 1 },
      }),
    });
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
      // Never expose upstream error bodies, which may contain account details.
      await response.body?.cancel();
      return { status: 'failed', providerCallId: null, failureCode: `provider_${response.status}` };
    }
    if (response.status !== 201) {
      await response.body?.cancel();
      return { status: 'unknown', providerCallId: null, failureCode: 'provider_outcome_unknown' };
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: 'unknown', providerCallId: null, failureCode: 'provider_response_invalid' };
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32_768) {
        await reader.cancel();
        return { status: 'unknown', providerCallId: null, failureCode: 'provider_response_invalid' };
      }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const callId = data && typeof data === 'object' ? (data as Record<string, unknown>).call_id : null;
    if (typeof callId !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(callId)) {
      return { status: 'unknown', providerCallId: null, failureCode: 'provider_response_invalid' };
    }
    return { status: 'accepted', providerCallId: callId, failureCode: null };
  } catch {
    return { status: 'unknown', providerCallId: null, failureCode: 'provider_outcome_unknown' };
  }
}
