import { db, drivers, bookings } from '@/lib/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import {
  Box,
  Heading,
  VStack,
  Text,
  Table,
  Badge,
  Link as ChakraLink,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const STATUS_LABELS: Record<string, string> = {
  driver_assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export default async function DriverJobsPage() {
  const session = await auth();
  if (!session || session.user.role !== 'driver') {
    redirect('/login');
  }

  // Get driver record
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  if (!driver) {
    redirect('/login');
  }

  // Get active jobs
  const activeStatuses = ['driver_assigned', 'en_route', 'arrived', 'in_progress'];
  const activeJobs = await db
    .select({
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driver.id),
        inArray(bookings.status, activeStatuses)
      )
    )
    .orderBy(desc(bookings.createdAt));

  // Get completed jobs (last 30)
  const completedJobs = await db
    .select({
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driver.id),
        eq(bookings.status, 'completed')
      )
    )
    .orderBy(desc(bookings.updatedAt))
    .limit(30);

  function formatDate(date: Date | null): string {
    if (!date) return '-';
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <Box>
      <Heading size="lg" mb={6} color={c.text} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        Jobs
      </Heading>

      <VStack align="stretch" gap={8}>
        {/* Active Jobs */}
        <Box>
          <Heading size="md" mb={4} color={c.text}>
            Active Jobs
          </Heading>
          {/* Desktop table */}
          <Box display={{ base: 'none', md: 'block' }} bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
            <Table.Root size="md">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Reference</Table.ColumnHeader>
                  <Table.ColumnHeader>Address</Table.ColumnHeader>
                  <Table.ColumnHeader>Tyre Size</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {activeJobs.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text textAlign="center" py={6} color={c.muted}>
                        No active jobs
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  activeJobs.map((job, i) => (
                    <Table.Row key={job.refNumber} style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.1 + i * 0.08, 0.5)}s both` }}>
                      <Table.Cell>
                        <ChakraLink
                          asChild
                          fontWeight="medium"
                          color={c.accent}
                        >
                          <NextLink href={`/driver/jobs/${job.refNumber}`}>
                            {job.refNumber}
                          </NextLink>
                        </ChakraLink>
                      </Table.Cell>
                      <Table.Cell>
                        <Text maxW="250px" truncate>
                          {job.addressLine}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{job.tyreSizeDisplay || '-'}</Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="medium" color={c.accent}>
                          {STATUS_LABELS[job.status] || job.status}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {formatDate(job.scheduledAt || job.createdAt)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>

          {/* Mobile cards */}
          <VStack display={{ base: 'flex', md: 'none' }} gap={3} align="stretch">
            {activeJobs.length === 0 ? (
              <Text textAlign="center" py={6} color={c.muted}>No active jobs</Text>
            ) : (
              activeJobs.map((job, i) => (
                <Box key={job.refNumber} asChild style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.05 + i * 0.05, 0.5).toFixed(2)}s both` }}>
                  <NextLink href={`/driver/jobs/${job.refNumber}`} style={{ textDecoration: 'none' }}>
                    <Box bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} minH="48px" borderLeft="4px solid" borderLeftColor={c.accent}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Text color={c.accent} fontWeight="600" fontSize="sm">{job.refNumber}</Text>
                        <Badge bg="rgba(249,115,22,0.1)" color={c.accent} fontSize="xs">
                          {STATUS_LABELS[job.status] || job.status}
                        </Badge>
                      </Box>
                      <Text color={c.text} fontSize="sm" mb={1} lineClamp={2}>{job.addressLine}</Text>
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Text color={c.muted} fontSize="xs">{job.tyreSizeDisplay || '-'}</Text>
                        <Text color={c.muted} fontSize="xs">{formatDate(job.scheduledAt || job.createdAt)}</Text>
                      </Box>
                    </Box>
                  </NextLink>
                </Box>
              ))
            )}
          </VStack>
        </Box>

        {/* Completed Jobs */}
        <Box>
          <Heading size="md" mb={4} color={c.text}>
            Completed Jobs
          </Heading>
          {/* Desktop table */}
          <Box display={{ base: 'none', md: 'block' }} bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflowX="auto" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}>
            <Table.Root size="md">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Reference</Table.ColumnHeader>
                  <Table.ColumnHeader>Address</Table.ColumnHeader>
                  <Table.ColumnHeader>Tyre Size</Table.ColumnHeader>
                  <Table.ColumnHeader>Status</Table.ColumnHeader>
                  <Table.ColumnHeader>Date</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {completedJobs.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text textAlign="center" py={6} color={c.muted}>
                        No completed jobs yet
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  completedJobs.map((job, i) => (
                    <Table.Row key={job.refNumber} style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.1 + i * 0.05, 0.5)}s both` }}>
                      <Table.Cell>
                        <ChakraLink
                          asChild
                          fontWeight="medium"
                          color={c.accent}
                        >
                          <NextLink href={`/driver/jobs/${job.refNumber}`}>
                            {job.refNumber}
                          </NextLink>
                        </ChakraLink>
                      </Table.Cell>
                      <Table.Cell>
                        <Text maxW="250px" truncate>
                          {job.addressLine}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{job.tyreSizeDisplay || '-'}</Table.Cell>
                      <Table.Cell>
                        <Text fontWeight="medium" color="green.400">
                          Completed
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {formatDate(job.scheduledAt || job.createdAt)}
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>

          {/* Mobile cards */}
          <VStack display={{ base: 'flex', md: 'none' }} gap={3} align="stretch">
            {completedJobs.length === 0 ? (
              <Text textAlign="center" py={6} color={c.muted}>No completed jobs yet</Text>
            ) : (
              completedJobs.map((job, i) => (
                <Box key={job.refNumber} asChild style={{ animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${Math.min(0.05 + i * 0.05, 0.5).toFixed(2)}s both` }}>
                  <NextLink href={`/driver/jobs/${job.refNumber}`} style={{ textDecoration: 'none' }}>
                    <Box bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} minH="48px">
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Text color={c.accent} fontWeight="600" fontSize="sm">{job.refNumber}</Text>
                        <Text fontWeight="medium" color="green.400" fontSize="xs">Completed</Text>
                      </Box>
                      <Text color={c.text} fontSize="sm" mb={1} lineClamp={2}>{job.addressLine}</Text>
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Text color={c.muted} fontSize="xs">{job.tyreSizeDisplay || '-'}</Text>
                        <Text color={c.muted} fontSize="xs">{formatDate(job.scheduledAt || job.createdAt)}</Text>
                      </Box>
                    </Box>
                  </NextLink>
                </Box>
              ))
            )}
          </VStack>
          {completedJobs.length === 30 && (
            <Text fontSize="sm" color={c.muted} mt={2}>
              Showing last 30 completed jobs
            </Text>
          )}
        </Box>
      </VStack>
    </Box>
  );
}
