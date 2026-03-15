import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Book Mobile Tyre Fitting Glasgow | Tyre Shop Near Me | Tyre Rescue',
  description:
    'Book a mobile tyre fitter in Glasgow and Edinburgh. New tyres near me, fitted at your home or workplace. Tyre shop that comes to you. Budget and premium brands available.',
};

export default function BookPage() {
  return <BookingWizard />;
}
