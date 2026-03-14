import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Book Mobile Tyre Fitting Glasgow & Edinburgh | Tyre Rescue',
  description:
    'Book a mobile tyre fitting at your home, workplace or roadside. New tyres fitted at your location across Glasgow, Edinburgh and surrounding areas.',
};

export default function BookPage() {
  return <BookingWizard />;
}
