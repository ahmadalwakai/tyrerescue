'use client';

import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function ContactContent() {
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
            Contact Us
          </Heading>
          <Text fontSize="18px" color={colors.textSecondary} mb={12} maxW="600px" style={anim.fadeUp('0.5s', '0.1s')}>
            Get in touch with our team. We are available 8am to midnight, every day.
          </Text>

          <Flex direction={{ base: 'column', md: 'row' }} gap={8}>
            <Box
              bg={colors.card}
              p={8}
              borderRadius="12px"
              borderWidth="1px"
              borderColor={colors.border}
              flex={1}
              style={anim.fadeUp('0.5s', '0.15s')}
            >
              <Text fontSize="11px" fontWeight="500" color={colors.textSecondary} textTransform="uppercase" letterSpacing="0.15em" mb={4}>
                PHONE
              </Text>
              <ChakraLink
                href="tel:01412660690"
                fontSize="24px"
                fontWeight="700"
                color={colors.accent}
                _hover={{ opacity: 0.8 }}
              >
                0141 266 0690
              </ChakraLink>
            </Box>

            <Box
              bg={colors.card}
              p={8}
              borderRadius="12px"
              borderWidth="1px"
              borderColor={colors.border}
              flex={1}
              style={anim.fadeUp('0.5s', '0.25s')}
            >
              <Text fontSize="11px" fontWeight="500" color={colors.textSecondary} textTransform="uppercase" letterSpacing="0.15em" mb={4}>
                ADDRESS
              </Text>
              <Text fontSize="16px" color={colors.textPrimary} mb={1}>3, 10 Gateside St</Text>
              <Text fontSize="16px" color={colors.textPrimary}>Glasgow G31 1PD</Text>
            </Box>

            <Box
              bg={colors.card}
              p={8}
              borderRadius="12px"
              borderWidth="1px"
              borderColor={colors.border}
              flex={1}
              style={anim.fadeUp('0.5s', '0.35s')}
            >
              <Text fontSize="11px" fontWeight="500" color={colors.textSecondary} textTransform="uppercase" letterSpacing="0.15em" mb={4}>
                HOURS
              </Text>
              <Text fontSize="16px" color={colors.textPrimary}>8am to Midnight</Text>
              <Text fontSize="16px" color={colors.textSecondary}>Every Day</Text>
            </Box>
          </Flex>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
