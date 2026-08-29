/** Single source of truth for the canonical production URL. */
export const SITE_URL = 'https://www.tyrerescue.uk' as const;
export const DUKE_STREET_SITE_URL = 'https://www.dukestreettyres.com' as const;
const DEV_APP_ORIGIN = 'http://localhost:3002';

export type CustomerBrandKey = 'tyre_rescue' | 'duke_street_tyres';

export interface CustomerBrandConfig {
  key: CustomerBrandKey;
  sourceApp: CustomerBrandKey;
  name: string;
  legalName: string;
  canonicalHost: string;
  productionUrl: string;
  allowedHosts: readonly string[];
  phoneDisplay: string;
  phoneTel: string;
  whatsappPhone: string;
  bookingDraftKey: string;
}

export const CUSTOMER_BRANDS = {
  tyre_rescue: {
    key: 'tyre_rescue',
    sourceApp: 'tyre_rescue',
    name: 'Tyre Rescue',
    legalName: 'Tyre Rescue',
    canonicalHost: 'www.tyrerescue.uk',
    productionUrl: SITE_URL,
    allowedHosts: ['www.tyrerescue.uk', 'tyrerescue.uk'],
    phoneDisplay: '0141 266 0690',
    phoneTel: '01412660690',
    whatsappPhone: '447423262955',
    bookingDraftKey: 'tyrerescue_booking_draft',
  },
  duke_street_tyres: {
    key: 'duke_street_tyres',
    sourceApp: 'duke_street_tyres',
    name: 'Duke Street Tyres',
    legalName: 'Duke Street Tyres',
    canonicalHost: 'www.dukestreettyres.com',
    productionUrl: DUKE_STREET_SITE_URL,
    allowedHosts: ['www.dukestreettyres.com', 'dukestreettyres.com'],
    phoneDisplay: '0141 266 0690',
    phoneTel: '01412660690',
    whatsappPhone: '447423262955',
    bookingDraftKey: 'duke_street_tyres_booking_draft',
  },
} as const satisfies Record<CustomerBrandKey, CustomerBrandConfig>;

const brandsByHost = new Map<string, CustomerBrandConfig>(
  Object.values(CUSTOMER_BRANDS).flatMap((brand) =>
    brand.allowedHosts.map((host) => [host, brand] as const),
  ),
);

const brandsBySourceApp = new Map<string, CustomerBrandConfig>(
  Object.values(CUSTOMER_BRANDS).map((brand) => [brand.sourceApp, brand] as const),
);

/**
 * Canonical site URL for SEO use only (metadataBase, sitemap, robots,
 * canonical tags, OG/Twitter URLs, JSON-LD). This MUST always return the
 * production domain — never localhost — even in development, so that
 * crawlers and dev previews emit correct production URLs.
 */
export function getSiteUrl(): string {
  return SITE_URL;
}

const LOCAL_HOST_PATTERNS = ['localhost', '127.0.0.1', '0.0.0.0'];

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function looksLocal(value: string): boolean {
  return LOCAL_HOST_PATTERNS.some((p) => value.includes(p));
}

function canUseForwardedHostFallback(value: string | null | undefined): boolean {
  const host = normalizeHost(value);
  return looksLocal(host) || host.endsWith('.vercel.app');
}

export function normalizeHost(value: string | null | undefined): string {
  if (!value) return '';
  const host = value.trim().toLowerCase();
  if (!host) return '';
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(':')[0] ?? '';
}

export function getBrandBySourceApp(value: string | null | undefined): CustomerBrandConfig {
  const key = (value ?? '').trim().toLowerCase();
  return brandsBySourceApp.get(key) ?? CUSTOMER_BRANDS.tyre_rescue;
}

export function getBrandByHost(value: string | null | undefined): CustomerBrandConfig | null {
  const host = normalizeHost(value);
  return brandsByHost.get(host) ?? null;
}

export function getCanonicalHostForRequestHost(value: string | null | undefined): string | null {
  return getBrandByHost(value)?.canonicalHost ?? null;
}

export function isKnownCustomerHost(value: string | null | undefined): boolean {
  return Boolean(getBrandByHost(value));
}

export function resolveBrandFromRequest(request: Request): CustomerBrandConfig {
  const requestHost = request.headers.get('host') ?? new URL(request.url).host;
  const hostBrand = getBrandByHost(requestHost);
  if (hostBrand) return hostBrand;

  if (canUseForwardedHostFallback(requestHost)) {
    return getBrandByHost(request.headers.get('x-forwarded-host')) ?? CUSTOMER_BRANDS.tyre_rescue;
  }

  return CUSTOMER_BRANDS.tyre_rescue;
}

export function getSourceAppForRequest(request: Request): CustomerBrandKey {
  return resolveBrandFromRequest(request).sourceApp;
}

export function resolveBrandFromHeaders(headers: { get(name: string): string | null }): CustomerBrandConfig {
  const requestHost = headers.get('host');
  const hostBrand = getBrandByHost(requestHost);
  if (hostBrand) return hostBrand;

  if (canUseForwardedHostFallback(requestHost)) {
    return getBrandByHost(headers.get('x-forwarded-host')) ?? CUSTOMER_BRANDS.tyre_rescue;
  }

  return CUSTOMER_BRANDS.tyre_rescue;
}

/**
 * Origin used for clickable links emitted by the server (Stripe
 * success/cancel URLs, email/SMS booking and tracking links, password reset
 * links, admin-generated customer links, etc.).
 *
 * Behaviour:
 *  - In production: ALWAYS returns the canonical SITE_URL. Any env
 *    misconfiguration that would point production traffic at localhost is
 *    ignored and logged.
 *  - In dev/test: prefers explicit env overrides
 *    (`NEXT_PUBLIC_APP_URL` → `APP_URL` → `NEXT_PUBLIC_BASE_URL` →
 *    `NEXTAUTH_URL`) so that locally-generated links are clickable.
 *  - Never returns a trailing slash.
 */
export function getAppOrigin(): string {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Defensive guard: surface misconfiguration loudly but never serve a
    // localhost link to a real customer.
    const candidates = [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.APP_URL,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXTAUTH_URL,
    ].filter((v): v is string => Boolean(v && v.trim()));

    for (const c of candidates) {
      if (looksLocal(c)) {
        console.error(
          `[site] Refusing to use localhost URL "${c}" in production; falling back to ${SITE_URL}`,
        );
      }
    }
    return SITE_URL;
  }

  const dev =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    DEV_APP_ORIGIN;

  return stripTrailingSlash(dev);
}

/**
 * Origin for URLs embedded in **outbound customer messages** — SMS, email,
 * WhatsApp, push notifications, etc. — that real customers will click.
 *
 * This ALWAYS returns the canonical production `SITE_URL`, even in
 * development, because:
 *   - SMS/email providers are real (Voodoo, ZeptoMail) and a misconfigured
 *     `NEXTAUTH_URL=http://localhost:3002` in `.env.local` would otherwise
 *     send a real customer a localhost link they cannot open.
 *   - The tracking page (`/tracking/[ref]`) is a public page that is always
 *     reachable on the production domain.
 *
 * If you need the env-aware origin for an internal redirect (e.g. Stripe
 * `success_url` during local Stripe CLI testing), use `getAppOrigin()` instead.
 */
export function getOutboundUrl(sourceApp?: string | null): string {
  return getBrandBySourceApp(sourceApp).productionUrl;
}

export function buildCustomerUrl(path: string, sourceApp?: string | null): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getOutboundUrl(sourceApp)}${normalizedPath}`;
}

/**
 * Origin for URLs that should be reachable on the same host that handled
 * the incoming request. Use this for self-referential admin/operator
 * features (e.g. the in-app tracking links generated for a booking) where
 * the user is going to click the URL on the same machine/network they just
 * called the API from. Falls back to `getAppOrigin()` if the request has
 * no usable Host header.
 */
export function resolveRequestOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host') || url.host;
    if (!host) return getAppOrigin();
    const proto =
      forwardedProto || (looksLocal(host) ? 'http' : url.protocol.replace(':', '') || 'https');
    return stripTrailingSlash(`${proto}://${host}`);
  } catch {
    return getAppOrigin();
  }
}
