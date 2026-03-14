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

function getStockBadge(stock: number | null): { text: string; weight: string } {
  if (stock === null || stock === 0) {
    return { text: 'Out of Stock', weight: 'normal' };
  }
  if (stock <= 4) {
    return { text: 'Low Stock', weight: 'medium' };
  }
  return { text: 'In Stock', weight: 'semibold' };
}

export function TyreCard({ tyre }: Props) {
  const price = tyre.priceNew;
  const stock = tyre.stockNew;
  const available = tyre.availableNew;
  const stockBadge = getStockBadge(stock);

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
            \u00A3{price.toFixed(2)}
          </Text>
          <Text fontSize="sm" fontWeight={stockBadge.weight}>
            {stockBadge.text}
          </Text>
        </HStack>

        {/* Book Button */}
        <Button
          asChild
          size="sm"
          colorPalette="orange"
          width="100%"
          disabled={stock === 0}
        >
          <NextLink href={`/emergency?tyreId=${tyre.id}`}>
            Book This Tyre
          </NextLink>
        </Button>
      </VStack>
    </Box>
  );
}
