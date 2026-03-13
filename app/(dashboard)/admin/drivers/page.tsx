import { db, drivers, users } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { Box, Heading } from '@chakra-ui/react';
import { DriversClient } from './DriversClient';

export default async function AdminDriversPage() {
  // Fetch all drivers with their user info
  const driversList = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
      createdAt: drivers.createdAt,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .orderBy(desc(drivers.createdAt));

  // Transform for client
  const driversData = driversList.map((d) => ({
    id: d.id,
    userId: d.userId,
    name: d.name,
    email: d.email,
    phone: d.phone,
    isOnline: d.isOnline ?? false,
    status: d.status ?? 'offline',
    currentLat: d.currentLat?.toString() ?? null,
    currentLng: d.currentLng?.toString() ?? null,
    locationAt: d.locationAt?.toISOString() ?? null,
    createdAt: d.createdAt?.toISOString() ?? null,
  }));

  return (
    <Box>
      <Heading size="lg" mb={6}>
        Drivers
      </Heading>
      <DriversClient drivers={driversData} />
    </Box>
  );
}
