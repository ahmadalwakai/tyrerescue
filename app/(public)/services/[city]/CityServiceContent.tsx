'use client';

import {
  Box,
  Container,
  Heading,
  Text,
  Link as ChakraLink,
  Flex,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const colors = {
  bg: colorTokens.bg,
  accent: colorTokens.accent,
  accentHover: colorTokens.accentHover,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function CityServiceContent({ cityName }: { cityName: string }) {
  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <Nav />
      <Box as="main" flex={1} py={{ base: 16, md: 24 }}>
        <Container maxW="4xl">
          <Heading
            as="h1"
            fontSize={{ base: '32px', md: '48px' }}
            fontWeight="900"
            color={colors.textPrimary}
            letterSpacing="-0.03em"
            mb={4}
            style={anim.fadeUp('0.5s')}
          >
            Mobile Tyre Fitting in {cityName}
          </Heading>
          <Text fontSize="18px" color={colors.textSecondary} mb={8} maxW="600px" style={anim.fadeUp('0.5s', '0.1s')}>
            Emergency and scheduled tyre fitting available across {cityName} and surrounding areas. Our certified fitters come to your exact location.
          </Text>
          <Flex gap={4} direction={{ base: 'column', sm: 'row' }} style={anim.fadeUp('0.5s', '0.2s')}>
            <ChakraLink
              asChild
              px={8}
              py={4}
              bg={colors.accent}
              color={colors.bg}
              fontSize="16px"
              fontWeight="600"
              borderRadius="8px"
              textAlign="center"
              _hover={{ bg: colors.accentHover }}
            >
              <Link href="/emergency">Emergency Callout</Link>
            </ChakraLink>
            <ChakraLink
              asChild
              px={8}
              py={4}
              bg="transparent"
              color={colors.textPrimary}
              fontSize="16px"
              fontWeight="600"
              borderRadius="8px"
              borderWidth="1px"
              borderColor={colors.border}
              textAlign="center"
              _hover={{ borderColor: colors.textSecondary }}
            >
              <Link href="/book">Book Online</Link>
            </ChakraLink>
          </Flex>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
