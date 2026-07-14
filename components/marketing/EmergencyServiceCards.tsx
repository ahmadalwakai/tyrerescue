'use client';

import { Box, Container, SimpleGrid, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

const serviceCards = [
  {
    title: 'Emergency tyre fitting',
    copy: 'Rapid mobile tyre fitting when a flat tyre leaves you stuck at home, work, roadside, or in a car park.',
  },
  {
    title: 'Flat tyre help',
    copy: 'Tell us where you are and what happened. We confirm the tyre size and dispatch the nearest available fitter.',
  },
  {
    title: 'Mobile tyre fitter near you',
    copy: 'A fitter comes to your exact location with fitting equipment, balancing support, and available tyre stock.',
  },
  {
    title: '24/7 roadside tyre help',
    copy: 'Night, weekend, and bank-holiday emergency assistance across mainland Scotland.',
  },
  {
    title: 'Puncture repair',
    copy: 'Where the tyre is legally repairable, we repair it on site from \u00a325 instead of replacing it unnecessarily.',
  },
  {
    title: 'Motorway tyre assistance',
    copy: 'Help for motorway and A-road tyre failures once you are in a safe stopping place and dispatch is confirmed.',
  },
] as const;

export function EmergencyServiceCards() {
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
          Fast help for tyre emergencies
        </Text>
        <Text
          fontSize={{ base: '15px', md: '17px' }}
          color={colorTokens.muted}
          lineHeight="1.7"
          maxW="680px"
          mb={{ base: '24px', md: '34px' }}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Whether you searched for emergency tyre fitting, flat tyre help, puncture repair, a mobile tyre fitter near you, or 24/7 roadside tyre support, the next step is simple: call now or book online.
        </Text>
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="14px">
          {serviceCards.map((item) => (
            <Box
              key={item.title}
              bg={colorTokens.surface}
              borderWidth="1px"
              borderColor={colorTokens.border}
              borderRadius="8px"
              p={{ base: '20px', md: '24px' }}
              minH="190px"
            >
              <Text
                as="h3"
                fontSize={{ base: '22px', md: '28px' }}
                color={colorTokens.text}
                lineHeight="1.05"
                mb="12px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {item.title}
              </Text>
              <Text fontSize="15px" color={colorTokens.muted} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                {item.copy}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
