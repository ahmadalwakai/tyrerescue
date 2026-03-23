'use client';

import { BookingWizard } from '@/components/booking/BookingWizard';

export function CityQuoteWidget({ cityName }: { cityName: string }) {
  return (
    <BookingWizard
      initialState={{ address: cityName }}
    />
  );
}
