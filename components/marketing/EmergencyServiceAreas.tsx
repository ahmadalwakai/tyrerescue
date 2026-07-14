'use client';

import { SimpleGrid, Box, Text, Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

export type ServiceArea = {
  name: string;
  href?: string;
};

export function EmergencyServiceAreas({ areas }: { areas: readonly ServiceArea[] }) {
  return (
    <SimpleGrid columns={{ base: 2, sm: 3, md: 5 }} gap="10px">
      {areas.map((area, i) => {
        const card = (
          <Box
            bg={colorTokens.card}
            border="1px solid"
            borderColor={colorTokens.border}
            borderRadius="8px"
            px={{ base: '12px', md: '16px' }}
            py="14px"
            textAlign="center"
            transition="all 0.2s cubic-bezier(0.4,0,0.2,1)"
            _hover={area.href ? { borderColor: colorTokens.accent } : undefined}
            style={anim.stagger('fadeUp', i, '0.3s', 0, 0.06)}
          >
            <Text
              fontSize="14px"
              fontWeight="600"
              color={colorTokens.text}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {area.name}
            </Text>
          </Box>
        );

        if (area.href) {
          return (
            <ChakraLink
              key={area.name}
              href={area.href}
              _hover={{ textDecoration: 'none' }}
              display="block"
            >
              {card}
            </ChakraLink>
          );
        }

        return <Box key={area.name}>{card}</Box>;
      })}
    </SimpleGrid>
  );
}
