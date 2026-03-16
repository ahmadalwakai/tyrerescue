'use client';

import { Box, VStack, HStack, Text, Button, Link as ChakraLink } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

interface Tyre {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  priceNew: number | null;
  stockNew: number | null;
  isLocalStock: boolean | null;
  availableNew: boolean | null;
  slug: string;
}

interface Props {
  tyre: Tyre;
}

const SEASON_LABELS: Record<string, string> = {
  summer: 'Summer',
  winter: 'Winter',
  allseason: 'All Season',
};

function getStockBadge(stock: number | null, isLocal: boolean | null): { text: string; color: string } {
  if (isLocal && stock && stock >= 3) {
    return { text: 'In Stock', color: '#22C55E' };
  }
  if (isLocal && stock && stock >= 1) {
    return { text: 'Low Stock', color: c.accent };
  }
  return { text: 'Pre-order', color: c.accent };
}

export function TyreCard({ tyre }: Props) {
  const price = tyre.priceNew;
  const stock = tyre.stockNew;
  const available = tyre.availableNew;
  const stockBadge = getStockBadge(stock, tyre.isLocalStock);

  if (!available || price === null) {
    return null;
  }

  return (
    <Box
      bg={c.card}
      p={5}
      borderRadius="md"
      borderWidth="1px"
      borderColor={c.border}
    >
      <VStack align="stretch" gap={3}>
        {/* Brand and Pattern */}
        <Box>
          <ChakraLink
            asChild
            fontWeight="semibold"
            fontSize="lg"
            color={c.text}
            _hover={{ textDecoration: 'underline' }}
          >
            <NextLink href={`/tyres/${tyre.slug}`}>
              {tyre.brand} {tyre.pattern}
            </NextLink>
          </ChakraLink>
          <Text fontSize="sm" color={c.muted}>
            {tyre.sizeDisplay}
          </Text>
        </Box>

        {/* Specs Row */}
        <HStack gap={4} wrap="wrap" fontSize="sm" color={c.muted}>
          <Text>{SEASON_LABELS[tyre.season] || tyre.season}</Text>
          {tyre.speedRating && <Text>Speed: {tyre.speedRating}</Text>}
          {tyre.loadIndex && <Text>Load: {tyre.loadIndex}</Text>}
          {tyre.wetGrip && <Text>Wet Grip: {tyre.wetGrip}</Text>}
        </HStack>

        {/* Price and Stock */}
        <HStack justify="space-between" align="center">
          <Text fontSize="xl" fontWeight="bold" color={c.text}>
            £{price.toFixed(2)}
          </Text>
          <Text fontSize="sm" fontWeight="500" color={stockBadge.color}>
            {stockBadge.text}
          </Text>
        </HStack>

        {/* Book Button */}
        <Button
          asChild
          size="sm"
          colorPalette="orange"
          width="100%"
          disabled={!available}
        >
          <NextLink href={`/emergency?tyreId=${tyre.id}`}>
            Book This Tyre
          </NextLink>
        </Button>
      </VStack>
    </Box>
  );
}
