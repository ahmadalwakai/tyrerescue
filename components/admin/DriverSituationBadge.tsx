import { Badge, Box, HStack, Text } from '@chakra-ui/react';
import type { DriverSituation } from '@/lib/admin/driverSituation';
import { DRIVER_SITUATION_CHAKRA_COLORS } from '@/lib/admin/driverSituation';
import { colorTokens as c } from '@/lib/design-tokens';

interface DriverSituationBadgeProps {
  situation: DriverSituation | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  showReason?: boolean;
}

export function DriverSituationBadge({
  situation,
  size = 'sm',
  showReason = false,
}: DriverSituationBadgeProps) {
  if (!situation) {
    return (
      <Badge colorPalette="gray" size={size} variant="outline">
        No active job
      </Badge>
    );
  }

  return (
    <HStack gap={2} align="center" flexWrap="wrap">
      <Badge
        colorPalette={DRIVER_SITUATION_CHAKRA_COLORS[situation.status]}
        size={size}
        variant="solid"
      >
        {situation.label}
      </Badge>
      {showReason && situation.reasonLabels[0] && (
        <Text as="span" fontSize="xs" color={c.muted}>
          {situation.reasonLabels[0]}
        </Text>
      )}
    </HStack>
  );
}

interface DriverSituationSummaryProps {
  situation: DriverSituation | null | undefined;
}

function formatTime(value: string | null): string {
  if (!value) return '--:--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function DriverSituationSummary({ situation }: DriverSituationSummaryProps) {
  if (!situation) return null;

  return (
    <Box
      mt={2}
      p={2}
      borderRadius="md"
      borderWidth="1px"
      borderColor={DRIVER_SITUATION_CHAKRA_COLORS[situation.status] === 'gray' ? c.border : `${DRIVER_SITUATION_CHAKRA_COLORS[situation.status]}.500`}
      bg="rgba(255,255,255,0.04)"
    >
      <HStack justify="space-between" align="center" gap={3}>
        <DriverSituationBadge situation={situation} />
        <Text fontSize="xs" color={c.text} fontWeight="700">
          {situation.availableAfter ? `Available ${formatTime(situation.availableAfter)}` : 'No return estimate'}
        </Text>
      </HStack>
      {situation.reasonLabels.length > 0 && (
        <Text mt={1} fontSize="xs" color={c.muted}>
          {situation.reasonLabels.slice(0, 2).join(' · ')}
        </Text>
      )}
    </Box>
  );
}
