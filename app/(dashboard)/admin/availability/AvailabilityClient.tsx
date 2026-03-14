'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Table, Badge, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';

interface Slot {
  id: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  maxBookings: number | null;
  bookedCount: number | null;
  active: boolean | null;
}

export function AvailabilityClient({ slots }: { slots: Slot[] }) {
  const router = useRouter();
  const [items, setItems] = useState(slots);
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('17:00');
  const [newMax, setNewMax] = useState('1');

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  async function addSlot() {
    if (!newDate) return;
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate, timeStart: newStart, timeEnd: newEnd, maxBookings: Number(newMax) }),
    });
    if (res.ok) {
      router.refresh();
    }
  }

  async function toggleSlot(id: string, active: boolean) {
    await fetch('/api/admin/availability', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !active }),
    });
    setItems(items.map((s) => (s.id === id ? { ...s, active: !active } : s)));
  }

  async function deleteSlot(id: string) {
    await fetch('/api/admin/availability', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems(items.filter((s) => s.id !== id));
  }

  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>Availability</Heading>
        <Text color={c.muted} mt={1}>Manage booking time slots</Text>
      </Box>

      <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <Text color={c.text} fontWeight="600" mb={3}>Add Slot</Text>
        <HStack gap={3} flexWrap="wrap">
          <Input {...inputProps} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} maxW="180px" />
          <Input {...inputProps} type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} maxW="140px" />
          <Input {...inputProps} type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} maxW="140px" />
          <Input {...inputProps} type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} maxW="100px" placeholder="Max" />
          <Button bg={c.accent} color="white" _hover={{ bg: c.accentHover }} onClick={addSlot}>Add</Button>
        </HStack>
      </Box>

      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Date</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Time</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Capacity</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Booked</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={6} textAlign="center" py={8} color={c.muted}>No slots configured</Table.Cell>
              </Table.Row>
            )}
            {items.map((slot) => (
              <Table.Row key={slot.id} _hover={{ bg: c.surface }}>
                <Table.Cell px={4} py={3} color={c.text}>{slot.date}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.timeStart} – {slot.timeEnd}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.maxBookings ?? 1}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{slot.bookedCount ?? 0}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={slot.active ? '#14532D' : '#7F1D1D'} color="white">
                    {slot.active ? 'Active' : 'Disabled'}
                  </Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <HStack gap={2}>
                    <Button size="xs" bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => toggleSlot(slot.id, slot.active ?? true)}>
                      {slot.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="xs" bg="#7F1D1D" color="white" onClick={() => deleteSlot(slot.id)}>Delete</Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </VStack>
  );
}
