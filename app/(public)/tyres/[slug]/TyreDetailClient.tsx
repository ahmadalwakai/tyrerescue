'use client';

import NextLink from 'next/link';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Heading,
  Grid,
  GridItem,
  Button,
  Table,
  Flex,
  Separator,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface TyreData {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  seasonLabel: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  noiseDb: number | null;
  runFlat: boolean;
  priceNew: number | null;
  stockNew: number;
  availableNew: boolean;
  slug: string;
  isOrderOnly: boolean;
  leadTimeLabel: string | null;
}

interface RelatedTyre {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  priceNew: number | null;
  availableNew: boolean;
  slug: string;
}

interface Props {
  tyre: TyreData;
  relatedTyres: RelatedTyre[];
}

function StockBadge({ stock, isOrderOnly, leadTimeLabel }: { stock: number; isOrderOnly: boolean; leadTimeLabel: string | null }) {
  if (isOrderOnly) {
    return (
      <Box>
        <Text color={c.accent} fontWeight="semibold">Order Only</Text>
        <Text fontSize="sm" color={c.muted}>{leadTimeLabel || '2\u20133 working days'}</Text>
      </Box>
    );
  }
  if (stock === 0) {
    return <Text color="red.400">Out of Stock</Text>;
  }
  if (stock <= 4) {
    return <Text color={c.accent} fontWeight="semibold">Low Stock ({stock} left)</Text>;
  }
  return <Text color="green.400" fontWeight="semibold">In Stock</Text>;
}

function formatPrice(price: number | null): string {
  if (price === null) return 'N/A';
  return `£${price.toFixed(2)}`;
}

export function TyreDetailClient({ tyre, relatedTyres }: Props) {
  return (
    <Box bg={c.bg} minH="100vh" py={8}>
      <Container maxW="1000px">
        <VStack align="stretch" gap={6}>
          {/* Breadcrumb */}
          <HStack fontSize="sm" color={c.muted}>
            <ChakraLink asChild color={c.accent}>
              <NextLink href="/tyres">Tyres</NextLink>
            </ChakraLink>
            <Text>/</Text>
            <Text>{tyre.brand}</Text>
            <Text>/</Text>
            <Text>{tyre.pattern}</Text>
          </HStack>

          {/* Main Info */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s')}>
            <Grid templateColumns={{ base: '1fr', md: '2fr 1fr' }} gap={6}>
              <GridItem>
                <VStack align="start" gap={4}>
                  <Box>
                    <Text color={c.muted} fontSize="sm" textTransform="uppercase">
                      {tyre.brand}
                    </Text>
                    <Heading size="xl" color={c.text}>{tyre.pattern}</Heading>
                    <Text fontSize="lg" color={c.muted} mt={1}>
                      {tyre.sizeDisplay}
                    </Text>
                  </Box>

                  <HStack gap={4} flexWrap="wrap">
                    <Box>
                      <Text fontSize="sm" color="gray.500">
                        Season
                      </Text>
                      <Text fontWeight="semibold">{tyre.seasonLabel}</Text>
                    </Box>
                    {tyre.speedRating && (
                      <Box>
                        <Text fontSize="sm" color={c.muted}>
                          Speed Rating
                        </Text>
                        <Text fontWeight="semibold">{tyre.speedRating}</Text>
                      </Box>
                    )}
                    {tyre.loadIndex && (
                      <Box>
                        <Text fontSize="sm" color={c.muted}>
                          Load Index
                        </Text>
                        <Text fontWeight="semibold">{tyre.loadIndex}</Text>
                      </Box>
                    )}
                    {tyre.runFlat && (
                      <Box>
                        <Text fontWeight="bold" color={c.accent}>
                          Run Flat
                        </Text>
                      </Box>
                    )}
                  </HStack>
                </VStack>
              </GridItem>

              <GridItem>
                <VStack align="stretch" gap={4}>
                  {/* New Tyre Option */}
                  {tyre.availableNew && tyre.priceNew !== null && (
                    <Box
                      p={4}
                      borderWidth="1px"
                      borderRadius="md"
                      borderColor={c.border}
                    >
                      <Flex justify="space-between" align="start" mb={2}>
                        <Text fontWeight="semibold" color={c.text}>Price</Text>
                        <Text fontSize="xl" fontWeight="bold" color={c.text}>
                          {formatPrice(tyre.priceNew)}
                        </Text>
                      </Flex>
                      <StockBadge stock={tyre.stockNew} isOrderOnly={tyre.isOrderOnly} leadTimeLabel={tyre.leadTimeLabel} />
                      <Button
                        asChild
                        colorPalette="orange"
                        width="full"
                        mt={3}
                        disabled={tyre.stockNew === 0 && !tyre.isOrderOnly}
                      >
                        <NextLink href={tyre.isOrderOnly ? `/book?tyreId=${tyre.id}` : `/emergency?tyreId=${tyre.id}`}>
                          {tyre.isOrderOnly ? 'Order This Tyre' : 'Book This Tyre'}
                        </NextLink>
                      </Button>
                    </Box>
                  )}
                </VStack>
              </GridItem>
            </Grid>
          </Box>

          {/* Specifications Table */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.6s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>
              Specifications
            </Heading>
            <Table.Root>
              <Table.Body>
                <Table.Row>
                  <Table.Cell fontWeight="semibold" width="200px">
                    Brand
                  </Table.Cell>
                  <Table.Cell>{tyre.brand}</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell fontWeight="semibold">Pattern</Table.Cell>
                  <Table.Cell>{tyre.pattern}</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell fontWeight="semibold">Size</Table.Cell>
                  <Table.Cell>{tyre.sizeDisplay}</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell fontWeight="semibold">Season</Table.Cell>
                  <Table.Cell>{tyre.seasonLabel}</Table.Cell>
                </Table.Row>
                {tyre.speedRating && (
                  <Table.Row>
                    <Table.Cell fontWeight="semibold">Speed Rating</Table.Cell>
                    <Table.Cell>{tyre.speedRating}</Table.Cell>
                  </Table.Row>
                )}
                {tyre.loadIndex && (
                  <Table.Row>
                    <Table.Cell fontWeight="semibold">Load Index</Table.Cell>
                    <Table.Cell>{tyre.loadIndex}</Table.Cell>
                  </Table.Row>
                )}
                {tyre.wetGrip && (
                  <Table.Row>
                    <Table.Cell fontWeight="semibold">Wet Grip</Table.Cell>
                    <Table.Cell>{tyre.wetGrip}</Table.Cell>
                  </Table.Row>
                )}
                {tyre.fuelEfficiency && (
                  <Table.Row>
                    <Table.Cell fontWeight="semibold">Fuel Efficiency</Table.Cell>
                    <Table.Cell>{tyre.fuelEfficiency}</Table.Cell>
                  </Table.Row>
                )}
                {tyre.noiseDb && (
                  <Table.Row>
                    <Table.Cell fontWeight="semibold">Noise Level</Table.Cell>
                    <Table.Cell>{tyre.noiseDb} dB</Table.Cell>
                  </Table.Row>
                )}
                <Table.Row>
                  <Table.Cell fontWeight="semibold">Run Flat</Table.Cell>
                  <Table.Cell>{tyre.runFlat ? 'Yes' : 'No'}</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>

          {/* EU Tyre Label Info */}
          {(tyre.wetGrip || tyre.fuelEfficiency || tyre.noiseDb) && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.2s')}>
              <Heading size="md" mb={4} color={c.text}>
                EU Tyre Label
              </Heading>
              <Grid templateColumns={{ base: '1fr', sm: 'repeat(3, 1fr)' }} gap={6}>
                {tyre.fuelEfficiency && (
                  <Box textAlign="center" p={4} borderWidth="1px" borderRadius="md" borderColor={c.border}>
                    <Text fontWeight="bold" fontSize="2xl" color={c.text}>
                      {tyre.fuelEfficiency}
                    </Text>
                    <Text fontSize="sm" color={c.muted}>
                      Fuel Efficiency
                    </Text>
                    <Text fontSize="xs" color={c.muted} mt={1}>
                      A (best) to G (worst)
                    </Text>
                  </Box>
                )}
                {tyre.wetGrip && (
                  <Box textAlign="center" p={4} borderWidth="1px" borderRadius="md" borderColor={c.border}>
                    <Text fontWeight="bold" fontSize="2xl" color={c.text}>
                      {tyre.wetGrip}
                    </Text>
                    <Text fontSize="sm" color={c.muted}>
                      Wet Grip
                    </Text>
                    <Text fontSize="xs" color={c.muted} mt={1}>
                      A (best) to G (worst)
                    </Text>
                  </Box>
                )}
                {tyre.noiseDb && (
                  <Box textAlign="center" p={4} borderWidth="1px" borderRadius="md" borderColor={c.border}>
                    <Text fontWeight="bold" fontSize="2xl" color={c.text}>
                      {tyre.noiseDb}
                    </Text>
                    <Text fontSize="sm" color={c.muted}>
                      Noise (dB)
                    </Text>
                    <Text fontSize="xs" color={c.muted} mt={1}>
                      External rolling noise
                    </Text>
                  </Box>
                )}
              </Grid>
            </Box>
          )}

          {/* Related Tyres */}
          {relatedTyres.length > 0 && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.3s')}>
              <Heading size="md" mb={4} color={c.text}>
                Related Tyres
              </Heading>
              <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }} gap={4}>
                {relatedTyres.map((related) => {
                  const seasonLabel =
                    related.season === 'summer'
                      ? 'Summer'
                      : related.season === 'winter'
                      ? 'Winter'
                      : 'All Season';
                  const lowestPrice = related.priceNew;

                  return (
                    <ChakraLink
                      key={related.id}
                      asChild
                      _hover={{ textDecoration: 'none' }}
                    >
                      <NextLink href={`/tyres/${related.slug}`}>
                        <Box
                          p={4}
                          borderWidth="1px"
                          borderRadius="md"
                          _hover={{ borderColor: c.accent }}
                          transition="all 0.2s"
                        >
                          <Text fontSize="xs" color={c.muted} textTransform="uppercase">
                            {related.brand}
                          </Text>
                          <Text fontWeight="semibold" truncate>
                            {related.pattern}
                          </Text>
                          <Text fontSize="sm" color={c.muted}>
                            {related.sizeDisplay}
                          </Text>
                          <Flex justify="space-between" align="center" mt={2}>
                            <Text fontSize="xs" color={c.muted}>
                              {seasonLabel}
                            </Text>
                            {lowestPrice && (
                              <Text fontWeight="semibold">
                                From {formatPrice(lowestPrice)}
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      </NextLink>
                    </ChakraLink>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Call to Action */}
          <Box bg={c.surface} p={6} borderRadius="md" textAlign="center" style={anim.fadeUp('0.5s', '0.4s')}>
            <Heading size="md" mb={2} color={c.text}>
              Need Help Choosing?
            </Heading>
            <Text color={c.muted} mb={4}>
              Our experts are available 24/7 to help you find the right tyre.
            </Text>
            <HStack justify="center" gap={4}>
              <Button asChild colorPalette="orange" size="lg">
                <a href="tel:01412660690">Call 0141 266 0690</a>
              </Button>
              <Button asChild variant="outline" colorPalette="orange" size="lg">
                <NextLink href="/emergency">Book Emergency Callout</NextLink>
              </Button>
            </HStack>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
}
