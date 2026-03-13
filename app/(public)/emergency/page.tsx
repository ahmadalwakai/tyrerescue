import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Emergency Callout',
  description:
    'Need a tyre fitted urgently? Book an emergency callout and we will dispatch a fitter to your location within 45 minutes.',
};

export default function EmergencyPage() {
  return <BookingWizard initialState={{ bookingType: 'emergency' }} initialStep="location" />;
}
