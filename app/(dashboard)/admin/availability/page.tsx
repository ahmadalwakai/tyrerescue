import { db, availabilitySlots } from '@/lib/db';
import { asc } from 'drizzle-orm';
import { AvailabilityClient } from './AvailabilityClient';

export default async function AdminAvailabilityPage() {
  const slots = await db
    .select({
      id: availabilitySlots.id,
      date: availabilitySlots.date,
      timeStart: availabilitySlots.timeStart,
      timeEnd: availabilitySlots.timeEnd,
      maxBookings: availabilitySlots.maxBookings,
      bookedCount: availabilitySlots.bookedCount,
      active: availabilitySlots.active,
    })
    .from(availabilitySlots)
    .orderBy(asc(availabilitySlots.date), asc(availabilitySlots.timeStart));

  return <AvailabilityClient slots={slots} />;
}
