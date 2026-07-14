import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema } from '@/lib/seo/schemas';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { EmergencyHero } from '@/components/marketing/EmergencyHero';
import { EmergencyTrustBar } from '@/components/marketing/EmergencyTrustBar';
import { EmergencyServiceCards } from '@/components/marketing/EmergencyServiceCards';
import { EmergencyCoverageSection } from '@/components/marketing/EmergencyCoverageSection';
import { EmergencyPricingSection } from '@/components/marketing/EmergencyPricingSection';
import { EmergencyFaq } from '@/components/marketing/EmergencyFaq';
import { StickyMobileEmergencyBar } from '@/components/conversion/StickyMobileEmergencyBar';
import { EMERGENCY_PAGE_FAQS } from '@/components/marketing/emergency-faq-data';
import { buildEmergencyBreadcrumbJsonLd, buildEmergencyMetadata, buildEmergencyServiceJsonLd } from '@/lib/seo/emergencyMetadata';

export const metadata = buildEmergencyMetadata();

export default function EmergencyPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <EmergencyHero />
        <EmergencyTrustBar />
        <EmergencyServiceCards />
        <EmergencyPricingSection />
        <EmergencyCoverageSection />
        <EmergencyFaq framed />
      </main>
      <Footer />
      <StickyMobileEmergencyBar />
      <JsonLd data={buildEmergencyServiceJsonLd()} />
      <JsonLd data={buildEmergencyBreadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Emergency Tyre Fitting', path: '/emergency' },
      ])} />
      <JsonLd data={getFAQSchema(EMERGENCY_PAGE_FAQS)} />
    </>
  );
}
