import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import CityPricePage, { generateMetadata } from '@/app/(public)/mobile-tyre-fitting-price/[city]/page';
import { getCityLocalBusinessSchema, getLocalBusinessSchema } from '@/lib/seo/schemas';
import { getCityPriceData, priceCitySlugs } from '@/lib/seo/cities';
import { cityContent } from '@/lib/data/cityContent';
import { WORKSHOP_ADDRESS, WORKSHOP_ADDRESS_LABEL } from '@/lib/config/business-contact';
import { SERVICE_PRICING } from '@/lib/pricing';
import { SEO_RESPONSE_TIME_LABEL } from '@/lib/seo/response-time';

// The booking widget has its own coverage. Here the real server page is rendered
// to compare the public price/FAQ content with its emitted structured data.
vi.mock('@/app/(public)/mobile-tyre-fitting-price/[city]/CityQuoteWidget', () => ({
  CityQuoteWidget: () => null,
}));

describe('SEO service offer prices', () => {
  it.each([
    ['mobile-tyre-fitting', 20, 'per tyre'],
    ['tyre-fitting', 20, 'per tyre'],
    ['emergency-tyre-fitting', 49, 'charged separately'],
    ['tyre-repair', 25, 'repairable'],
    ['puncture-repair', 25, 'repairable'],
  ])('publishes a numeric fee with its conditions for %s', (slug, fee, condition) => {
    const schema = getCityLocalBusinessSchema({
      cityName: 'Glasgow',
      serviceSlug: String(slug),
      serviceName: 'Tyre service',
      pageUrl: `https://www.tyrerescue.uk/${slug}/glasgow`,
      // A display label is deliberately not a source for the machine price.
      priceFrom: 'A marketing label containing £999 is not a numeric price',
    });
    const offer = schema.hasOfferCatalog.itemListElement[0];

    expect(offer.price).toBe(fee);
    expect(typeof offer.price).toBe('number');
    expect(offer.priceCurrency).toBe('GBP');
    expect(offer.description).toContain(condition);
    expect(offer.description).not.toContain('£999');
  });

  it('omits a numeric price for an unrecognised service instead of guessing', () => {
    const schema = getCityLocalBusinessSchema({
      cityName: 'Glasgow', serviceSlug: 'unconfigured-service',
      serviceName: 'Unconfigured service', pageUrl: 'https://www.tyrerescue.uk/example',
      priceFrom: 'Request a quote',
    });
    expect(schema.hasOfferCatalog.itemListElement[0]).not.toHaveProperty('price');
  });
});

describe('City price pages', () => {
  it.each(priceCitySlugs)('keeps %s fees, FAQ and canonical consistent', async (slug) => {
    const params = Promise.resolve({ city: slug });
    const metadata = await generateMetadata({ params });
    const $ = load(renderToStaticMarkup(await CityPricePage({ params })));
    const city = getCityPriceData(slug)!;
    const title = metadata.title as { absolute: string };

    expect(title.absolute).toBe(`Mobile Tyre Fitting ${city.name} Prices | Tyre Rescue`);
    expect(title.absolute.match(/Tyre Rescue/g)).toHaveLength(1);
    expect(metadata.alternates?.canonical).toBe(`https://www.tyrerescue.uk/mobile-tyre-fitting-${slug}-price`);
    expect(metadata.description).toContain(`£${SERVICE_PRICING.fitting.from} per tyre plus tyre cost`);
    expect(metadata.description).toContain(`callout from £${SERVICE_PRICING.emergency.from}`);
    expect(metadata.description).not.toMatch(/£45|£65|£90/);

    const rows = $('tbody tr').map((_, row) => $(row).text()).get();
    expect(rows[0]).toContain(`From £${SERVICE_PRICING.fitting.from}`);
    expect(rows[0]).toContain('charged separately');
    expect(rows[1]).toContain('Quote by size and brand');
    expect(rows[2]).toContain(`From £${SERVICE_PRICING.emergency.from}`);
    expect(rows[2]).toContain('charged separately');
    expect(rows[3]).toContain(`From £${SERVICE_PRICING.punctureRepair.from}`);
    expect($('main').text()).not.toMatch(/VAT not applicable|all including fitting|£45|£65|£90/);

    const structured = $('script[type="application/ld+json"]').toArray()
      .map((node) => JSON.parse($(node).text()));
    const faqSchema = structured.find((schema) => schema['@type'] === 'FAQPage');
    const visibleFaq = $('details').toArray().map((node) => ({
      question: $(node).find('summary').text().trim(),
      answer: $(node).find('p').text().trim(),
    }));
    expect(faqSchema.mainEntity.map((question: {
      name: string; acceptedAnswer: { text: string };
    }) => ({ question: question.name, answer: question.acceptedAnswer.text }))).toEqual(visibleFaq);
    expect(visibleFaq[1].answer).toContain(SEO_RESPONSE_TIME_LABEL);
  });

  it('uses the existing configured Glasgow service location throughout the city copy', () => {
    expect(WORKSHOP_ADDRESS).toEqual({
      streetAddress: '3, 10 Gateside St', addressLocality: 'Glasgow',
      postalCode: 'G31 1PD', addressRegion: 'Scotland', addressCountry: 'GB',
    });
    expect(getLocalBusinessSchema().address).toEqual({ '@type': 'PostalAddress', ...WORKSHOP_ADDRESS });
    expect(getCityPriceData('glasgow')?.description).toContain(WORKSHOP_ADDRESS_LABEL);
    expect(cityContent.glasgow.uniqueIntro).toContain(WORKSHOP_ADDRESS_LABEL);
    expect(cityContent.glasgow.uniqueBody).toContain(WORKSHOP_ADDRESS_LABEL);
    expect(getCityPriceData('glasgow')?.description).not.toContain('Duke Street');
  });
});
