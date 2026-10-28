import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { articles } from '@/lib/blog/articles';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const paidLandingCopyFiles = [
  'app/layout.tsx',
  'app/(public)/mobile-tyre-fitting/page.tsx',
  'app/(public)/puncture-repair/page.tsx',
  'app/(public)/contact/page.tsx',
  'app/(public)/contact/ContactContent.tsx',
  'app/(public)/emergency-tyre-fitting-near-me/page.tsx',
  'app/(public)/emergency-tyre-fitting/[city]/[area]/page.tsx',
  'app/(public)/puncture-repair/[city]/[area]/page.tsx',
  'app/(public)/[service]/[city]/page.tsx',
  'app/(public)/[service]/[city]/[area]/page.tsx',
  'app/(public)/services/[city]/page.tsx',
  'app/(public)/services/[city]/CityServiceContent.tsx',
  'components/marketing/EmergencyHero.tsx',
  'components/marketing/EmergencyServiceCards.tsx',
  'components/marketing/EmergencyTrustBar.tsx',
  'components/marketing/EmergencyTyreLanding.tsx',
  'components/marketing/emergency-faq-data.ts',
  'components/seo/ServiceCityContent.tsx',
  'components/seo/ServiceAreaContent.tsx',
  'lib/content/serviceCityFaq.ts',
  'lib/seo/emergencyMetadata.ts',
  'lib/seo/schemas.ts',
] as const;

describe('paid landing contact and availability invariants', () => {
  it('keeps the floating contact bar on root puncture repair and off descendant CTA pages', () => {
    const source = readSource('components/ui/FloatingContactBar.tsx');

    expect(source).toContain("const HIDDEN_ROUTES = ['/emergency'];");
    expect(source).toContain("'/puncture-repair/'");
    expect(source).toContain('HIDDEN_ROUTES.includes(pathname)');
    expect(source).toContain('pathname.startsWith(p)');
    expect(source).toContain('const PHONE_NUMBER = BUSINESS_PHONE_DISPLAY;');
    expect(source).not.toContain('process.env.NEXT_PUBLIC_PHONE_NUMBER');
    expect(source).toContain('buildWhatsAppHref(FALLBACK_WHATSAPP_MESSAGE, WHATSAPP_PHONE)');
  });

  it('keeps first-party paid landing availability copy on confirmed answering hours', () => {
    const unsupportedClaims =
      /\b24\/7\b|24 hours a day|day or night|around the clock|round-the-clock|any time of day or night|available immediately|answers? the phone immediately|we answer 24/i;

    for (const file of paidLandingCopyFiles) {
      expect(readSource(file), file).not.toMatch(unsupportedClaims);
    }
  });

  it('keeps public blog copy from making unsupported live availability promises', () => {
    const unsupportedClaims =
      /\b24\/7\b|24 hours a day|day or night|around the clock|round-the-clock|available 24|operates? 24|answers? 24|3am/i;

    for (const article of articles) {
      const publicCopy = `${article.title}\n${article.description}\n${article.content}`;
      expect(publicCopy, article.slug).not.toMatch(unsupportedClaims);
    }
  });

  it('keeps Google Ads route audit guidance aligned with confirmed hours', () => {
    const recommendations = readSource('lib/google-ads/recommendations.ts');
    const landingPageMap = readSource('lib/google-ads/landing-page-map.ts');

    expect(`${recommendations}\n${landingPageMap}`).toContain('8am-midnight');
    expect(`${recommendations}\n${landingPageMap}`).not.toMatch(
      /emergency pages imply|hours conflict|before ad copy uses 24\/7/i,
    );
  });

  it('keeps the 24-hour intent page honest about confirmed support hours', () => {
    const source = readSource('app/(public)/24-hour-tyre-fitting/page.tsx');

    expect(source).toContain('Phone support is available 8am to midnight, every day');
    expect(source).toMatch(/dispatch is\s+confirmed before a fitter is sent/);
    expect(source).not.toMatch(/operates around the clock|we answer 24 hours|Available right now|answers 24 hours/i);
  });

  it('does not alter campaign budget, geography or bid strategy while correcting the service label', () => {
    const source = readSource('lib/ads/emergencyCampaign.ts');

    expect(source).toContain("dailyBudget: 380,");
    expect(source).toContain("monthlyBudget: 11400,");
    expect(source).toContain("initialStrategy: 'Maximize Conversions',");
    expect(source).toContain("targetCpaRange: [18, 22],");
    expect(source).toContain("label: 'All of Scotland — Glasgow to Shetland',");
    expect(source).toContain('excluded: [],');
    expect(source).toContain(
      "service: 'emergency mobile tyre fitting during confirmed answering hours'",
    );
  });
});
