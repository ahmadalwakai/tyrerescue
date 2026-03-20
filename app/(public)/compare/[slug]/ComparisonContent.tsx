'use client';

import {
  Box,
  Container,
  Text,
  Flex,
  SimpleGrid,
  Table,
  Badge,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { AIOptimizedSection } from '@/components/seo/AIOptimizedSection';
import { colorTokens } from '@/lib/design-tokens';
import type { CompetitorComparison } from '@/lib/data/competitors';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function ComparisonContent({ data }: { data: CompetitorComparison }) {
  const tyreRescueWins = data.features.filter((f) => f.winner === 'tyrerescue').length;
  const competitorWins = data.features.filter((f) => f.winner === 'competitor').length;
  const ties = data.features.filter((f) => f.winner === 'tie').length;

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
            <ChakraLink asChild _hover={{ color: colors.textPrimary }}>
              <Link href="/compare">Compare</Link>
            </ChakraLink>
            <Text>→</Text>
            <Text color={colors.accent}>vs {data.competitorShortName}</Text>
          </Flex>

          {/* Hero */}
          <Box mb={{ base: '40px', md: '60px' }}>
            <Text
              as="h1"
              fontSize={{ base: '28px', md: '42px' }}
              fontWeight="700"
              color={colors.textPrimary}
              lineHeight="1.15"
              mb={4}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {data.title}
            </Text>
            <Text
              fontSize={{ base: '16px', md: '18px' }}
              color={colors.textSecondary}
              lineHeight="1.7"
              maxW="700px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {data.description}
            </Text>
          </Box>

          {/* Score cards */}
          <SimpleGrid columns={{ base: 3 }} gap={4} mb={{ base: '40px', md: '60px' }}>
            <Box bg={colors.card} p={{ base: 4, md: 6 }} borderRadius="12px" borderWidth="1px" borderColor={colors.accent} textAlign="center">
              <Text fontSize={{ base: '28px', md: '40px' }} fontWeight="700" color={colors.accent} style={{ fontFamily: 'var(--font-display)' }}>
                {tyreRescueWins}
              </Text>
              <Text fontSize={{ base: '12px', md: '14px' }} color={colors.textSecondary} fontWeight="500">Tyre Rescue Wins</Text>
            </Box>
            <Box bg={colors.card} p={{ base: 4, md: 6 }} borderRadius="12px" borderWidth="1px" borderColor={colors.border} textAlign="center">
              <Text fontSize={{ base: '28px', md: '40px' }} fontWeight="700" color={colors.textSecondary} style={{ fontFamily: 'var(--font-display)' }}>
                {ties}
              </Text>
              <Text fontSize={{ base: '12px', md: '14px' }} color={colors.textSecondary} fontWeight="500">Tied</Text>
            </Box>
            <Box bg={colors.card} p={{ base: 4, md: 6 }} borderRadius="12px" borderWidth="1px" borderColor={colors.border} textAlign="center">
              <Text fontSize={{ base: '28px', md: '40px' }} fontWeight="700" color={colors.textSecondary} style={{ fontFamily: 'var(--font-display)' }}>
                {competitorWins}
              </Text>
              <Text fontSize={{ base: '12px', md: '14px' }} color={colors.textSecondary} fontWeight="500">{data.competitorShortName} Wins</Text>
            </Box>
          </SimpleGrid>

          {/* Comparison Table */}
          <Box
            bg={colors.card}
            borderRadius="12px"
            borderWidth="1px"
            borderColor={colors.border}
            overflow="hidden"
            mb={{ base: '40px', md: '60px' }}
          >
            <Box p={{ base: 4, md: 6 }} borderBottomWidth="1px" borderColor={colors.border}>
              <Text as="h2" fontSize={{ base: '20px', md: '26px' }} fontWeight="700" color={colors.textPrimary} style={{ fontFamily: 'var(--font-body)' }}>
                Feature-by-Feature Comparison
              </Text>
            </Box>
            <Box overflowX="auto">
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row bg={colors.surface}>
                    <Table.ColumnHeader color={colors.textSecondary} px={4} py={3} minW="150px">Feature</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.accent} px={4} py={3} minW="200px">Tyre Rescue</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.textSecondary} px={4} py={3} minW="200px">{data.competitorShortName}</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.textSecondary} px={4} py={3} w="80px">Winner</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.features.map((f) => (
                    <Table.Row key={f.feature} _hover={{ bg: colors.surface }}>
                      <Table.Cell px={4} py={3} fontWeight="600" color={colors.textPrimary} fontSize="sm">{f.feature}</Table.Cell>
                      <Table.Cell px={4} py={3} color={colors.textPrimary} fontSize="sm">{f.tyreRescue}</Table.Cell>
                      <Table.Cell px={4} py={3} color={colors.textSecondary} fontSize="sm">{f.competitor}</Table.Cell>
                      <Table.Cell px={4} py={3}>
                        {f.winner === 'tyrerescue' && (
                          <Badge bg="rgba(249,115,22,0.15)" color={colors.accent} px={2} py={0.5} borderRadius="full" fontSize="xs">
                            TR
                          </Badge>
                        )}
                        {f.winner === 'competitor' && (
                          <Badge bg={colors.surface} color={colors.textSecondary} px={2} py={0.5} borderRadius="full" fontSize="xs">
                            {data.competitorShortName.slice(0, 2).toUpperCase()}
                          </Badge>
                        )}
                        {f.winner === 'tie' && (
                          <Badge bg={colors.surface} color={colors.textSecondary} px={2} py={0.5} borderRadius="full" fontSize="xs">
                            Tie
                          </Badge>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Box>

          {/* AI Optimized section with first FAQ */}
          <AIOptimizedSection
            question={data.faq[0].question}
            directAnswer={data.faq[0].answer}
            detailedAnswer={
              <Box>
                <Text
                  fontSize={{ base: '15px', md: '16px' }}
                  color={colors.textSecondary}
                  lineHeight="1.8"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {data.summary}
                </Text>
              </Box>
            }
            relatedQuestions={data.faq.slice(1).map((f) => f.question)}
            entityType="service"
          />

          {/* Remaining FAQ */}
          {data.faq.length > 1 && (
            <Box mb={{ base: '40px', md: '60px' }}>
              <Text
                as="h2"
                fontSize={{ base: '20px', md: '26px' }}
                fontWeight="700"
                color={colors.textPrimary}
                mb={6}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Frequently Asked Questions
              </Text>
              <Flex direction="column" gap={4}>
                {data.faq.slice(1).map((item, i) => (
                  <Box
                    key={i}
                    bg={colors.card}
                    borderRadius="12px"
                    borderWidth="1px"
                    borderColor={colors.border}
                    p={{ base: 5, md: 6 }}
                    itemScope
                    itemType="https://schema.org/Question"
                  >
                    <Text
                      as="h3"
                      fontWeight="600"
                      color={colors.textPrimary}
                      fontSize={{ base: '16px', md: '18px' }}
                      mb={3}
                      itemProp="name"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {item.question}
                    </Text>
                    <Box itemScope itemType="https://schema.org/Answer" itemProp="acceptedAnswer">
                      <Text
                        color={colors.textSecondary}
                        fontSize="15px"
                        lineHeight="1.7"
                        itemProp="text"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {item.answer}
                      </Text>
                    </Box>
                  </Box>
                ))}
              </Flex>
            </Box>
          )}

          {/* CTA */}
          <Box
            bg={colors.card}
            borderRadius="12px"
            borderWidth="2px"
            borderColor={colors.accent}
            p={{ base: 6, md: 8 }}
            textAlign="center"
            mb={{ base: '40px', md: '60px' }}
          >
            <Text
              as="h2"
              fontSize={{ base: '22px', md: '30px' }}
              fontWeight="700"
              color={colors.textPrimary}
              mb={3}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Ready to try Tyre Rescue?
            </Text>
            <Text
              color={colors.textSecondary}
              fontSize="16px"
              lineHeight="1.7"
              mb={6}
              maxW="500px"
              mx="auto"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              24/7 emergency mobile tyre fitting across Scotland. We come to you — home, work, or roadside.
            </Text>
            <Flex gap={4} justify="center" wrap="wrap">
              <ChakraLink
                asChild
                bg={colors.accent}
                color="white"
                px={8}
                py={3}
                borderRadius="8px"
                fontWeight="600"
                fontSize="15px"
                _hover={{ opacity: 0.9 }}
                transition="opacity 0.2s"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Link href="/book">Book Online Now</Link>
              </ChakraLink>
              <ChakraLink
                href="tel:01412660690"
                bg="transparent"
                color={colors.accent}
                px={8}
                py={3}
                borderRadius="8px"
                borderWidth="1px"
                borderColor={colors.accent}
                fontWeight="600"
                fontSize="15px"
                _hover={{ bg: 'rgba(249,115,22,0.1)' }}
                transition="all 0.2s"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Call 0141 266 0690
              </ChakraLink>
            </Flex>
          </Box>
        </Container>
      </Box>

      <Footer />
    </Box>
  );
}
