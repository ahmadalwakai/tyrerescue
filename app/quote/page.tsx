'use client';

/**
 * /quote — landing page for the instant-quote flow:
 *   1. user enters reg → /api/vehicle/lookup
 *   2. we suggest the OEM tyre size
 *   3. user picks service + quantity → /api/quote/calculate
 *   4. CTA forwards into /book with everything pre-filled
 *
 * Manual fallback always available for users who don't have / don't know
 * their reg or whose vehicle isn't in our dataset.
 *
 * VRM lookup is gated by `NEXT_PUBLIC_VRM_ENABLED`. When off, the page
 * still renders the manual tyre-size quote flow so customers can get a
 * price without waiting for DVLA trade access.
 */

import { useCallback, useState } from 'react';
import { Box, Container, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { VrmLookup } from '@/components/quote/VrmLookup';
import { InstantQuote } from '@/components/quote/InstantQuote';
import { ManualSizeInput, ManualSizeToggle } from '@/components/quote/ManualSizeInput';
import type { TyreSize, Vehicle } from '@/types/vehicle';

const c = colorTokens;

const VRM_ENABLED = process.env.NEXT_PUBLIC_VRM_ENABLED === 'true';

export function QuotePageClient() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tyreSize, setTyreSize] = useState<TyreSize | null>(null);
  const [manualMode, setManualMode] = useState(!VRM_ENABLED);

  const handleResolved = useCallback((v: Vehicle, t: TyreSize | null) => {
    setVehicle(v);
    setTyreSize(t);
    setManualMode(false);
  }, []);

  const handleManualFallback = useCallback(() => {
    setManualMode(true);
  }, []);

  const handleManualChange = useCallback((size: TyreSize) => {
    setTyreSize(size);
  }, []);

  return (
    <Box bg={c.bg} minH="100vh" color={c.text}>
      <Nav />
      <Container maxW="900px" py={{ base: 8, md: 14 }}>
        <Heading as="h1" size={{ base: 'xl', md: '2xl' }} fontWeight="900" mb={2}>
          Get an instant quote
        </Heading>
        <Text color={c.muted} fontSize="16px" mb={8} maxW="640px">
          {VRM_ENABLED
            ? 'Tell us your reg and we\'ll work out the right tyre size for your vehicle, then show you a live price range — no phone call needed.'
            : 'Choose your tyre size and service to get a live price range — no phone call needed.'}
        </Text>

        <Stack gap={8}>
            <Box
              p={{ base: 4, md: 6 }}
              borderWidth="1px"
              borderColor={c.border}
              borderRadius="12px"
              bg="rgba(24,24,27,0.65)"
            >
              {VRM_ENABLED && !manualMode && (
                <>
                  <VrmLookup onResolved={handleResolved} onManualFallback={handleManualFallback} />
                  <Flex mt={4} justify="flex-end">
                    <ManualSizeToggle onClick={() => setManualMode(true)} />
                  </Flex>
                </>
              )}
              {manualMode && (
                <>
                  <ManualSizeInput initial={tyreSize} onChange={handleManualChange} />
                  {VRM_ENABLED && (
                    <Flex mt={4} justify="flex-end">
                      <ManualSizeToggle onClick={() => setManualMode(false)} />
                    </Flex>
                  )}
                </>
              )}
            </Box>

            {tyreSize && (
              <Box
                p={{ base: 4, md: 6 }}
                borderWidth="1px"
                borderColor={c.border}
                borderRadius="12px"
                bg="rgba(24,24,27,0.65)"
              >
                <InstantQuote
                  tyreSize={tyreSize}
                  vrm={vehicle?.registrationNumber ?? null}
                />
              </Box>
            )}
          </Stack>
      </Container>
      <Footer />
    </Box>
  );
}

export default function QuotePage() {
  return (
    <ErrorBoundary>
      <QuotePageClient />
    </ErrorBoundary>
  );
}
