import { getSlotsWithOccupancy } from '@/lib/availability';
import { AvailabilityClient } from './AvailabilityClient';

export default async function AdminAvailabilityPage() {
  const slots = await getSlotsWithOccupancy({ includeInactive: true });

  return <AvailabilityClient slots={slots} />;
}
