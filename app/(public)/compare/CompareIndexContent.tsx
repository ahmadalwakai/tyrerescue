'use client';

import {
  Box,
  Container,
  Text,
  Flex,
  SimpleGrid,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { competitors } from '@/lib/data/competitors';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function CompareIndexContent() {
  return (
    <Box bg={colors.bg} minH="100vh">
      <Nav />

      <Box as="main" pt={{ base: '100px', md: '120px' }} pb="80px">
        <Container maxW="7xl">
          {/* Breadcrumb */}
          <Flex gap={2} mb={6} fontSize="13px" color={colors.textSecondary}>
            <ChakraLink asChild _hover={{ color: colors.textPrimary }}>
              <Link href="/">Home</Link>
            </ChakraLink>
            <Text>→</Text>
            <Text color={colors.accent}>Compare</Text>
          </Flex>

          {/* Hero */}
          <Box mb={{ base: '40px', md: '60px' }} maxW="700px">
            <Text
              as="h1"
              fontSize={{ base: '28px', md: '42px' }}
              fontWeight="700"
              color={colors.textPrimary}
              lineHeight="1.15"
              mb={4}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              How Does Tyre Rescue Compare?
            </Text>
            <Text
              fontSize={{ base: '16px', md: '18px' }}
              color={colors.textSecondary}
              lineHeight="1.7"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              We believe in transparency. See how our 24/7 mobile tyre fitting service stacks up against the biggest names in the tyre industry. Real comparisons, no spin.
            </Text>
          </Box>

          {/* Competitor Cards */}
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={6} mb={{ base: '40px', md: '60px' }}>
            {competitors.map((comp) => {
              const wins = comp.features.filter((f) => f.winner === 'tyrerescue').length;
              return (
                <ChakraLink
                  key={comp.slug}
                  asChild
                  _hover={{ textDecoration: 'none' }}
                >
                  <Link href={`/compare/${comp.slug}`}>
                    <Box
                      bg={colors.card}
                      borderRadius="12px"
                      borderWidth="1px"
                      borderColor={colors.border}
                      p={{ base: 5, md: 7 }}
                      transition="all 0.2s"
                      _hover={{ borderColor: colors.accent, transform: 'translateY(-2px)' }}
                      cursor="pointer"
                      h="100%"
                    >
                      <Flex justify="space-between" align="flex-start" mb={4}>
                        <Box>
                          <Text
                            fontSize="11px"
                            fontWeight="500"
                            color={colors.accent}
                            textTransform="uppercase"
                            letterSpacing="0.1em"
                            mb={2}
                            style={{ fontFamily: 'var(--font-body)' }}
                          >
                            Tyre Rescue vs
                          </Text>
                          <Text
                            as="h2"
                            fontSize={{ base: '20px', md: '24px' }}
                            fontWeight="700"
                            color={colors.textPrimary}
                            style={{ fontFamily: 'var(--font-body)' }}
                          >
                            {comp.competitorShortName}
                          </Text>
                        </Box>
                        <Box
                          bg="rgba(249,115,22,0.15)"
                          px={3}
                          py={1}
                          borderRadius="full"
                        >
                          <Text color={colors.accent} fontSize="13px" fontWeight="600">
                            {wins}/{comp.features.length} wins
                          </Text>
                        </Box>
                      </Flex>
                      <Text
                        color={colors.textSecondary}
                        fontSize="14px"
                        lineHeight="1.7"
                        mb={4}
                        lineClamp={3}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {comp.description}
                      </Text>
                      <Text
                        color={colors.accent}
                        fontSize="14px"
                        fontWeight="600"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        View Full Comparison →
                      </Text>
                    </Box>
                  </Link>
                </ChakraLink>
              );
            })}
          </SimpleGrid>

          {/* Why Choose Us Summary */}
          <Box
            bg={colors.card}
            borderRadius="12px"
            borderWidth="2px"
            borderColor={colors.accent}
            p={{ base: 6, md: 8 }}
            textAlign="center"
          >
            <Text
              as="h2"
              fontSize={{ base: '22px', md: '30px' }}
              fontWeight="700"
              color={colors.textPrimary}
              mb={3}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Why Choose Tyre Rescue?
            </Text>
            <Text
              color={colors.textSecondary}
              fontSize="16px"
              lineHeight="1.7"
              mb={6}
              maxW="600px"
              mx="auto"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              24/7 emergency mobile tyre fitting across Glasgow, Edinburgh, and Central Scotland. We come to you — no garage visit needed.
            </Text>
            <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} maxW="700px" mx="auto">
              {[
                { stat: '45 min', label: 'Avg Response' },
                { stat: '24/7', label: 'Emergency Service' },
                { stat: '4.8★', label: 'Trustpilot' },
                { stat: 'From £49', label: 'Starting Price' },
              ].map((item) => (
                <Box key={item.label}>
                  <Text fontSize={{ base: '22px', md: '28px' }} fontWeight="700" color={colors.accent} style={{ fontFamily: 'var(--font-display)' }}>
                    {item.stat}
                  </Text>
                  <Text fontSize="12px" color={colors.textSecondary} fontWeight="500">
                    {item.label}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        </Container>
      </Box>

      <Footer />
    </Box>
  );
}
