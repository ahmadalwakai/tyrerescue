'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Heading,
  Input,
  Grid,
  Flex,
  Button,
  NativeSelect,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { TyreCard } from '@/components/tyres/TyreCard';
import { colorTokens as c, inputProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

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
  tier?: string;
  isOrderOnly?: boolean;
  leadTimeLabel?: string | null;
}

interface TyresResponse {
  tyres: Tyre[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  filters: {
    brands: string[];
  };
}

const COMMON_WIDTHS = ['155', '165', '175', '185', '195', '205', '215', '225', '235', '245', '255', '265', '275', '285', '295', '305', '315'];
const COMMON_ASPECTS = ['30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80'];
const COMMON_RIMS = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];

export function TyresContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search state
  const [width, setWidth] = useState(searchParams.get('width') || '');
  const [aspect, setAspect] = useState(searchParams.get('aspect') || '');
  const [rim, setRim] = useState(searchParams.get('rim') || '');

  // Filter state
  const [brand, setBrand] = useState(searchParams.get('brand') || 'all');
  const [season, setSeason] = useState(searchParams.get('season') || 'all');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');

  // Results state
  const [tyres, setTyres] = useState<Tyre[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    totalCount: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const sizeDisplay = width && aspect && rim ? `${width}/${aspect}R${rim}` : '';

  const fetchTyres = useCallback(async (page: number = 1) => {
    setIsLoading(true);
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      if (width) params.set('width', width);
      if (aspect) params.set('aspect', aspect);
      if (rim) params.set('rim', rim);
      if (brand !== 'all') params.set('brand', brand);
      if (season !== 'all') params.set('season', season);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      params.set('page', page.toString());
      params.set('limit', '12');

      const res = await fetch(`/api/tyres?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tyres');

      const data: TyresResponse = await res.json();
      setTyres(data.tyres);
      setBrands(data.filters.brands);
      setPagination(data.pagination);

      // Update URL
      router.push(`/tyres?${params.toString()}`, { scroll: false });
    } catch (error) {
      console.error('Error fetching tyres:', error);
      setTyres([]);
    } finally {
      setIsLoading(false);
    }
  }, [width, aspect, rim, brand, season, minPrice, maxPrice, router]);

  // Load initial results if URL has params
  useEffect(() => {
    if (searchParams.get('width') || searchParams.get('brand')) {
      fetchTyres(parseInt(searchParams.get('page') || '1', 10));
    }
  }, []);

  function handleSearch() {
    fetchTyres(1);
  }

  function handleClearFilters() {
    setWidth('');
    setAspect('');
    setRim('');
    setBrand('all');
    setSeason('all');
    setMinPrice('');
    setMaxPrice('');
    setTyres([]);
    setHasSearched(false);
    router.push('/tyres');
  }

  function goToPage(page: number) {
    fetchTyres(page);
  }

  const availableTyres = tyres.filter((t) => t.availableNew && t.priceNew !== null);

  return (
    <Box bg={c.bg} minH="100vh" py={8}>
      <Container maxW="1200px">
        <VStack align="stretch" gap={6}>
          {/* Header */}
          <Box>
            <Heading size="xl" mb={2} color={c.text}>
              Tyre Catalogue
            </Heading>
            <Text color={c.muted}>
              Find the perfect tyres for your vehicle. Search by size and filter by brand, season, and more.
            </Text>
          </Box>

          {/* Search Bar */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s')}>
            <Text fontWeight="semibold" mb={4} color={c.text}>
              Search by Tyre Size
            </Text>
            <Flex gap={4} wrap="wrap" align="end">
              <Box flex="1" minW="100px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Width
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={width}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWidth(e.target.value)}
                  >
                    <option value="">Select</option>
                    {COMMON_WIDTHS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
              <Box flex="1" minW="100px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Aspect
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={aspect}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAspect(e.target.value)}
                  >
                    <option value="">Select</option>
                    {COMMON_ASPECTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
              <Box flex="1" minW="100px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Rim
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={rim}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRim(e.target.value)}
                  >
                    <option value="">Select</option>
                    {COMMON_RIMS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
              <Box>
                {sizeDisplay && (
                  <Text fontWeight="bold" fontSize="lg" mb={2}>
                    {sizeDisplay}
                  </Text>
                )}
                <Button colorPalette="orange" onClick={handleSearch} disabled={isLoading}>
                  {isLoading ? 'Searching...' : 'Search Tyres'}
                </Button>
              </Box>
            </Flex>
          </Box>

          {/* Filters Bar */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.1s')}>
            <Flex gap={4} wrap="wrap" align="end">
              <Box minW="150px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Brand
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={brand}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBrand(e.target.value)}
                  >
                    <option value="all">All Brands</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
              <Box minW="150px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Season
                </Text>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={season}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSeason(e.target.value)}
                  >
                    <option value="all">All Seasons</option>
                    <option value="summer">Summer</option>
                    <option value="winter">Winter</option>
                    <option value="allseason">All Season</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>
              <Box minW="100px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Min Price
                </Text>
                <Input
                  type="number"
                  value={minPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinPrice(e.target.value)}
                  placeholder="£0"
                />
              </Box>
              <Box minW="100px">
                <Text fontSize="sm" color={c.muted} mb={1}>
                  Max Price
                </Text>
                <Input
                  type="number"
                  value={maxPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxPrice(e.target.value)}
                  placeholder="£500"
                />
              </Box>
              <HStack>
                <Button variant="outline" onClick={handleSearch} disabled={isLoading}>
                  Apply Filters
                </Button>
                <Button variant="ghost" onClick={handleClearFilters}>
                  Clear
                </Button>
              </HStack>
            </Flex>
          </Box>

          {/* Results */}
          {isLoading ? (
            <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
              <Text color={c.text}>Loading tyres...</Text>
            </Box>
          ) : hasSearched && tyres.length === 0 ? (
            <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
              <VStack gap={4}>
                <Heading size="md" color={c.text}>No tyres found</Heading>
                <Text color={c.muted}>
                  We could not find any tyres matching your criteria.
                  Try adjusting your filters or contact us for assistance.
                </Text>
                <Text fontWeight="semibold" color={c.text}>
                  Call us:{' '}
                  <ChakraLink href="tel:01412660690" color={c.accent}>
                    0141 266 0690
                  </ChakraLink>
                </Text>
              </VStack>
            </Box>
          ) : hasSearched ? (
            <Box>
              <Heading size="md" mb={4} color={c.text}>
                Tyres ({availableTyres.length})
              </Heading>
              {availableTyres.length === 0 ? (
                <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
                  <Text color={c.muted}>No tyres available</Text>
                </Box>
              ) : (
                <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }} gap={4}>
                  {availableTyres.map((tyre, i) => (
                    <Box key={tyre.id} style={anim.stagger('fadeUp', i, '0.4s', 0.1, 0.05)}>
                      <TyreCard tyre={tyre} />
                    </Box>
                  ))}
                </Grid>
              )}
            </Box>
          ) : (
            <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
              <VStack gap={4}>
                <Heading size="md" color={c.text}>Search for Tyres</Heading>
                <Text color={c.muted}>
                  Enter your tyre size above to browse our catalogue.
                  You can find your tyre size on the sidewall of your current tyres.
                </Text>
              </VStack>
            </Box>
          )}

          {/* Pagination */}
          {hasSearched && pagination.totalPages > 1 && (
            <Flex justify="space-between" align="center" bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Text fontSize="sm" color={c.muted}>
                Showing {tyres.length} of {pagination.totalCount} tyres (Page {pagination.page} of {pagination.totalPages})
              </Text>
              <HStack>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Next
                </Button>
              </HStack>
            </Flex>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
