'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface SurgeAlertProps {
  isNight: boolean;
  manualActive: boolean;
  manualPercent: number;
  demandPercent: number;
  totalSurcharge: number;
}

export function SurgeAlert({
  isNight,
  manualActive,
  manualPercent,
  demandPercent,
  totalSurcharge,
}: SurgeAlertProps) {
  if (totalSurcharge === 0 && !isNight) return null;

  const labels: string[] = [];
  if (isNight) labels.push('Night hours');
  if (manualActive && manualPercent > 0) labels.push(`Manual +${manualPercent}%`);
  if (demandPercent > 0) labels.push(`Demand +${demandPercent}%`);

  const severity = totalSurcharge >= 15 ? 'high' : totalSurcharge >= 5 ? 'medium' : 'low';
  const borderColor = severity === 'high' ? '#EF4444' : severity === 'medium' ? c.accent : '#3B82F6';
  const bgColor = severity === 'high' ? 'rgba(239,68,68,0.1)' : severity === 'medium' ? 'rgba(249,115,22,0.1)' : 'rgba(59,130,246,0.1)';

  return (
    <Box
      p={4}
      borderRadius="8px"
      borderWidth="1px"
      borderColor={borderColor}
      bg={bgColor}
      style={totalSurcharge > 0 ? { animation: 'fadeSlideUp 0.4s ease-out both' } : undefined}
    >
      <Flex align="center" gap={3} flexWrap="wrap">
        <Text fontSize="lg">
          {severity === 'high' ? '🔴' : severity === 'medium' ? '🟠' : '🔵'}
        </Text>
        <Box flex={1}>
          <Text color={c.text} fontWeight="600" fontSize="sm">
            Active Surcharge: +{totalSurcharge}%
          </Text>
          <Text color={c.muted} fontSize="xs">
            {labels.join(' · ') || 'No active surcharges'}
          </Text>
        </Box>
        {isNight && (
          <Text color={c.muted} fontSize="xs">🌙 Night window active</Text>
        )}
      </Flex>
    </Box>
  );
}
