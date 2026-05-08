import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppHref,
  buildWhatsAppOptions,
  DEFAULT_WHATSAPP_PHONE,
  FALLBACK_WHATSAPP_MESSAGE,
} from '@/lib/contact/whatsapp-options';

describe('buildWhatsAppHref', () => {
  it('encodes the message', () => {
    const href = buildWhatsAppHref('Hi, I need help.', '447423262955');
    expect(href).toBe('https://wa.me/447423262955?text=Hi%2C%20I%20need%20help.');
  });

  it('falls back to the default phone', () => {
    const href = buildWhatsAppHref('x');
    expect(href.startsWith('https://wa.me/')).toBe(true);
    expect(href).toContain(DEFAULT_WHATSAPP_PHONE);
  });

  it('strips non-digits from the phone', () => {
    expect(buildWhatsAppHref('x', '+44 7423 262955')).toContain('447423262955');
  });
});

describe('buildWhatsAppOptions', () => {
  it('home: returns four canonical options', () => {
    const opts = buildWhatsAppOptions({ source: 'home' });
    expect(opts).toHaveLength(4);
    expect(opts.map((o) => o.id)).toEqual([
      'emergency',
      'send-location',
      'no-tyre-size',
      'continue-quote',
    ]);
    expect(opts[0].message).toBe(FALLBACK_WHATSAPP_MESSAGE);
  });

  it('home with no quote: send-location offers to share', () => {
    const [, sendLoc] = buildWhatsAppOptions({ source: 'home' });
    expect(sendLoc.message).toBe('Hi, I need emergency tyre help. I can send my location.');
  });

  it('home with location: send-location embeds location', () => {
    const opts = buildWhatsAppOptions({
      source: 'home',
      quote: { location: '12 George Sq, Glasgow G2 1DY' },
    });
    expect(opts[1].message).toContain('12 George Sq, Glasgow G2 1DY');
  });

  it('quote: appends only available safe fields', () => {
    const [first] = buildWhatsAppOptions({
      source: 'quote',
      quote: {
        location: 'Glasgow G2 1DY',
        registration: 'AB12 CDE',
        problem: 'Flat front tyre',
      },
    });
    expect(first.message).toContain('Vehicle registration: AB12 CDE');
    expect(first.message).toContain('Tyre problem: Flat front tyre');
    expect(first.message).toContain('Location: Glasgow G2 1DY');
  });

  it('checkout: payment help has no IDs or sensitive data', () => {
    const [first] = buildWhatsAppOptions({
      source: 'checkout',
      quote: { registration: 'AB12 CDE' },
    });
    expect(first.id).toBe('checkout-help');
    expect(first.message).toBe('Hi, I need help with my emergency tyre payment.');
    expect(first.message).not.toMatch(/secret|pi_|cs_|stripe/i);
  });

  it('tracking: includes booking reference if provided', () => {
    const [first] = buildWhatsAppOptions({ source: 'tracking', trackingId: 'TR-1234' });
    expect(first.message).toContain('TR-1234');
  });

  it('tracking: no reference still works', () => {
    const [first] = buildWhatsAppOptions({ source: 'tracking' });
    expect(first.message).toBe('Hi, I\u2019m checking my Tyre Rescue booking.');
  });

  it('sanitizes control chars and trims long input', () => {
    const long = 'a'.repeat(500);
    const [, sendLoc] = buildWhatsAppOptions({
      source: 'home',
      quote: { location: `\u0007${long}` },
    });
    expect(sendLoc.message.length).toBeLessThan(220);
    expect(sendLoc.message).not.toMatch(/[\u0000-\u001F]/);
  });

  it('returns at most 4 options for every source', () => {
    for (const source of ['home', 'quote', 'checkout', 'tracking'] as const) {
      expect(buildWhatsAppOptions({ source }).length).toBeLessThanOrEqual(4);
    }
  });
});
