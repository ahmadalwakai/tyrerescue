/**
 * Google Ads Website Call Tracking.
 *
 * The app must always render the real business phone number first. When the
 * verified Google Ads website-call conversion is allowed for the current page
 * and consent state, gtag.js can dynamically replace visible matching numbers
 * with a Google forwarding number at runtime.
 */

export const ADS_ACTUAL_WEBSITE_CALL_CONVERSION =
  'AW-18255235286/jSyqCMuSnvAcENaR44BE';
export const ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE = '0141 266 0690';

const ACTUAL_WEBSITE_CALL_TEL_DIGITS = '01412660690';
const ACTUAL_WEBSITE_CALL_INTL_DIGITS = `44${ACTUAL_WEBSITE_CALL_TEL_DIGITS.slice(1)}`;
const WEBSITE_CALL_ALLOWED_HOSTS = new Set(['www.tyrerescue.uk', 'tyrerescue.uk']);
const WEBSITE_CALL_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const WEBSITE_CALL_BLOCKED_ROUTE_PREFIXES = [
  '/admin',
  '/api',
  '/dashboard',
  '/driver',
  '/success',
  '/tracking',
] as const;

export const WEBSITE_CALL_ORIGINAL_HREF_ATTR = 'data-tr-website-call-original-href';
export const WEBSITE_CALL_SYNCED_HREF_ATTR = 'data-tr-website-call-synced-href';
export const WEBSITE_CALL_ORIGINAL_TEXT_ATTR = 'data-tr-website-call-original-text';

const PHONE_TEXT_PATTERN = /(?:\+44\s?|0)\d[\d\s().-]{8,}\d/g;

export interface GoogleAdsWebsiteCallConfig {
  conversionId: string;
  phoneConversionNumber: string;
}

export interface GoogleAdsWebsiteCallEligibility {
  hostname: string | null | undefined;
  pathname: string | null | undefined;
  marketingConsent: boolean;
  displayPhone?: string | null;
}

declare global {
  interface Window {
    __TR_WEBSITE_CALL_CONFIG?: GoogleAdsWebsiteCallConfig | null;
    gtag?: (...args: unknown[]) => void;
  }
}

/** Deprecated: static forwarding numbers must never be rendered by the app. */
export const ADS_FORWARDING_PHONE: null = null;

function normalizeHost(value: string | null | undefined): string {
  if (!value) return '';
  const host = value.trim().toLowerCase();
  if (!host) return '';
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(':')[0] ?? '';
}

function normalizePathname(value: string | null | undefined): string {
  const path = (value ?? '/').split(/[?#]/)[0]?.trim() || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizePhoneConversionNumber(value: string): string | null {
  const phone = value.trim().replace(/\s+/g, ' ');
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? phone : null;
}

function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function isActualWebsiteCallDigits(digits: string): boolean {
  return digits === ACTUAL_WEBSITE_CALL_TEL_DIGITS || digits === ACTUAL_WEBSITE_CALL_INTL_DIGITS;
}

export function isActualWebsiteCallPhone(value: string | null | undefined): boolean {
  return isActualWebsiteCallDigits(phoneDigits(value));
}

export function isActualWebsiteCallTelHref(value: string | null | undefined): boolean {
  const href = value?.trim() ?? '';
  if (!href || !href.toLowerCase().startsWith('tel:')) return false;
  return isActualWebsiteCallDigits(phoneDigits(href.slice(4).split(/[?#;]/)[0]));
}

export function getTelHrefForDisplayPhone(displayPhone: string): string | null {
  const normalized = normalizePhoneConversionNumber(displayPhone);
  if (!normalized) return null;

  const digits = phoneDigits(normalized);
  if (digits.length < 10) return null;
  return normalized.startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
}

export function isGoogleAdsWebsiteCallHost(hostname: string | null | undefined): boolean {
  const host = normalizeHost(hostname);
  if (WEBSITE_CALL_ALLOWED_HOSTS.has(host)) return true;
  return process.env.NODE_ENV !== 'production' && WEBSITE_CALL_LOCAL_HOSTS.has(host);
}

export function isGoogleAdsWebsiteCallRoute(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return !WEBSITE_CALL_BLOCKED_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isGoogleAdsWebsiteCallEligible({
  hostname,
  pathname,
  marketingConsent,
  displayPhone = ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
}: GoogleAdsWebsiteCallEligibility): boolean {
  return (
    marketingConsent &&
    isGoogleAdsWebsiteCallHost(hostname) &&
    isGoogleAdsWebsiteCallRoute(pathname) &&
    isActualWebsiteCallPhone(displayPhone)
  );
}

export function getGoogleAdsWebsiteCallConfig(
  defaultPhone = ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
): GoogleAdsWebsiteCallConfig | null {
  const phoneConversionNumber = normalizePhoneConversionNumber(defaultPhone);
  if (!phoneConversionNumber || !isActualWebsiteCallPhone(phoneConversionNumber)) return null;

  return {
    conversionId: ADS_ACTUAL_WEBSITE_CALL_CONVERSION,
    phoneConversionNumber: ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
  };
}

export function getWindowGoogleAdsWebsiteCallConfig(): GoogleAdsWebsiteCallConfig | null {
  if (typeof window === 'undefined') return null;
  return window.__TR_WEBSITE_CALL_CONFIG ?? null;
}

export function configureGoogleAdsWebsiteCall(
  config = getWindowGoogleAdsWebsiteCallConfig() ?? getGoogleAdsWebsiteCallConfig(),
): boolean {
  if (!config || typeof window === 'undefined' || typeof window.gtag !== 'function') return false;

  try {
    window.gtag('config', config.conversionId, {
      phone_conversion_number: config.phoneConversionNumber,
    });
    return true;
  } catch {
    return false;
  }
}

export function renderGoogleAdsWebsiteCallConfig(defaultPhone?: string): string {
  const config = getGoogleAdsWebsiteCallConfig(defaultPhone);
  if (!config) return '';

  return `gtag('config',${JSON.stringify(config.conversionId)},${JSON.stringify({
    phone_conversion_number: config.phoneConversionNumber,
  })});`;
}

function getDefaultRoot(root?: ParentNode): ParentNode | null {
  if (root) return root;
  return typeof document === 'undefined' ? null : document;
}

function getDocumentForRoot(root: ParentNode): Document | null {
  if (typeof document !== 'undefined' && root === document) return document;
  return (root as Node).ownerDocument ?? (typeof document === 'undefined' ? null : document);
}

function extractPhoneDisplays(value: string): string[] {
  return (value.match(PHONE_TEXT_PATTERN) ?? [])
    .map((match) => normalizePhoneConversionNumber(match))
    .filter((match): match is string => Boolean(match));
}

function shouldIgnoreTextNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.tagName);
}

function walkTextNodes(root: ParentNode, visit: (node: Text) => boolean | void): void {
  const doc = getDocumentForRoot(root);
  if (!doc) return;

  const walker = doc.createTreeWalker(root, 4);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 3 && !shouldIgnoreTextNode(node)) {
      const shouldStop = visit(node as Text);
      if (shouldStop === true) return;
    }
    node = walker.nextNode();
  }
}

function hasElementChildren(element: Element): boolean {
  return Array.from(element.children).length > 0;
}

export function prepareGoogleAdsWebsiteCallVisibleNumbers(
  root?: ParentNode,
): void {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot) return;

  walkTextNodes(targetRoot, (node) => {
    const parent = node.parentElement;
    const value = node.nodeValue ?? '';
    if (!parent || hasElementChildren(parent) || !isActualWebsiteCallPhone(value)) return;
    if (!parent.hasAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR)) {
      parent.setAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR, parent.textContent ?? '');
    }
  });
}

export function findGoogleAdsForwardingPhone(root?: ParentNode): string | null {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot) return null;

  let forwardingPhone: string | null = null;

  walkTextNodes(targetRoot, (node) => {
    const text = node.nodeValue ?? '';
    for (const phone of extractPhoneDisplays(text)) {
      if (!isActualWebsiteCallPhone(phone)) {
        forwardingPhone = phone;
        return true;
      }
    }
    return false;
  });

  return forwardingPhone;
}

export function syncGoogleAdsWebsiteCallTelLinks(root?: ParentNode): string | null {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot) return null;

  const forwardingPhone = findGoogleAdsForwardingPhone(targetRoot);
  const forwardingHref = forwardingPhone ? getTelHrefForDisplayPhone(forwardingPhone) : null;
  if (!forwardingHref || typeof targetRoot.querySelectorAll !== 'function') return null;

  targetRoot
    .querySelectorAll<HTMLAnchorElement>('a[href^="tel:"], a[href^="TEL:"]')
    .forEach((anchor) => {
      const existingOriginalHref =
        anchor.getAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR) ?? anchor.getAttribute('href');
      if (!isActualWebsiteCallTelHref(existingOriginalHref)) return;

      if (!anchor.hasAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR)) {
        anchor.setAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR, anchor.getAttribute('href') ?? '');
      }
      anchor.setAttribute('href', forwardingHref);
      anchor.setAttribute(WEBSITE_CALL_SYNCED_HREF_ATTR, forwardingHref);
    });

  return forwardingHref;
}

export function restoreGoogleAdsWebsiteCallDom(root?: ParentNode): void {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot || typeof targetRoot.querySelectorAll !== 'function') return;

  targetRoot
    .querySelectorAll<HTMLElement>(`[${WEBSITE_CALL_ORIGINAL_TEXT_ATTR}]`)
    .forEach((element) => {
      const originalText = element.getAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR);
      if (originalText !== null) element.textContent = originalText;
      element.removeAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR);
    });

  targetRoot
    .querySelectorAll<HTMLAnchorElement>(`a[${WEBSITE_CALL_ORIGINAL_HREF_ATTR}]`)
    .forEach((anchor) => {
      const originalHref = anchor.getAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR);
      if (originalHref !== null) anchor.setAttribute('href', originalHref);
      anchor.removeAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR);
      anchor.removeAttribute(WEBSITE_CALL_SYNCED_HREF_ATTR);
    });
}

/**
 * Preserve the old call-site contract while avoiding fake forwarding numbers.
 * Google Ads dynamic number insertion happens after render via gtag.js.
 */
export function getTrackingPhone(defaultPhone: string): string {
  return defaultPhone;
}
