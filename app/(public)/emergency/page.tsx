import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Emergency Tyre Fitting Glasgow & Edinburgh | 24/7 Response | Tyre Rescue',
  description:
    'Flat tyre? Our emergency mobile tyre fitters respond within 45 minutes, 24 hours a day across Glasgow and Edinburgh. Call 0141 266 0690.',
};

export default function EmergencyPage() {
  return <BookingWizard initialState={{ bookingType: 'emergency' }} initialStep="location" />;
}
