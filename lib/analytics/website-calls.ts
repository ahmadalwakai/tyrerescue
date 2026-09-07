/**
 * Google Ads Website Call Tracking.
 *
 * The app always renders Tyre Rescue's real business number first. When the
 * verified Google Ads website-call conversion is eligible, gtag.js may replace
 * that visible number and call phone_conversion_callback with the Google
 * forwarding number. We only sync owned business-phone text/tel links from
 * that validated callback value; we never discover a replacement number from
 * arbitrary page text.
 */

export const ADS_ACTUAL_WEBSITE_CALL_CONVERSION =
  'AW-18255235286/jSyqCMuSnvAcENaR44BE';
export const ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE = '0141 266 0690';
export const GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME =
  '__TR_GOOGLE_ADS_PHONE_CONVERSION_CALLBACK__';

const ACTUAL_WEBSITE_CALL_TEL_DIGITS = '01412660690';
const ACTUAL_WEBSITE_CALL_INTL_DIGITS = `44${ACTUAL_WEBSITE_CALL_TEL_DIGITS.slice(1)}`;
const WHATSAPP_PHONE_DIGITS = new Set(['07423262955', '447423262955']);
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

const ACTUAL_PHONE_TEXT_PATTERN =
  /(?:\+44\s?141\s?266\s?0690|\+441412660690|0141\s?266\s?0690|01412660690)/g;

export const WEBSITE_CALL_ORIGINAL_HREF_ATTR = 'data-tr-website-call-original-href';
export const WEBSITE_CALL_SYNCED_HREF_ATTR = 'data-tr-website-call-synced-href';
export const WEBSITE_CALL_ORIGINAL_TEXT_ATTR = 'data-tr-website-call-original-text';

export interface GoogleAdsWebsiteCallConfig {
  conversionId: string;
  phoneConversionNumber: string;
}

export interface GoogleAdsWebsiteCallConfigPayload {
  phone_conversion_number: string;
  phone_conversion_callback?: GoogleAdsWebsiteCallCallback;
}

export interface GoogleAdsWebsiteCallCallbackValue {
  displayPhone: string;
  telHref: string;
}

export interface GoogleAdsWebsiteCallEligibility {
  hostname: string | null | undefined;
  pathname: string | null | undefined;
  marketingConsent: boolean;
  displayPhone?: string | null;
}

export type GoogleAdsWebsiteCallCallback = (phoneNumber: string) => void;

declare global {
  interface Window {
    __TR_WEBSITE_CALL_CONFIG?: GoogleAdsWebsiteCallConfig | null;
    [GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]?:
      | GoogleAdsWebsiteCallCallback
      | undefined;
    gtag?: (...args: unknown[]) => void;
  }
}

/** Deprecated: static forwarding numbers must never be rendered by the app. */
export const ADS_FORWARDING_PHONE: null = null;

let currentGoogleAdsCallbackPhone: GoogleAdsWebsiteCallCallbackValue | null = null;

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
  return digits.length >= 10 && digits.length <= 15 ? phone : null;
}

function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function toUkNationalDigits(digits: string): string {
  return digits.startsWith('44') ? `0${digits.slice(2)}` : digits;
}

function isActualWebsiteCallDigits(digits: string): boolean {
  return digits === ACTUAL_WEBSITE_CALL_TEL_DIGITS || digits === ACTUAL_WEBSITE_CALL_INTL_DIGITS;
}

function isWhatsAppPhoneDigits(digits: string): boolean {
  return WHATSAPP_PHONE_DIGITS.has(digits) || WHATSAPP_PHONE_DIGITS.has(toUkNationalDigits(digits));
}

function setAttributeIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function removeAttributeIfPresent(element: Element, name: string): void {
  if (element.hasAttribute(name)) element.removeAttribute(name);
}

function isParentNode(value: unknown): value is ParentNode {
  return Boolean(value && typeof (value as ParentNode).querySelectorAll === 'function');
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
  if (digits.length < 10 || digits.length > 15) return null;
  return normalized.startsWith('+') || digits.startsWith('44') ? `tel:+${digits}` : `tel:${digits}`;
}

export function normalizeGoogleAdsPhoneConversionCallback(
  value: unknown,
): GoogleAdsWebsiteCallCallbackValue | null {
  if (typeof value !== 'string') return null;

  const displayPhone = normalizePhoneConversionNumber(value);
  if (!displayPhone) return null;

  const digits = phoneDigits(displayPhone);
  const nationalDigits = toUkNationalDigits(digits);
  if (isActualWebsiteCallDigits(digits) || isWhatsAppPhoneDigits(digits)) return null;
  if (!/^0[1238]\d{8,9}$/.test(nationalDigits)) return null;

  const telHref = getTelHrefForDisplayPhone(displayPhone);
  return telHref ? { displayPhone, telHref } : null;
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

export function buildGoogleAdsWebsiteCallConfigPayload(
  callback?: GoogleAdsWebsiteCallCallback,
  phoneConversionNumber = ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
): GoogleAdsWebsiteCallConfigPayload {
  const payload: GoogleAdsWebsiteCallConfigPayload = {
    phone_conversion_number: phoneConversionNumber,
  };
  if (callback) payload.phone_conversion_callback = callback;
  return payload;
}

export function registerGoogleAdsWebsiteCallCallback(
  callback: GoogleAdsWebsiteCallCallback,
): () => void {
  if (typeof window === 'undefined') return () => {};

  window[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME] = callback;
  return () => {
    if (window[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME] === callback) {
      delete window[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME];
    }
  };
}

export function getWindowGoogleAdsWebsiteCallCallback():
  | GoogleAdsWebsiteCallCallback
  | undefined {
  if (typeof window === 'undefined') return undefined;
  return window[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME];
}

export function clearGoogleAdsWebsiteCallCallbackValue(): void {
  currentGoogleAdsCallbackPhone = null;
}

export function configureGoogleAdsWebsiteCall(
  config = getWindowGoogleAdsWebsiteCallConfig() ?? getGoogleAdsWebsiteCallConfig(),
  callback = getWindowGoogleAdsWebsiteCallCallback(),
): boolean {
  if (!config || typeof window === 'undefined' || typeof window.gtag !== 'function') return false;

  try {
    window.gtag(
      'config',
      config.conversionId,
      buildGoogleAdsWebsiteCallConfigPayload(callback, config.phoneConversionNumber),
    );
    return true;
  } catch {
    return false;
  }
}

export function renderGoogleAdsWebsiteCallConfig(defaultPhone?: string): string {
  const config = getGoogleAdsWebsiteCallConfig(defaultPhone);
  if (!config) return '';

  const callbackScript =
    `function(phoneNumber){var cb=window.${GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME};` +
    'if(typeof cb==="function"){cb(phoneNumber);}}';

  return `gtag('config',${JSON.stringify(config.conversionId)},{"phone_conversion_number":${JSON.stringify(
    config.phoneConversionNumber,
  )},"phone_conversion_callback":${callbackScript}});`;
}

function getDefaultRoot(root?: ParentNode): ParentNode | null {
  if (root) return root;
  return typeof document === 'undefined' ? null : document;
}

function getDocumentForRoot(root: ParentNode): Document | null {
  if (typeof document !== 'undefined' && root === document) return document;
  return (root as Node).ownerDocument ?? (typeof document === 'undefined' ? null : document);
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

function containsActualBusinessPhone(value: string | null | undefined): boolean {
  return (value ?? '').search(ACTUAL_PHONE_TEXT_PATTERN) >= 0;
}

function replaceActualBusinessPhone(value: string, displayPhone: string): string {
  return value.replace(ACTUAL_PHONE_TEXT_PATTERN, displayPhone);
}

export function prepareGoogleAdsWebsiteCallVisibleNumbers(
  root?: ParentNode,
): void {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot) return;

  walkTextNodes(targetRoot, (node) => {
    const parent = node.parentElement;
    const value = node.nodeValue ?? '';
    if (!parent || hasElementChildren(parent) || !containsActualBusinessPhone(value)) return;
    if (!parent.hasAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR)) {
      setAttributeIfChanged(parent, WEBSITE_CALL_ORIGINAL_TEXT_ATTR, parent.textContent ?? '');
    }
  });

  if (typeof targetRoot.querySelectorAll !== 'function') return;

  targetRoot
    .querySelectorAll<HTMLAnchorElement>('a[href^="tel:"], a[href^="TEL:"]')
    .forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      if (!isActualWebsiteCallTelHref(href)) return;
      if (!anchor.hasAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR)) {
        setAttributeIfChanged(anchor, WEBSITE_CALL_ORIGINAL_HREF_ATTR, href);
      }
    });
}

/**
 * Deprecated compatibility shim. The forwarding number now only comes from
 * Google's phone_conversion_callback; this function intentionally does not
 * inspect page text.
 */
export function findGoogleAdsForwardingPhone(): string | null {
  return currentGoogleAdsCallbackPhone?.displayPhone ?? null;
}

export function syncGoogleAdsWebsiteCallTelLinks(
  callbackValue?: unknown,
  root?: ParentNode,
): string | null {
  const callbackPhone = !root && isParentNode(callbackValue) ? undefined : callbackValue;
  const targetRoot = getDefaultRoot(!root && isParentNode(callbackValue) ? callbackValue : root);
  if (!targetRoot || typeof targetRoot.querySelectorAll !== 'function') return null;

  const normalized =
    callbackPhone === undefined
      ? currentGoogleAdsCallbackPhone
      : normalizeGoogleAdsPhoneConversionCallback(callbackPhone);
  if (!normalized) return null;

  currentGoogleAdsCallbackPhone = normalized;
  prepareGoogleAdsWebsiteCallVisibleNumbers(targetRoot);

  targetRoot
    .querySelectorAll<HTMLAnchorElement>(`a[${WEBSITE_CALL_ORIGINAL_HREF_ATTR}]`)
    .forEach((anchor) => {
      const originalHref = anchor.getAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR);
      if (!isActualWebsiteCallTelHref(originalHref)) return;

      if (anchor.getAttribute('href') !== normalized.telHref) {
        anchor.setAttribute('href', normalized.telHref);
      }
      setAttributeIfChanged(anchor, WEBSITE_CALL_SYNCED_HREF_ATTR, normalized.telHref);
    });

  return normalized.telHref;
}

export function syncGoogleAdsWebsiteCallDom(
  callbackValue: unknown,
  root?: ParentNode,
): GoogleAdsWebsiteCallCallbackValue | null {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot) return null;

  const normalized = normalizeGoogleAdsPhoneConversionCallback(callbackValue);
  if (!normalized) return null;

  currentGoogleAdsCallbackPhone = normalized;
  prepareGoogleAdsWebsiteCallVisibleNumbers(targetRoot);

  if (typeof targetRoot.querySelectorAll === 'function') {
    targetRoot
      .querySelectorAll<HTMLElement>(`[${WEBSITE_CALL_ORIGINAL_TEXT_ATTR}]`)
      .forEach((element) => {
        const originalText = element.getAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR);
        if (originalText === null) return;

        const nextText = replaceActualBusinessPhone(originalText, normalized.displayPhone);
        if (element.textContent !== nextText) element.textContent = nextText;
      });
  }

  syncGoogleAdsWebsiteCallTelLinks(normalized.displayPhone, targetRoot);
  return normalized;
}

export function restoreGoogleAdsWebsiteCallDom(root?: ParentNode): void {
  const targetRoot = getDefaultRoot(root);
  if (!targetRoot || typeof targetRoot.querySelectorAll !== 'function') return;

  targetRoot
    .querySelectorAll<HTMLElement>(`[${WEBSITE_CALL_ORIGINAL_TEXT_ATTR}]`)
    .forEach((element) => {
      const originalText = element.getAttribute(WEBSITE_CALL_ORIGINAL_TEXT_ATTR);
      if (originalText !== null && element.textContent !== originalText) {
        element.textContent = originalText;
      }
      removeAttributeIfPresent(element, WEBSITE_CALL_ORIGINAL_TEXT_ATTR);
    });

  targetRoot
    .querySelectorAll<HTMLAnchorElement>(`a[${WEBSITE_CALL_ORIGINAL_HREF_ATTR}]`)
    .forEach((anchor) => {
      const originalHref = anchor.getAttribute(WEBSITE_CALL_ORIGINAL_HREF_ATTR);
      if (originalHref !== null && anchor.getAttribute('href') !== originalHref) {
        anchor.setAttribute('href', originalHref);
      }
      removeAttributeIfPresent(anchor, WEBSITE_CALL_ORIGINAL_HREF_ATTR);
      removeAttributeIfPresent(anchor, WEBSITE_CALL_SYNCED_HREF_ATTR);
    });

  currentGoogleAdsCallbackPhone = null;
}

/**
 * Preserve the old call-site contract while avoiding fake forwarding numbers.
 * Google Ads dynamic number insertion happens after render via gtag.js.
 */
export function getTrackingPhone(defaultPhone: string): string {
  return defaultPhone;
}
