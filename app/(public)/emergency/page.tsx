import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Emergency Tyre Fitting Glasgow | Mobile Tyre Repair Near Me | 24/7 | Tyre Rescue',
  description:
    'Emergency mobile tyre fitting in Glasgow. Flat tyre near me? Our tyre repair service responds in under 45 minutes, 24 hours a day. Puncture repair and tyre replacement at your location.',
};

export default function EmergencyPage() {
  return <BookingWizard initialState={{ bookingType: 'emergency' }} initialStep="location" />;
}
