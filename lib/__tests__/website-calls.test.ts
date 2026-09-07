import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE',
] as const;
const root = process.cwd();

async function loadWebsiteCalls(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  return import('@/lib/analytics/website-calls');
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

class FakeText {
  nodeType = 3;
  parentElement: FakeElement | null = null;

  constructor(
    public nodeValue: string,
    public ownerDocument: FakeDocument,
  ) {}
}

class FakeElement {
  nodeType = 1;
  children: FakeElement[] = [];
  private textNodes: FakeText[] = [];
  private attributes = new Map<string, string>();
  setAttributeCalls: Array<{ name: string; value: string }> = [];
  parentElement: FakeElement | null = null;

  constructor(
    public tagName: string,
    public ownerDocument: FakeDocument,
  ) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return [
      ...this.textNodes.map((node) => node.nodeValue),
      ...this.children.map((child) => child.textContent),
    ].join('');
  }

  set textContent(value: string) {
    this.children = [];
    this.textNodes = [];
    this.appendText(value);
  }

  appendElement(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  appendText(value: string): FakeText {
    const node = new FakeText(value, this.ownerDocument);
    node.parentElement = this;
    this.textNodes.push(node);
    return node;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.setAttributeCalls.push({ name, value });
    this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  querySelectorAll<T extends Element = Element>(selector: string): T[] {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement) => {
      for (const child of element.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches as unknown as T[];
  }

  getTextNodes(): FakeText[] {
    return [
      ...this.textNodes,
      ...this.children.flatMap((child) => child.getTextNodes()),
    ];
  }

  private matches(selector: string): boolean {
    if (selector === 'a[href^="tel:"], a[href^="TEL:"]') {
      return this.tagName === 'A' && (this.getAttribute('href') ?? '').toLowerCase().startsWith('tel:');
    }

    const attrSelector = selector.match(/^(a)?\[([^\]]+)\]$/i);
    if (!attrSelector) return false;

    const tagName = attrSelector[1]?.toUpperCase();
    const attrName = attrSelector[2];
    return (!tagName || this.tagName === tagName) && this.hasAttribute(attrName);
  }
}

class FakeDocument {
  body: FakeElement;

  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createTreeWalker(root: ParentNode): { nextNode: () => FakeText | null } {
    const nodes = (root as unknown as FakeElement).getTextNodes();
    let index = 0;
    return {
      nextNode: () => nodes[index++] ?? null,
    };
  }
}

function makeCallDom() {
  const doc = new FakeDocument();
  const root = doc.body;
  const businessText = root.appendElement(doc.createElement('p'));
  businessText.textContent = 'Call 0141 266 0690 now';

  const whatsAppText = root.appendElement(doc.createElement('p'));
  whatsAppText.textContent = 'WhatsApp 07423 262955';

  const businessLink = root.appendElement(doc.createElement('a'));
  businessLink.setAttribute('href', 'tel:01412660690');
  businessLink.textContent = 'Call 0141 266 0690';

  const whatsAppLink = root.appendElement(doc.createElement('a'));
  whatsAppLink.setAttribute('href', 'tel:07423262955');
  whatsAppLink.textContent = 'WhatsApp 07423 262955';

  return {
    root: root as unknown as ParentNode,
    businessText,
    whatsAppText,
    businessLink,
    whatsAppLink,
    doc,
  };
}

describe('Google Ads website call tracking', () => {
  it('never renders a static forwarding phone number', async () => {
    const { ADS_FORWARDING_PHONE, getTrackingPhone } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE: '+441234567890',
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });

    expect(ADS_FORWARDING_PHONE).toBeNull();
    expect(getTrackingPhone('0141 266 0690')).toBe('0141 266 0690');
  });

  it('builds the verified actual website-call gtag config without phone-click env', async () => {
    const {
      ADS_ACTUAL_WEBSITE_CALL_CONVERSION,
      ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
      getGoogleAdsWebsiteCallConfig,
      renderGoogleAdsWebsiteCallConfig,
    } =
      await loadWebsiteCalls();

    expect(getGoogleAdsWebsiteCallConfig(' 0141   266   0690 ')).toEqual({
      conversionId: ADS_ACTUAL_WEBSITE_CALL_CONVERSION,
      phoneConversionNumber: ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
    });
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toContain(
      'phone_conversion_callback',
    );
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toContain(
      'AW-18255235286/jSyqCMuSnvAcENaR44BE',
    );
  });

  it('keeps actual website calls independent from ADS_PHONE_CONVERSION collisions', async () => {
    const { getGoogleAdsWebsiteCallConfig } =
      await loadWebsiteCalls({
        NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/contactLabel',
        NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-123456789/contactLabel',
      });

    expect(getGoogleAdsWebsiteCallConfig('0141 266 0690')).toEqual({
      conversionId: 'AW-18255235286/jSyqCMuSnvAcENaR44BE',
      phoneConversionNumber: '0141 266 0690',
    });
  });

  it('scopes website-call activation by consent, host and route', async () => {
    const { isGoogleAdsWebsiteCallEligible } = await loadWebsiteCalls();

    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/',
        marketingConsent: true,
      }),
    ).toBe(true);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/',
        marketingConsent: false,
      }),
    ).toBe(false);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.dukestreettyres.com',
        pathname: '/',
        marketingConsent: true,
      }),
    ).toBe(false);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/tracking/TR-123',
        marketingConsent: true,
      }),
    ).toBe(false);
  });

  it('rejects invalid displayed phone numbers', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });

    expect(getGoogleAdsWebsiteCallConfig('12345')).toBeNull();
  });

  it('does not build actual website-call config for a different valid display number', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls();

    expect(getGoogleAdsWebsiteCallConfig('0121 555 1212')).toBeNull();
  });

  it('normalizes mobile tel destinations without replacing the actual fallback number', async () => {
    const { getTelHrefForDisplayPhone, isActualWebsiteCallTelHref } = await loadWebsiteCalls();

    expect(getTelHrefForDisplayPhone('0800 123 4567')).toBe('tel:08001234567');
    expect(getTelHrefForDisplayPhone('+44 141 266 0690')).toBe('tel:+441412660690');
    expect(isActualWebsiteCallTelHref('tel:01412660690')).toBe(true);
    expect(isActualWebsiteCallTelHref('tel:+441412660690')).toBe(true);
    expect(isActualWebsiteCallTelHref('tel:08001234567')).toBe(false);
  });

  it('configures website calls with Google phone_conversion_callback', async () => {
    const {
      buildGoogleAdsWebsiteCallConfigPayload,
      configureGoogleAdsWebsiteCall,
    } = await loadWebsiteCalls();
    const callback = vi.fn();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    expect(buildGoogleAdsWebsiteCallConfigPayload(callback)).toMatchObject({
      phone_conversion_number: '0141 266 0690',
      phone_conversion_callback: callback,
    });
    expect(configureGoogleAdsWebsiteCall(undefined, callback)).toBe(true);
    expect(gtag).toHaveBeenCalledWith(
      'config',
      'AW-18255235286/jSyqCMuSnvAcENaR44BE',
      expect.objectContaining({
        phone_conversion_number: '0141 266 0690',
        phone_conversion_callback: callback,
      }),
    );
  });

  it('registers only the explicit Google callback hook', async () => {
    const {
      GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME,
      registerGoogleAdsWebsiteCallCallback,
    } = await loadWebsiteCalls();
    const callback = vi.fn();
    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);

    const unregister = registerGoogleAdsWebsiteCallCallback(callback);
    expect(win[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]).toBe(callback);

    unregister();
    expect(win[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]).toBeUndefined();
  });

  it('rejects WhatsApp and mobile numbers from Google callback values', async () => {
    const { normalizeGoogleAdsPhoneConversionCallback } = await loadWebsiteCalls();

    expect(normalizeGoogleAdsPhoneConversionCallback('07423 262955')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('+44 7423 262955')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('07700 900000')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('0800 123 4567')).toEqual({
      displayPhone: '0800 123 4567',
      telHref: 'tel:08001234567',
    });
  });

  it('does not contain arbitrary forwarding-number discovery', () => {
    const source = readSource('lib/analytics/website-calls.ts');

    expect(source).toContain('phone_conversion_callback');
    expect(source).not.toContain('\\d[\\d\\s().-]{8,}\\d');
    expect(source).not.toContain('extractPhoneDisplays');
    expect(source).not.toContain('findGoogleAdsForwardingPhone(root');
  });

  it('syncs only owned business phone text and tel links from Google callback values', async () => {
    const { syncGoogleAdsWebsiteCallDom } = await loadWebsiteCalls();
    const { root, businessText, whatsAppText, businessLink, whatsAppLink } = makeCallDom();

    expect(syncGoogleAdsWebsiteCallDom('0800 123 4567', root)).toEqual({
      displayPhone: '0800 123 4567',
      telHref: 'tel:08001234567',
    });

    expect(businessText.textContent).toBe('Call 0800 123 4567 now');
    expect(businessLink.getAttribute('href')).toBe('tel:08001234567');
    expect(whatsAppText.textContent).toBe('WhatsApp 07423 262955');
    expect(whatsAppLink.getAttribute('href')).toBe('tel:07423262955');
  });

  it('retains the validated forwarding number when unrelated DOM changes are observed', async () => {
    const { syncGoogleAdsWebsiteCallDom } = await loadWebsiteCalls();
    const { root, businessText, businessLink, doc } = makeCallDom();

    syncGoogleAdsWebsiteCallDom('0800 123 4567', root);
    const unrelated = (root as unknown as FakeElement).appendElement(doc.createElement('p'));
    unrelated.textContent = 'Booking status changed';
    syncGoogleAdsWebsiteCallDom('0800 123 4567', root);

    expect(businessText.textContent).toBe('Call 0800 123 4567 now');
    expect(businessLink.getAttribute('href')).toBe('tel:08001234567');
    expect(unrelated.textContent).toBe('Booking status changed');
  });

  it('restores owned call changes without touching unrelated mobile links', async () => {
    const { restoreGoogleAdsWebsiteCallDom, syncGoogleAdsWebsiteCallDom } =
      await loadWebsiteCalls();
    const { root, businessText, whatsAppText, businessLink, whatsAppLink } = makeCallDom();

    syncGoogleAdsWebsiteCallDom('0800 123 4567', root);
    restoreGoogleAdsWebsiteCallDom(root);

    expect(businessText.textContent).toBe('Call 0141 266 0690 now');
    expect(businessLink.getAttribute('href')).toBe('tel:01412660690');
    expect(whatsAppText.textContent).toBe('WhatsApp 07423 262955');
    expect(whatsAppLink.getAttribute('href')).toBe('tel:07423262955');
  });

  it('leaves the original business number usable when callback validation fails', async () => {
    const { syncGoogleAdsWebsiteCallDom } = await loadWebsiteCalls();
    const { root, businessText, businessLink } = makeCallDom();

    expect(syncGoogleAdsWebsiteCallDom('07423 262955', root)).toBeNull();
    expect(businessText.textContent).toBe('Call 0141 266 0690 now');
    expect(businessLink.getAttribute('href')).toBe('tel:01412660690');
  });

  it('does not rewrite unchanged owned attributes on repeated sync', async () => {
    const { syncGoogleAdsWebsiteCallDom } = await loadWebsiteCalls();
    const { root, businessLink } = makeCallDom();

    syncGoogleAdsWebsiteCallDom('0800 123 4567', root);
    const firstWriteCount = businessLink.setAttributeCalls.length;
    syncGoogleAdsWebsiteCallDom('0800 123 4567', root);

    expect(businessLink.setAttributeCalls).toHaveLength(firstWriteCount);
  });

  it('does not infer cached forwarding numbers from arbitrary page content', async () => {
    const { clearGoogleAdsWebsiteCallCallbackValue, findGoogleAdsForwardingPhone } =
      await loadWebsiteCalls();
    const { doc, root } = makeCallDom();
    const arbitrary = (root as unknown as FakeElement).appendElement(doc.createElement('p'));
    arbitrary.textContent = 'Another visible number 0800 123 4567';

    clearGoogleAdsWebsiteCallCallbackValue();

    expect(findGoogleAdsForwardingPhone()).toBeNull();
  });

  it('does not let obsolete callback unregisters clear a newer Google callback', async () => {
    const {
      GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME,
      registerGoogleAdsWebsiteCallCallback,
    } = await loadWebsiteCalls();
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);

    const unregisterFirst = registerGoogleAdsWebsiteCallCallback(firstCallback);
    registerGoogleAdsWebsiteCallCallback(secondCallback);
    unregisterFirst();

    expect(win[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]).toBe(secondCallback);
  });
});
