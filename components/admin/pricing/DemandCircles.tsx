'use client';

import { Box, Text, VStack, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface DemandCircleProps {
  label: string;
  count: number;
  status: 'dim' | 'bright' | 'pulsing';
  timeWindow: string;
}

function DemandCircle({ label, count, status, timeWindow }: DemandCircleProps) {
  const size = '90px';

  const borderColor =
    status === 'pulsing' ? c.accent :
    status === 'bright' ? c.accent :
    c.border;

  const glowStyle =
    status === 'pulsing'
      ? { animation: 'ringPulse 2s ease-in-out infinite' }
      : {};

  const opacity = status === 'dim' ? 0.5 : 1;

  return (
    <VStack gap={1} opacity={opacity} transition="opacity 0.3s">
      <Flex
        w={size}
        h={size}
        borderRadius="full"
        borderWidth="3px"
        borderColor={borderColor}
        align="center"
        justify="center"
        bg={c.surface}
        style={glowStyle}
        transition="border-color 0.3s"
      >
        <Text
          fontSize="24px"
          fontWeight="700"
          color={status === 'dim' ? c.muted : c.text}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {count}
        </Text>
      </Flex>
      <Text fontSize="11px" fontWeight="600" color={c.text} textAlign="center">
        {label}
      </Text>
      <Text fontSize="10px" color={c.muted} textAlign="center">
        {timeWindow}
      </Text>
    </VStack>
  );
}

interface DemandCirclesProps {
  visitors: number;
  callClicks: number;
  bookingStarts: number;
  bookingCompletes: number;
  activeSurcharge: number;
  threshold: number;
  hasData: boolean;
  hourWindow: string;
}

export function DemandCircles({
  visitors,
  callClicks,
  bookingStarts,
  bookingCompletes,
  activeSurcharge,
  threshold,
  hasData,
  hourWindow,
}: DemandCirclesProps) {
  if (!hasData) {
    return (
      <Box p={4} textAlign="center">
        <Text fontSize="sm" color={c.muted}>
          No demand data recorded for the current hour ({hourWindow})
        </Text>
      </Box>
    );
  }

  const getStatus = (count: number): 'dim' | 'bright' | 'pulsing' => {
    if (count === 0) return 'dim';
    if (count >= threshold) return 'pulsing';
    return 'bright';
  };

  return (
    <Box>
      <Flex
        gap={4}
        flexWrap="wrap"
        justify="center"
      >
        <DemandCircle
          label="Visitors"
          count={visitors}
          status={getStatus(visitors)}
          timeWindow={hourWindow}
        />
        <DemandCircle
          label="Call Clicks"
          count={callClicks}
          status={getStatus(callClicks)}
          timeWindow={hourWindow}
        />
        <DemandCircle
          label="Bookings Started"
          count={bookingStarts}
          status={getStatus(bookingStarts)}
          timeWindow={hourWindow}
        />
        <DemandCircle
          label="Completed"
          count={bookingCompletes}
          status={bookingCompletes > 0 ? 'bright' : 'dim'}
          timeWindow={hourWindow}
        />
        <VStack gap={1}>
          <Flex
            w="90px"
            h="90px"
            borderRadius="full"
            borderWidth="3px"
            borderColor={activeSurcharge > 0 ? c.accent : c.border}
            align="center"
            justify="center"
            bg={activeSurcharge > 0 ? 'rgba(249,115,22,0.1)' : c.surface}
            style={activeSurcharge > 0 ? { animation: 'ringPulse 2s ease-in-out infinite' } : {}}
          >
            <Text
              fontSize="20px"
              fontWeight="700"
              color={activeSurcharge > 0 ? c.accent : c.muted}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              +{activeSurcharge}%
            </Text>
          </Flex>
          <Text fontSize="11px" fontWeight="600" color={c.text} textAlign="center">
            Demand Surcharge
          </Text>
          <Text fontSize="10px" color={c.muted} textAlign="center">
            {activeSurcharge > 0 ? 'Applied' : 'None'}
          </Text>
        </VStack>
      </Flex>
    </Box>
  );
}
