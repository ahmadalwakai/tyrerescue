'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Badge, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';

interface Slot {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  maxBookings: number;
  bookedCount: number;
  spotsLeft: number;
  active: boolean;
}

export function AvailabilityClient({ slots }: { slots: Slot[] }) {
  const router = useRouter();
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('10:00');
  const [newMax, setNewMax] = useState('2');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    router.refresh();
  }

  function hasValidRange(start: string, end: string): boolean {
    return start < end;
  }

  async function addSlot() {
    setError(null);

    if (!newDate) {
      setError('Date is required.');
      return;
    }

    if (!hasValidRange(newStart, newEnd)) {
      setError('Start time must be before end time.');
      return;
    }

    const max = Number(newMax);
    if (!Number.isFinite(max) || max < 1) {
      setError('Capacity must be 1 or greater.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDate,
          timeStart: newStart,
          timeEnd: newEnd,
          maxBookings: max,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Failed to add slot.');
        return;
      }

      setNewDate('');
      setNewStart('09:00');
      setNewEnd('10:00');
      setNewMax('2');
      await refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleSlot(id: string, active: boolean) {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: !active }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Failed to update slot status.');
        return;
      }

      await refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteSlot(id: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Failed to delete slot.');
        return;
      }

      await refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp()}>
        <Heading size="lg" color={c.text}>Availability</Heading>
        <Text color={c.muted} mt={1}>Manage real customer booking slots and live occupancy.</Text>
      </Box>

      <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.1s')}>
        <Text color={c.text} fontWeight="600" mb={3}>Add Slot</Text>
        <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
          <Input {...inputProps} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Flex gap={2}>
            <Input {...inputProps} type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} flex={1} />
            <Input {...inputProps} type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} flex={1} />
          </Flex>
          <Input {...inputProps} type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="Max bookings" />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={addSlot} w="100%" minH="48px" disabled={isSubmitting}>Add Slot</Button>
        </VStack>
        <HStack gap={3} flexWrap="wrap" display={{ base: 'none', md: 'flex' }}>
          <Input {...inputProps} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} maxW="180px" />
          <Input {...inputProps} type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} maxW="140px" />
          <Input {...inputProps} type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} maxW="140px" />
          <Input {...inputProps} type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} maxW="100px" placeholder="Max" />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={addSlot} disabled={isSubmitting}>Add</Button>
        </HStack>
        {error && <Text mt={3} fontSize="sm" color="red.400">{error}</Text>}
      </Box>

      {/* Desktop table */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" display={{ base: 'none', md: 'block' }} style={anim.fadeUp('0.5s', '0.2s')}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Date</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Time</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Capacity</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Booked</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Spots Left</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {slots.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={7} textAlign="center" py={8} color={c.muted}>No slots configured</Table.Cell>
              </Table.Row>
            )}
            {slots.map((slot) => (
              <Table.Row key={slot.id} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.text}>{slot.date}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.timeStart} – {slot.timeEnd}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.maxBookings}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.bookedCount}</Table.Cell>
                <Table.Cell px={4} py={3} color={slot.spotsLeft > 0 ? c.text : 'red.400'}>{slot.spotsLeft}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={slot.active ? '#14532D' : '#7F1D1D'} color="white">
                    {slot.active ? 'Active' : 'Disabled'}
                  </Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <HStack gap={2}>
                    <Button size="xs" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleSlot(slot.id, slot.active)} disabled={isSubmitting}>
                      {slot.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="xs" bg="#7F1D1D" color="white" onClick={() => deleteSlot(slot.id)} disabled={isSubmitting || slot.bookedCount > 0}>
                      Delete
                    </Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Mobile cards */}
      <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
        {slots.length === 0 ? (
          <Text textAlign="center" py={8} color={c.muted}>No slots configured</Text>
        ) : (
          slots.map((slot, i) => (
            <Box key={slot.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4} style={anim.stagger('fadeUp', i)}>
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontWeight="bold" color={c.text}>{slot.date}</Text>
                <Badge bg={slot.active ? '#14532D' : '#7F1D1D'} color="white">
                  {slot.active ? 'Active' : 'Disabled'}
                </Badge>
              </Flex>
              <Text fontSize="sm" color={c.muted} mb={1}>{slot.timeStart} – {slot.timeEnd}</Text>
              <Text fontSize="sm" color={c.muted} mb={3}>Capacity: {slot.maxBookings} | Booked: {slot.bookedCount} | Spots left: {slot.spotsLeft}</Text>
              <Flex gap={2}>
                <Button flex={1} size="sm" minH="48px" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleSlot(slot.id, slot.active)} disabled={isSubmitting}>
                  {slot.active ? 'Disable' : 'Enable'}
                </Button>
                <Button flex={1} size="sm" minH="48px" bg="#7F1D1D" color="white" onClick={() => deleteSlot(slot.id)} disabled={isSubmitting || slot.bookedCount > 0}>Delete</Button>
              </Flex>
            </Box>
          ))
        )}
      </VStack>
    </VStack>
  );
}
