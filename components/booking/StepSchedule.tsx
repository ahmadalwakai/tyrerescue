'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  SimpleGrid,
} from '@chakra-ui/react';
import { WizardState } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';

interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
  spotsLeft: number;
}

interface StepScheduleProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepSchedule({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepScheduleProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    state.scheduledDate || ''
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    state.scheduledTime || ''
  );
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate next 14 days
  const availableDates = useMemo(() => {
    const dates: { value: string; label: string; dayName: string }[] = [];
    const today = new Date();

    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const value = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
      const label = date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });

      dates.push({ value, label, dayName });
    }

    return dates;
  }, []);

  // Fetch slots when date changes
  useEffect(() => {
    if (!selectedDate) return;

    async function fetchSlots() {
      setIsLoading(true);
      setError(null);
      setSelectedTime('');

      try {
        const res = await fetch(
          `${API.AVAILABILITY_SLOTS}?date=${selectedDate}&lat=${state.lat}&lng=${state.lng}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load time slots');
        }

        setSlots(data.slots || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load time slots';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSlots();
  }, [selectedDate, state.lat, state.lng]);

  const handleContinue = () => {
    if (!selectedDate || !selectedTime) return;

    updateState({
      scheduledDate: selectedDate,
      scheduledTime: selectedTime,
    });

    goToNext();
  };

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Choose a date and time
        </Text>
        <Text color={c.muted}>
          Select when you&apos;d like us to come to you.
        </Text>
      </Box>

      {/* Date Selection */}
      <Box style={anim.fadeUp('0.5s', '0.1s')}>
        <Text fontWeight="600" mb={3}>
          Date
        </Text>
        <Box overflowX="auto" pb={2}>
          <HStack gap={2} minW="max-content">
            {availableDates.map((date) => (
              <Button
                key={date.value}
                variant={selectedDate === date.value ? 'solid' : 'outline'}
                colorPalette={selectedDate === date.value ? 'orange' : 'gray'}
                minW="70px"
                h="auto"
                py={3}
                px={3}
                onClick={() => setSelectedDate(date.value)}
                flexDir="column"
                gap={1}
              >
                <Text fontSize="xs" opacity={0.8}>
                  {date.dayName}
                </Text>
                <Text fontWeight="700">{date.label}</Text>
              </Button>
            ))}
          </HStack>
        </Box>
      </Box>

      {/* Time Slots */}
      {selectedDate && (
        <Box>
          <Text fontWeight="600" mb={3}>
            Time
          </Text>

          {isLoading && (
            <VStack py={6}>
              <Spinner size="md" />
              <Text color={c.muted} fontSize="sm">
                Loading available times...
              </Text>
            </VStack>
          )}

          {error && (
            <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
              <Text color="red.400">{error}</Text>
            </Box>
          )}

          {!isLoading && !error && slots.length === 0 && (
            <Box p={6} textAlign="center" bg={c.surface} borderRadius="md">
              <Text color={c.text}>No available time slots for this date.</Text>
              <Text color={c.muted} fontSize="sm" mt={1}>
                Please select another date.
              </Text>
            </Box>
          )}

          {!isLoading && !error && slots.length > 0 && (
            <SimpleGrid columns={{ base: 2, md: 3 }} gap={2}>
              {slots.map((slot, i) => (
                <Button
                  key={slot.time}
                  style={anim.stagger('fadeUp', i, '0.4s', 0, 0.05)}
                  variant={selectedTime === slot.time ? 'solid' : 'outline'}
                  colorPalette={
                    selectedTime === slot.time
                      ? 'orange'
                      : slot.available
                      ? 'gray'
                      : 'gray'
                  }
                  disabled={!slot.available}
                  opacity={slot.available ? 1 : 0.5}
                  onClick={() => slot.available && setSelectedTime(slot.time)}
                  flexDir="column"
                  h="auto"
                  py={3}
                  gap={0}
                  aria-label={slot.available ? `${slot.label}${slot.spotsLeft <= 3 ? `, ${slot.spotsLeft} spots left` : ''}` : `${slot.label} — fully booked`}
                >
                  <Text fontWeight="600">{slot.label}</Text>
                  {slot.available ? (
                    slot.spotsLeft <= 3 && (
                      <Text fontSize="xs" color="orange.500">
                        {slot.spotsLeft} left
                      </Text>
                    )
                  ) : (
                    <Text fontSize="xs">Fully booked</Text>
                  )}
                </Button>
              ))}
            </SimpleGrid>
          )}
        </Box>
      )}

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button variant="outline" onClick={goToPrev} flex="1">
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime}
          flex="1"
        >
          Continue
        </Button>
      </HStack>
    </VStack>
  );
}
