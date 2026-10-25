import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import ServiceCityPage, { generateMetadata as cityMetadata } from '@/app/(public)/[service]/[city]/page';
import ServiceAreaPage, { generateMetadata as areaMetadata } from '@/app/(public)/[service]/[city]/[area]/page';
import { services } from '@/lib/areas';
import { cities } from '@/lib/cities';
import { SEO_RESPONSE_TIME_MINUTES } from '@/lib/seo/response-time';
import { getServiceCityFaqs } from '@/lib/content/serviceCityFaq';

// Keep the actual page, FAQ generation and content components in the render.
// Only styling primitives and unrelated navigation are replaced for this SSR test.
vi.mock('@chakra-ui/react', async () => {
  const { createElement: element } = await import('react');
  const primitive = (fallback: string) => ({ as, children, id, ...props }: {
    as?: string; children?: ReactNode; id?: string; [key: string]: unknown;
  }) => element(as ?? fallback, {
    id,
    ...(props['aria-labelledby'] ? { 'aria-labelledby': props['aria-labelledby'] } : {}),
    ...(props.href ? { href: props.href } : {}),
  }, children);
  return {
    Box: primitive('div'), Container: primitive('div'), Text: primitive('p'),
    Flex: primitive('div'), SimpleGrid: primitive('div'), Link: primitive('a'),
  };
});
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children),
}));
vi.mock('@/components/ui/Nav', () => ({ Nav: () => null }));
vi.mock('@/components/ui/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/ui/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/lib/analytics/gtag', () => ({ trackCallClick: () => undefined }));

type FaqSchema = {
  '@type': string;
  mainEntity: { name: string; acceptedAnswer: { text: string } }[];
};

function readRenderedFaq(html: string) {
  const $ = load(html);
  const schemas = $('script[type="application/ld+json"]').toArray()
    .map((node) => JSON.parse($(node).html() ?? '{}') as FaqSchema);
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
  expect(faq).toBeDefined();
  return { $, faq: faq! };
}

describe('service SEO metadata', () => {
  it('gives every service-city route a single brand, price and current response time', async () => {
    for (const service of services) {
      for (const city of cities) {
        const metadata = await cityMetadata({ params: Promise.resolve({ service: service.slug, city: city.slug }) });
        expect(metadata.title).toEqual({ absolute: expect.any(String) });
        const title = (metadata.title as { absolute: string }).absolute;
        expect(title.match(/Tyre Rescue/g)).toHaveLength(1);
        expect(title).toContain(city.name);
        expect(metadata.description?.split(service.priceFrom)).toHaveLength(2);
        expect(metadata.description).toContain(`${SEO_RESPONSE_TIME_MINUTES} min response`);
        expect(metadata.description).not.toContain('0141');
        expect(metadata.description!.length).toBeLessThan(180);
      }
    }
  });

  it.each(services)('keeps $slug Govan metadata concise and specific', async (service) => {
    const metadata = await areaMetadata({ params: Promise.resolve({ service: service.slug, city: 'glasgow', area: 'govan' }) });
    const title = (metadata.title as { absolute: string }).absolute;
    expect(title.match(/Tyre Rescue/g)).toHaveLength(1);
    expect(title).toContain('Govan G51');
    expect(metadata.description).toContain('Govan, Glasgow (G51)');
    expect(metadata.description).toContain(`${SEO_RESPONSE_TIME_MINUTES} min response`);
    expect(metadata.description!.length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.alternates?.canonical).toBe(`https://www.tyrerescue.uk/${service.slug}/glasgow/govan`);
  });

  it('does not generate indexable metadata for an unknown route', async () => {
    expect(await cityMetadata({ params: Promise.resolve({ service: 'unknown-service', city: 'glasgow' }) })).toEqual({});
    expect(await areaMetadata({ params: Promise.resolve({ service: 'tyre-repair', city: 'glasgow', area: 'unknown-area' }) })).toEqual({});
  });
});

describe('visible and structured service FAQs', () => {
  it('uses the configured service price when no optional price is supplied', () => {
    for (const service of services) {
      expect(getServiceCityFaqs(service.slug, 'Glasgow'))
        .toEqual(getServiceCityFaqs(service.slug, 'Glasgow', service.priceFrom));
    }
  });

  it.each(services)('shows every $slug area FAQ with the exact structured answer', async (service) => {
    const tree = await ServiceAreaPage({ params: Promise.resolve({ service: service.slug, city: 'glasgow', area: 'govan' }) });
    const { $, faq } = readRenderedFaq(renderToStaticMarkup(tree));
    const section = $('section[aria-labelledby="area-faq-heading"]');
    expect(section.find('h2#area-faq-heading')).toHaveLength(1);
    const entries = section.find('details').toArray();
    expect(entries).toHaveLength(faq.mainEntity.length);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    entries.forEach((entry, index) => {
      expect($(entry).find('summary').text()).toBe(faq.mainEntity[index].name);
      expect($(entry).find('p').text()).toBe(faq.mainEntity[index].acceptedAnswer.text);
    });
    expect(section.text()).not.toMatch(/starts from (Fitting|Callout|Repair) from/);
  });

  it.each(services)('keeps every $slug city FAQ visible without duplicating the price wording', async (service) => {
    const tree = await ServiceCityPage({ params: Promise.resolve({ service: service.slug, city: 'glasgow' }) });
    const { $, faq } = readRenderedFaq(renderToStaticMarkup(tree));
    for (const item of faq.mainEntity) {
      expect($('h3').toArray().some((node) => $(node).text() === item.name)).toBe(true);
      expect($('p').toArray().some((node) => $(node).text() === item.acceptedAnswer.text)).toBe(true);
    }
    const priceAnswer = faq.mainEntity[0].acceptedAnswer.text;
    expect(priceAnswer.split(service.priceFrom)).toHaveLength(2);
    expect(priceAnswer).not.toMatch(/starts from (Fitting|Callout|Repair) from/);
    expect(priceAnswer).not.toContain('tyre price plus the cost');
  });
});
