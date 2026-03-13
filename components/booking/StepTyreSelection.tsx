'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  SimpleGrid,
  Badge,
} from '@chakra-ui/react';
import { WizardState, SelectedTyre, TyreCondition, PricingBreakdown } from './types';
import { formatPrice } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface TyreProduct {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  priceNew: number | null;
  priceUsed: number | null;
  stockNew: number;
  stockUsed: number;
  availableNew: boolean;
  availableUsed: boolean;
}

interface StepTyreSelectionProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepTyreSelection({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepTyreSelectionProps) {
  const [tyres, setTyres] = useState<TyreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTyre, setSelectedTyre] = useState<{
    tyreId: string;
    condition: TyreCondition;
  } | null>(
    state.selectedTyres.length > 0
      ? { tyreId: state.selectedTyres[0].tyreId, condition: state.selectedTyres[0].condition }
      : null
  );
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Fetch tyres matching the size
  useEffect(() => {
    async function fetchTyres() {
      setIsLoading(true);
      setError(null);

      try {
        const { width, aspect, rim } = state.tyreSize;
        const res = await fetch(
          `/api/tyres?width=${width}&aspect=${aspect}&rim=${rim}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load tyres');
        }

        setTyres(data.tyres || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load tyres';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    if (state.tyreSize.width && state.tyreSize.aspect && state.tyreSize.rim) {
      fetchTyres();
    }
  }, [state.tyreSize]);

  // Get the selected tyre object
  const selectedTyreProduct = selectedTyre
    ? tyres.find((t) => t.id === selectedTyre.tyreId)
    : null;

  // Handle tyre selection
  const handleSelectTyre = (tyreId: string, condition: TyreCondition) => {
    setSelectedTyre({ tyreId, condition });
    setQuoteError(null);
  };

  // Request quote
  const handleRequestQuote = async () => {
    if (!selectedTyre || !selectedTyreProduct) return;

    setIsQuoting(true);
    setQuoteError(null);

    const isNew = selectedTyre.condition === 'new';
    const unitPrice = isNew
      ? selectedTyreProduct.priceNew
      : selectedTyreProduct.priceUsed;

    if (!unitPrice) {
      setQuoteError('Price not available for this tyre');
      setIsQuoting(false);
      return;
    }

    try {
      const res = await fetch('/api/bookings/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType: state.conditionAssessment === 'repair' ? 'repair' : 'fit',
          tyreSelections: [
            {
              tyreId: selectedTyre.tyreId,
              condition: selectedTyre.condition,
              quantity: state.quantity,
              service: state.conditionAssessment === 'repair' ? 'repair' : 'fit',
              requiresTpms: false,
            },
          ],
          scheduledAt: state.scheduledDate && state.scheduledTime
            ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      // Save selection and quote
      const selection: SelectedTyre = {
        tyreId: selectedTyre.tyreId,
        brand: selectedTyreProduct.brand,
        pattern: selectedTyreProduct.pattern,
        sizeDisplay: selectedTyreProduct.sizeDisplay,
        condition: selectedTyre.condition,
        quantity: state.quantity,
        unitPrice: unitPrice,
        service: state.conditionAssessment === 'repair' ? 'repair' : 'fit',
      };

      updateState({
        selectedTyres: [selection],
        quoteId: data.quoteId,
        breakdown: data.breakdown as PricingBreakdown,
        quoteExpiresAt: data.expiresAt,
      });

      goToNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote';
      setQuoteError(message);
    } finally {
      setIsQuoting(false);
    }
  };

  // Skip tyre selection if repair only
  const isRepairOnly = state.conditionAssessment === 'repair';

  // If repair only, create quote without tyre selection
  useEffect(() => {
    if (isRepairOnly && state.lat && state.lng) {
      handleRepairQuote();
    }
  }, [isRepairOnly]);

  const handleRepairQuote = async () => {
    setIsQuoting(true);

    try {
      const res = await fetch('/api/bookings/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType: 'repair',
          tyreSelections: [], // No tyre needed for repair
          scheduledAt: state.scheduledDate && state.scheduledTime
            ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      updateState({
        selectedTyres: [],
        quoteId: data.quoteId,
        breakdown: data.breakdown as PricingBreakdown,
        quoteExpiresAt: data.expiresAt,
      });

      goToNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote';
      setQuoteError(message);
      setIsQuoting(false);
    }
  };

  // Show loading while fetching or processing repair quote
  if (isLoading || (isRepairOnly && isQuoting)) {
    return (
      <VStack gap={4} py={12}>
        <Spinner size="lg" />
        <Text color={c.muted}>
          {isRepairOnly ? 'Preparing your quote...' : 'Loading available tyres...'}
        </Text>
      </VStack>
    );
  }

  // For repair only, we skip this step
  if (isRepairOnly) {
    return null;
  }

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Choose your tyres
        </Text>
        <Text color={c.muted}>
          Size: {state.tyreSize.width}/{state.tyreSize.aspect}/R{state.tyreSize.rim}
        </Text>
      </Box>

      {error && (
        <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
          <Text color="red.400">{error}</Text>
        </Box>
      )}

      {tyres.length === 0 && !error && (
        <Box p={6} textAlign="center" bg={c.surface} borderRadius="md">
          <Text fontWeight="500" mb={2} color={c.text}>
            No tyres available for this size
          </Text>
          <Text color={c.muted} fontSize="sm">
            Please call us on 0141 266 0690 and we can source the right tyres for you.
          </Text>
        </Box>
      )}

      {/* Tyre Cards */}
      {tyres.length > 0 && (
        <VStack gap={4}>
          {tyres.map((tyre, i) => (
            <Box key={tyre.id} style={anim.stagger('fadeUp', i, '0.4s', 0.1, 0.05)}>
            <TyreCard
              tyre={tyre}
              quantity={state.quantity}
              selected={selectedTyre?.tyreId === tyre.id ? selectedTyre.condition : null}
              onSelect={(condition) => handleSelectTyre(tyre.id, condition)}
            />
            </Box>
          ))}
        </VStack>
      )}

      {quoteError && (
        <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
          <Text color="red.400">{quoteError}</Text>
        </Box>
      )}

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button
          variant="outline"
          onClick={goToPrev}
          flex="1"
          disabled={isQuoting}
        >
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={handleRequestQuote}
          disabled={!selectedTyre || isQuoting}
          flex="1"
        >
          {isQuoting ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Getting quote...</Text>
            </HStack>
          ) : (
            'Get Quote'
          )}
        </Button>
      </HStack>
    </VStack>
  );
}

interface TyreCardProps {
  tyre: TyreProduct;
  quantity: number;
  selected: TyreCondition | null;
  onSelect: (condition: TyreCondition) => void;
}

function TyreCard({ tyre, quantity, selected, onSelect }: TyreCardProps) {
  const hasNew = tyre.availableNew && tyre.priceNew && tyre.stockNew >= quantity;
  const hasUsed = tyre.availableUsed && tyre.priceUsed && tyre.stockUsed >= quantity;

  return (
    <Box
      w="full"
      borderWidth="1px"
      borderColor={c.border}
      borderRadius="lg"
      overflow="hidden"
    >
      {/* Tyre Info Header */}
      <Box p={4} bg={c.surface} borderBottomWidth="1px" borderColor={c.border}>
        <HStack justify="space-between" align="start">
          <Box>
            <Text fontWeight="600" fontSize="lg" color={c.text}>
              {tyre.brand}
            </Text>
            <Text color={c.muted}>{tyre.pattern}</Text>
          </Box>
          <VStack align="end" gap={1}>
            <Badge colorPalette={tyre.season === 'summer' ? 'orange' : tyre.season === 'winter' ? 'blue' : 'gray'}>
              {tyre.season}
            </Badge>
            {tyre.speedRating && (
              <Text fontSize="xs" color="gray.500">
                Speed: {tyre.speedRating}
              </Text>
            )}
          </VStack>
        </HStack>

        {/* Specs */}
        <HStack gap={4} mt={3} fontSize="sm" color={c.muted}>
          {tyre.loadIndex && <Text>Load: {tyre.loadIndex}</Text>}
          {tyre.wetGrip && <Text>Grip: {tyre.wetGrip}</Text>}
          {tyre.fuelEfficiency && <Text>Fuel: {tyre.fuelEfficiency}</Text>}
        </HStack>
      </Box>

      {/* Price Options */}
      <SimpleGrid columns={2} gap={0}>
        {/* New Option */}
        <Box
          as="button"
          p={4}
          borderRightWidth="1px"
          borderColor={c.border}
          bg={selected === 'new' ? 'rgba(249,115,22,0.1)' : c.card}
          opacity={hasNew ? 1 : 0.5}
          cursor={hasNew ? 'pointer' : 'not-allowed'}
          onClick={() => hasNew && onSelect('new')}
          textAlign="center"
          transition="all 0.2s"
          _hover={hasNew ? { bg: 'rgba(249,115,22,0.1)' } : {}}
        >
          <Text fontWeight="600" color={selected === 'new' ? c.accent : c.text}>
            New
          </Text>
          {hasNew ? (
            <>
              <Text fontSize="xl" fontWeight="700" color={selected === 'new' ? c.accent : c.text}>
                {formatPrice(tyre.priceNew!)}
              </Text>
              <Text fontSize="xs" color={c.muted}>
                each ({tyre.stockNew} in stock)
              </Text>
            </>
          ) : (
            <Text fontSize="sm" color={c.muted}>
              Out of stock
            </Text>
          )}
        </Box>

        {/* Used Option */}
        <Box
          as="button"
          p={4}
          bg={selected === 'used' ? 'rgba(249,115,22,0.1)' : c.card}
          opacity={hasUsed ? 1 : 0.5}
          cursor={hasUsed ? 'pointer' : 'not-allowed'}
          onClick={() => hasUsed && onSelect('used')}
          textAlign="center"
          transition="all 0.2s"
          _hover={hasUsed ? { bg: 'rgba(249,115,22,0.1)' } : {}}
        >
          <Text fontWeight="600" color={selected === 'used' ? c.accent : c.text}>
            Used
          </Text>
          {hasUsed ? (
            <>
              <Text fontSize="xl" fontWeight="700" color={selected === 'used' ? c.accent : c.text}>
                {formatPrice(tyre.priceUsed!)}
              </Text>
              <Text fontSize="xs" color={c.muted}>
                each ({tyre.stockUsed} in stock)
              </Text>
            </>
          ) : (
            <Text fontSize="sm" color={c.muted}>
              Out of stock
            </Text>
          )}
        </Box>
      </SimpleGrid>

      {/* Selection indicator */}
      {selected && (
        <Box p={2} bg={c.accent} textAlign="center">
          <Text color={c.bg} fontSize="sm" fontWeight="500">
            Selected: {selected === 'new' ? 'New' : 'Used'} x {quantity} = {formatPrice(
              (selected === 'new' ? tyre.priceNew! : tyre.priceUsed!) * quantity
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
}
