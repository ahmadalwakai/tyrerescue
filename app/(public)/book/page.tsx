import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';

export const metadata: Metadata = {
  title: 'Book a Fitting',
  description:
    'Book your mobile tyre fitting online. Emergency callouts and scheduled appointments available across Glasgow and Edinburgh.',
};

export default function BookPage() {
  return <BookingWizard />;
}
