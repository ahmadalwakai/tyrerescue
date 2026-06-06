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
import type { FittingLocation, WizardState } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';
import type { WeatherIconKey } from '@/lib/weather';

interface TimeSlot {
  slotId: string;
  date: string;
  time: string;
  label: string;
  timeStart: string;
  timeEnd: string;
  active: boolean;
  maxBookings: number;
  bookedCount: number;
  available: boolean;
  spotsLeft: number;
}

interface ScheduleWeatherSummary {
  date: string;
  time: string | null;
  icon: WeatherIconKey;
  conditionLabel: string;
  temperature: number | null;
  precipitationProbability: number | null;
  weatherReason: string;
  source: 'api' | 'cache' | 'fallback';
}

interface StepScheduleProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatWeatherMeta(weather: ScheduleWeatherSummary): string {
  if (weather.temperature != null) {
    return `${Math.round(weather.temperature)}C`;
  }
  if (weather.source === 'fallback') {
    return 'Forecast';
  }
  return weather.conditionLabel;
}

function getWeatherTone(icon: WeatherIconKey): {
  text: string;
  bg: string;
  border: string;
  cardBg: string;
} {
  switch (icon) {
    case 'clear':
      return {
        text: '#F59E0B',
        bg: 'rgba(245,158,11,0.16)',
        border: 'rgba(245,158,11,0.42)',
        cardBg: 'rgba(245,158,11,0.07)',
      };
    case 'partly-cloudy':
    case 'cloudy':
      return {
        text: '#38BDF8',
        bg: 'rgba(56,189,248,0.14)',
        border: 'rgba(56,189,248,0.35)',
        cardBg: 'rgba(56,189,248,0.06)',
      };
    case 'rain':
      return {
        text: '#60A5FA',
        bg: 'rgba(96,165,250,0.17)',
        border: 'rgba(96,165,250,0.44)',
        cardBg: 'rgba(96,165,250,0.08)',
      };
    case 'storm':
      return {
        text: '#A78BFA',
        bg: 'rgba(167,139,250,0.18)',
        border: 'rgba(167,139,250,0.44)',
        cardBg: 'rgba(167,139,250,0.08)',
      };
    case 'snow':
      return {
        text: '#BAE6FD',
        bg: 'rgba(186,230,253,0.16)',
        border: 'rgba(186,230,253,0.38)',
        cardBg: 'rgba(186,230,253,0.07)',
      };
    case 'fog':
    case 'wind':
      return {
        text: '#A3E635',
        bg: 'rgba(163,230,53,0.14)',
        border: 'rgba(163,230,53,0.34)',
        cardBg: 'rgba(163,230,53,0.06)',
      };
    default:
      return {
        text: c.accent,
        bg: 'rgba(249,115,22,0.12)',
        border: 'rgba(249,115,22,0.32)',
        cardBg: 'rgba(249,115,22,0.05)',
      };
  }
}

function nearestSlotWeather(
  date: string,
  timeStart: string,
  hourly: ScheduleWeatherSummary[],
): ScheduleWeatherSummary | null {
  const slotMinutes = timeToMinutes(timeStart);
  if (slotMinutes == null) return null;

  let best: { weather: ScheduleWeatherSummary; distance: number } | null = null;
  for (const weather of hourly) {
    if (weather.date !== date) continue;
    const weatherMinutes = timeToMinutes(weather.time);
    if (weatherMinutes == null) continue;
    const distance = Math.abs(weatherMinutes - slotMinutes);
    if (distance > 120) continue;
    if (!best || distance < best.distance) {
      best = { weather, distance };
    }
  }

  return best?.weather ?? null;
}

function WeatherIcon({ icon, size = 18 }: { icon: WeatherIconKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { flex: '0 0 auto' },
    'aria-hidden': true,
  };

  if (icon === 'clear') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
      </svg>
    );
  }

  if (icon === 'rain') {
    return (
      <svg {...common}>
        <path d="M7 16.5h9.2a4.3 4.3 0 0 0 .5-8.6A6.1 6.1 0 0 0 5.2 9.7A3.5 3.5 0 0 0 7 16.5Z" />
        <path d="M8 20l1-1.8M12 21l1-1.8M16 20l1-1.8" />
      </svg>
    );
  }

  if (icon === 'snow') {
    return (
      <svg {...common}>
        <path d="M7 15.5h9.2a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 5.2 8.9A3.4 3.4 0 0 0 7 15.5Z" />
        <path d="M9 19h.01M12 21h.01M15 19h.01" />
      </svg>
    );
  }

  if (icon === 'storm') {
    return (
      <svg {...common}>
        <path d="M7 15.5h9.2a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 5.2 8.9A3.4 3.4 0 0 0 7 15.5Z" />
        <path d="m12.5 15-2 4h3L11.8 22" />
      </svg>
    );
  }

  if (icon === 'fog' || icon === 'wind') {
    return (
      <svg {...common}>
        <path d="M4 9h11.5a2.5 2.5 0 1 0-2.1-3.8" />
        <path d="M3 14h15" />
        <path d="M6 18h10.5a2.5 2.5 0 1 1-2.1 3.8" />
      </svg>
    );
  }

  if (icon === 'partly-cloudy') {
    return (
      <svg {...common}>
        <path d="M7.5 9.5a4.5 4.5 0 0 1 7.7-3.2" />
        <path d="M7 17h9.2a4.3 4.3 0 0 0 .5-8.6A6.1 6.1 0 0 0 5.2 10.2A3.5 3.5 0 0 0 7 17Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M7 17h9.2a4.3 4.3 0 0 0 .5-8.6A6.1 6.1 0 0 0 5.2 10.2A3.5 3.5 0 0 0 7 17Z" />
    </svg>
  );
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
  const [selectedFittingLocation, setSelectedFittingLocation] = useState<FittingLocation | null>(
    state.fittingLocation ?? null,
  );
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherDaily, setWeatherDaily] = useState<Record<string, ScheduleWeatherSummary>>({});
  const [weatherHourly, setWeatherHourly] = useState<ScheduleWeatherSummary[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Generate today plus the next 14 days
  const availableDates = useMemo(() => {
    const dates: { value: string; label: string; dayName: string }[] = [];
    const today = new Date();

    for (let i = 0; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const value = toLocalIsoDate(date);
      const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
      const label = date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });

      dates.push({ value, label, dayName });
    }

    return dates;
  }, []);

  useEffect(() => {
    if (!state.lat || !state.lng || availableDates.length === 0) return;

    const controller = new AbortController();

    async function fetchWeather() {
      setWeatherLoading(true);
      try {
        const params = new URLSearchParams({
          lat: String(state.lat),
          lng: String(state.lng),
          dates: availableDates.map((date) => date.value).join(','),
        });
        const res = await fetch(`${API.WEATHER_SCHEDULE}?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;

        const data = await res.json();
        const daily = Array.isArray(data.daily)
          ? data.daily.filter((item: ScheduleWeatherSummary) => item?.date)
          : [];
        const hourly = Array.isArray(data.hourly)
          ? data.hourly.filter((item: ScheduleWeatherSummary) => item?.date)
          : [];

        setWeatherDaily(Object.fromEntries(daily.map((item: ScheduleWeatherSummary) => [item.date, item])));
        setWeatherHourly(hourly);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    }

    fetchWeather();
    return () => controller.abort();
  }, [availableDates, state.lat, state.lng]);

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
    if (!selectedDate || !selectedTime || !selectedFittingLocation) return;

    updateState({
      scheduledDate: selectedDate,
      scheduledTime: selectedTime,
      fittingLocation: selectedFittingLocation,
      quoteId: null,
      breakdown: null,
      quoteExpiresAt: null,
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
          Select your fitting location, date, and time.
        </Text>
      </Box>

      {/* Fitting Location */}
      <Box style={anim.fadeUp('0.5s', '0.05s')}>
        <Text fontWeight="600" mb={3}>
          Fitting location
        </Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
          {[
            {
              value: 'shop' as const,
              title: 'At the shop',
              price: 'No extra fee',
              detail: 'You come to us for the appointment.',
            },
            {
              value: 'mobile' as const,
              title: 'At your location',
              price: 'Priced in quote',
              detail: 'We come to your address.',
            },
          ].map((option) => {
            const isSelected = selectedFittingLocation === option.value;

            return (
              <Box
                key={option.value}
                as="button"
                textAlign="left"
                p={4}
                minH="116px"
                borderWidth={isSelected ? '2px' : '1px'}
                borderColor={isSelected ? c.accent : c.border}
                borderRadius="8px"
                bg={isSelected ? 'rgba(249,115,22,0.09)' : c.surface}
                color={c.text}
                onClick={() => {
                  setSelectedFittingLocation(option.value);
                  updateState({
                    fittingLocation: option.value,
                    quoteId: null,
                    breakdown: null,
                    quoteExpiresAt: null,
                  });
                }}
                _hover={{ borderColor: c.accent }}
                transition="border-color 0.15s ease, background 0.15s ease"
              >
                <HStack justify="space-between" align="start" gap={3}>
                  <Box>
                    <Text fontWeight="700" color={isSelected ? c.accent : c.text}>
                      {option.title}
                    </Text>
                    <Text fontSize="sm" color={c.muted} mt={1}>
                      {option.detail}
                    </Text>
                  </Box>
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color={isSelected ? c.bg : c.accent}
                    bg={isSelected ? c.accent : 'rgba(249,115,22,0.1)'}
                    px={2}
                    py="3px"
                    borderRadius="4px"
                    whiteSpace="nowrap"
                  >
                    {option.price}
                  </Text>
                </HStack>
              </Box>
            );
          })}
        </SimpleGrid>
      </Box>

      {/* Date Selection */}
      <Box style={anim.fadeUp('0.5s', '0.1s')}>
        <Text fontWeight="600" mb={3}>
          Date
        </Text>
        <Box overflowX="auto" pb={2}>
          <HStack gap={2} minW="max-content">
            {availableDates.map((date) => {
              const isSelected = selectedDate === date.value;
              const weather = weatherDaily[date.value];
              const weatherTone = weather ? getWeatherTone(weather.icon) : null;
              return (
              <Button
                key={date.value}
                variant={isSelected ? 'solid' : 'outline'}
                colorPalette={isSelected ? 'orange' : 'gray'}
                minW="82px"
                minH="92px"
                h="auto"
                py={3}
                px={3}
                onClick={() => setSelectedDate(date.value)}
                flexDir="column"
                gap={1}
                color={isSelected ? undefined : c.text}
                bg={!isSelected && weatherTone ? weatherTone.cardBg : undefined}
                borderColor={isSelected ? undefined : weatherTone?.border ?? c.border}
                _hover={{
                  borderColor: weatherTone?.border ?? c.accent,
                  bg: isSelected ? undefined : weatherTone?.cardBg ?? c.surface,
                }}
              >
                <Text fontSize="xs" opacity={0.8}>
                  {date.dayName}
                </Text>
                <Text fontWeight="700">{date.label}</Text>
                <HStack
                  gap={1}
                  px={weather ? 2 : 0}
                  py={weather ? '3px' : 0}
                  minH="18px"
                  borderRadius="999px"
                  border={weather ? '1px solid' : undefined}
                  borderColor={weatherTone ? (isSelected ? 'rgba(255,255,255,0.34)' : weatherTone.border) : undefined}
                  bg={weatherTone ? (isSelected ? 'rgba(255,255,255,0.18)' : weatherTone.bg) : undefined}
                  color={weatherTone ? (isSelected ? '#fff' : weatherTone.text) : isSelected ? undefined : c.muted}
                  aria-label={weather ? `${weather.conditionLabel}, ${formatWeatherMeta(weather)}` : undefined}
                >
                  {weather ? (
                    <>
                      <WeatherIcon icon={weather.icon} size={15} />
                      <Text fontSize="11px" lineHeight="1">
                        {formatWeatherMeta(weather)}
                      </Text>
                    </>
                  ) : weatherLoading ? (
                    <Box w="28px" h="10px" borderRadius="full" bg={isSelected ? 'whiteAlpha.500' : c.border} />
                  ) : null}
                </HStack>
              </Button>
              );
            })}
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
              <Text color={c.text}>No available slots right now. Please choose emergency booking or try again later.</Text>
              <Text color={c.muted} fontSize="sm" mt={1}>
                You can also select another date.
              </Text>
            </Box>
          )}

          {!isLoading && !error && slots.length > 0 && (
            <SimpleGrid columns={{ base: 2, md: 3 }} gap={2}>
              {slots.map((slot, i) => {
                const isSelected = selectedTime === slot.time;
                const weather = nearestSlotWeather(slot.date, slot.timeStart, weatherHourly);
                const weatherTone = weather ? getWeatherTone(weather.icon) : null;

                return (
                <Button
                  key={slot.slotId}
                  style={anim.stagger('fadeUp', i, '0.4s', 0, 0.05)}
                  variant={isSelected ? 'solid' : 'outline'}
                  colorPalette={isSelected ? 'orange' : 'gray'}
                  disabled={!slot.available}
                  opacity={slot.available ? 1 : 0.5}
                  onClick={() => slot.available && setSelectedTime(slot.time)}
                  flexDir="column"
                  h="92px"
                  py={3}
                  gap={1}
                  color={isSelected ? undefined : c.text}
                  bg={!isSelected && weatherTone ? weatherTone.cardBg : undefined}
                  borderColor={isSelected ? undefined : weatherTone?.border ?? c.border}
                  _hover={{
                    borderColor: weatherTone?.border ?? c.accent,
                    bg: isSelected ? undefined : weatherTone?.cardBg ?? c.surface,
                  }}
                  aria-label={slot.available ? `${slot.label}${weather ? `, ${weather.conditionLabel}` : ''}${slot.spotsLeft <= 3 ? `, ${slot.spotsLeft} slots left` : ''}` : `${slot.label} — fully booked`}
                >
                  <Text fontWeight="600" fontSize="lg" style={{ fontFamily: 'var(--font-display)' }}>
                    {slot.label}
                  </Text>
                  <HStack
                    gap={1}
                    px={weather ? 2 : 0}
                    py={weather ? '3px' : 0}
                    minH="18px"
                    borderRadius="999px"
                    border={weather ? '1px solid' : undefined}
                    borderColor={weatherTone ? (isSelected ? 'rgba(255,255,255,0.34)' : weatherTone.border) : undefined}
                    bg={weatherTone ? (isSelected ? 'rgba(255,255,255,0.18)' : weatherTone.bg) : undefined}
                    color={weatherTone ? (isSelected ? '#fff' : weatherTone.text) : isSelected ? undefined : c.muted}
                  >
                    {weather ? (
                      <>
                        <WeatherIcon icon={weather.icon} size={14} />
                        <Text fontSize="11px" lineHeight="1">
                          {formatWeatherMeta(weather)}
                        </Text>
                      </>
                    ) : null}
                  </HStack>
                  {slot.available ? (
                    slot.spotsLeft <= 3 ? (
                      <Text fontSize="xs" color={c.accent}>
                        {slot.spotsLeft} slots left
                      </Text>
                    ) : (
                      <Text fontSize="xs" color={isSelected ? undefined : c.muted}>Available</Text>
                    )
                  ) : (
                    <Text fontSize="xs" color={c.muted}>Fully booked</Text>
                  )}
                </Button>
                );
              })}
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
          disabled={!selectedFittingLocation || !selectedDate || !selectedTime}
          flex="1"
        >
          Continue
        </Button>
      </HStack>
    </VStack>
  );
}
