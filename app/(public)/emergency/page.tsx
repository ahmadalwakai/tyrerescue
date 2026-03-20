import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { JsonLd } from '@/components/seo/JsonLd';
import { getEmergencyServiceSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Emergency Tyre Fitting Glasgow | Call 0141 266 0690 | 24/7',
  description:
    'Stranded with a flat tyre? Call 0141 266 0690 right now. Our emergency mobile fitters reach you in 45 minutes across Glasgow & Edinburgh. 24/7, fully insured.',
};

export default function EmergencyPage() {
  return (
    <>
      <BookingWizard initialState={{ bookingType: 'emergency' }} initialStep="location" />
      <JsonLd data={getEmergencyServiceSchema()} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Emergency Tyre Fitting', path: '/emergency' },
      ])} />
    </>
  );
}
