'use client';

import { Box, Container, SimpleGrid, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { emergencyCampaign, type PriceItem } from '@/lib/ads/emergencyCampaign';

type EmergencyPricingSectionProps = {
  readonly priceItems?: readonly PriceItem[];
};

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function EmergencyPricingSection({
  priceItems = emergencyCampaign.priceItems,
}: EmergencyPricingSectionProps) {
  if (priceItems.length === 0) return null;

  return (
    <Box as="section" bg={colorTokens.bg} py={{ base: '44px', md: '72px' }} px={{ base: 4, md: 8 }}>
      <Container maxW="1180px" px={0}>
        <Text
          as="h2"
          fontSize={{ base: '32px', md: '52px' }}
          lineHeight="1"
          color={colorTokens.text}
          mb="12px"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Emergency pricing
        </Text>
        <Text
          fontSize={{ base: '15px', md: '17px' }}
          color={colorTokens.muted}
          lineHeight="1.7"
          maxW="720px"
          mb={{ base: '24px', md: '34px' }}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Clear from-prices before dispatch. The fitter confirms tyre size, stock, and the final price before any work starts.
        </Text>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="14px">
          {priceItems.map((item) => (
            <Box
              key={item.id}
              bg={colorTokens.surface}
              borderWidth="1px"
              borderColor={colorTokens.border}
              borderRadius="8px"
              p={{ base: '20px', md: '24px' }}
              minH="210px"
            >
              <Text fontSize="14px" color={colorTokens.muted} fontWeight="800" mb="12px" style={{ fontFamily: 'var(--font-body)' }}>
                {item.label}
              </Text>
              <Text
                fontSize={{ base: '46px', md: '54px' }}
                color={item.id === 'punctureRepair' ? '#5eead4' : colorTokens.accent}
                lineHeight="1"
                mb="10px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                from {gbpFormatter.format(item.fromAmount)}
              </Text>
              <Text fontSize="14px" color={colorTokens.text} fontWeight="700" mb="8px" style={{ fontFamily: 'var(--font-body)' }}>
                {item.unit}
              </Text>
              <Text fontSize="13px" color={colorTokens.muted} lineHeight="1.65" style={{ fontFamily: 'var(--font-body)' }}>
                {item.note}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
