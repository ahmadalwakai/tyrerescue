'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  Badge,
} from '@chakra-ui/react';
import {
  WizardState,
  SelectedTyre,
  PricingBreakdown,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  cartTotal,
  cartItemCount,
} from './types';
import { CartSummary } from './CartSummary';
import { formatPrice } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';
import { LOW_STOCK_THRESHOLD } from '@/lib/inventory/stock-domain';

interface TyreProduct {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  tier: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  priceNew: number | null;
  stockNew: number;
  stockOrdered: number | null;
  isLocalStock: boolean | null;
  availableNew: boolean;
  isDirectSale: boolean;
  isOrderOnly: boolean;
  orderType: 'immediate' | 'special_order';
  leadTimeLabel: string | null;
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
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [orderPrompt, setOrderPrompt] = useState<{
    tyre: TyreProduct;
    step: 'confirm' | 'fulfillment';
  } | null>(null);

  const cart = state.selectedTyres;
  const totalItems = cartItemCount(cart);

  const setCart = useCallback(
    (next: SelectedTyre[]) => updateState({ selectedTyres: next }),
    [updateState],
  );

  // Fetch tyres matching the size
  useEffect(() => {
    async function fetchTyres() {
      setIsLoading(true);
      setError(null);

      try {
        const { width, aspect, rim } = state.tyreSize;
        const res = await fetch(
          `${API.TYRES}?width=${width}&aspect=${aspect}&rim=${rim}`
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

  const handleAddToCart = (tyre: TyreProduct) => {
    if (!tyre.priceNew) return;

    // Non-budget tyres require explicit order confirmation
    if (tyre.isOrderOnly) {
      // Emergency flow blocks non-budget entirely
      if (state.bookingType === 'emergency') {
        setQuoteError(
          'Only budget tyres are available for emergency callout. Please select a budget tyre or switch to a scheduled booking.',
        );
        return;
      }
      setOrderPrompt({ tyre, step: 'confirm' });
      return;
    }

    // Budget tyre — add directly
    const service = state.conditionAssessment === 'repair' ? 'repair' as const : 'fit' as const;
    const inStock = tyre.availableNew && tyre.stockNew >= 1;
    setCart(
      addToCart(cart, {
        tyreId: tyre.id,
        brand: tyre.brand,
        pattern: tyre.pattern,
        sizeDisplay: tyre.sizeDisplay,
        unitPrice: tyre.priceNew,
        service,
        isPreOrder: !inStock,
      }),
    );
    setQuoteError(null);
  };

  const handleConfirmSpecialOrder = (fulfillment: 'delivery' | 'fitting') => {
    if (!orderPrompt) return;
    const tyre = orderPrompt.tyre;
    const service = state.conditionAssessment === 'repair' ? 'repair' as const : 'fit' as const;
    setCart(
      addToCart(cart, {
        tyreId: tyre.id,
        brand: tyre.brand,
        pattern: tyre.pattern,
        sizeDisplay: tyre.sizeDisplay,
        unitPrice: tyre.priceNew!,
        service,
        isPreOrder: true,
        orderConfirmed: true,
      }),
    );
    updateState({ fulfillmentOption: fulfillment });
    setOrderPrompt(null);
    setQuoteError(null);
  };

  const handleRequestQuote = async () => {
    if (cart.length === 0) return;

    setIsQuoting(true);
    setQuoteError(null);

    try {
      const res = await fetch(API.BOOKINGS_QUOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType: state.conditionAssessment === 'repair' ? 'repair' : 'fit',
          tyreSelections: cart.map((t) => ({
            tyreId: t.tyreId,
            quantity: t.quantity,
            service: t.service,
            requiresTpms: t.requiresTpms ?? false,
            isPreOrder: t.isPreOrder ?? false,
          })),
          scheduledAt:
            state.scheduledDate && state.scheduledTime
              ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
              : undefined,
          fulfillmentOption: state.fulfillmentOption ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      updateState({
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

  // Loading state
  if (isLoading) {
    return (
      <VStack gap={4} py={12}>
        <Spinner size="lg" />
        <Text color={c.muted}>
          Loading available tyres...
        </Text>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Choose your tyres
        </Text>
        <Text color={c.muted}>
          Size: {state.tyreSize.width}/{state.tyreSize.aspect}/R{state.tyreSize.rim}
          {' '} &mdash; Select up to 4 tyres
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
          <Text color={c.muted} fontSize="sm" mb={4}>
            We can still help! Call us and we will source the right tyres for you.
          </Text>
          <a href="tel:01412660690" style={{ textDecoration: 'none' }}>
            <Button colorPalette="orange" size="sm">
              Call 0141 266 0690
            </Button>
          </a>
        </Box>
      )}

      {/* Two-panel: tyre list + cart sidebar on desktop */}
      {tyres.length > 0 && (
        <Box
          display={{ base: 'flex', lg: 'flex' }}
          flexDir={{ base: 'column', lg: 'row' }}
          gap={6}
        >
          {/* Left: Tyre cards */}
          <Box flex="1">
            <VStack gap={4}>
              {tyres.map((tyre, i) => {
                const inStock = tyre.availableNew && tyre.priceNew !== null && tyre.stockNew >= 1;
                const cartItem = cart.find((t) => t.tyreId === tyre.id);
                const isInCart = !!cartItem;
                const seasonColor = tyre.season === 'summer' ? 'orange' : tyre.season === 'winter' ? 'blue' : 'gray';
                const tierColor = tyre.tier === 'premium' ? 'orange' : tyre.tier === 'budget' ? 'gray' : 'cyan';
                const canAdd = totalItems < 4 && tyre.priceNew !== null;

                return (
                  <Box
                    key={tyre.id}
                    w="full"
                    p={4}
                    borderWidth="2px"
                    borderColor={isInCart ? c.accent : c.border}
                    borderRadius="lg"
                    bg={isInCart ? 'rgba(249,115,22,0.1)' : c.card}
                    transition="all 0.2s"
                    style={anim.stagger('fadeUp', i, '0.4s', 0.1, 0.05)}
                  >
                    <HStack justify="space-between" align="start" flexDir={{ base: 'column', md: 'row' }} gap={3}>
                      <Box>
                        <Text fontWeight="600" fontSize="lg" color={c.text}>
                          {tyre.brand}
                        </Text>
                        <Text color={c.muted} fontSize="sm">{tyre.pattern}</Text>
                        <Text fontFamily="var(--font-display)" fontSize="md" color={c.text} mt={1}>
                          {tyre.sizeDisplay}
                        </Text>
                        <HStack gap={2} mt={2} flexWrap="wrap">
                          <Badge colorPalette={seasonColor} size="sm">{tyre.season}</Badge>
                          <Badge colorPalette={tierColor} size="sm">{tyre.tier}</Badge>
                          {tyre.speedRating && <Text fontSize="xs" color={c.muted}>Speed: {tyre.speedRating}</Text>}
                          {tyre.loadIndex && <Text fontSize="xs" color={c.muted}>Load: {tyre.loadIndex}</Text>}
                          {tyre.wetGrip && <Text fontSize="xs" color={c.muted}>Grip: {tyre.wetGrip}</Text>}
                        </HStack>
                      </Box>

                      <VStack align="end" gap={2} minW="120px">
                        {tyre.priceNew ? (
                          <Text fontSize="xl" fontWeight="700" fontFamily="var(--font-body)" color={c.accent}>
                            {formatPrice(tyre.priceNew)}
                          </Text>
                        ) : (
                          <Text fontSize="sm" color={c.muted}>Price N/A</Text>
                        )}

                        {tyre.isOrderOnly ? (
                          <Badge colorPalette="orange" size="sm">
                            Order Only — 2–3 Working Days
                          </Badge>
                        ) : inStock && tyre.isLocalStock !== false ? (
                          <Badge colorPalette="green" size="sm">
                            In Stock — Same Day
                          </Badge>
                        ) : tyre.priceNew ? (
                          <Badge colorPalette="gray" size="sm">
                            Out of Stock
                          </Badge>
                        ) : (
                          <Badge colorPalette="gray" size="sm">Unavailable</Badge>
                        )}

                        {isInCart ? (
                          <HStack gap={1}>
                            <Box
                              as="button"
                              w="36px"
                              h="36px"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              borderWidth="1px"
                              borderColor={c.border}
                              borderRadius="md"
                              bg={c.card}
                              color={c.text}
                              _hover={{ borderColor: c.accent }}
                              onClick={() =>
                                setCart(updateCartQuantity(cart, tyre.id, cartItem!.quantity - 1))
                              }
                            >
                              -
                            </Box>
                            <Text w="28px" textAlign="center" fontWeight="600" color={c.text} fontSize="sm">
                              {cartItem!.quantity}
                            </Text>
                            <Box
                              as="button"
                              w="36px"
                              h="36px"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              borderWidth="1px"
                              borderColor={c.border}
                              borderRadius="md"
                              bg={c.card}
                              color={c.text}
                              _hover={{ borderColor: c.accent }}
                              onClick={() =>
                                setCart(updateCartQuantity(cart, tyre.id, cartItem!.quantity + 1))
                              }
                            >
                              +
                            </Box>
                          </HStack>
                        ) : (
                          <Button
                            size="sm"
                            colorPalette="orange"
                            disabled={!canAdd}
                            onClick={() => handleAddToCart(tyre)}
                            minH="36px"
                          >
                            Add to cart
                          </Button>
                        )}
                      </VStack>
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          </Box>

          {/* Right: Cart sidebar (desktop) */}
          <Box
            display={{ base: 'none', lg: 'block' }}
            w="320px"
            flexShrink={0}
            position="sticky"
            top="100px"
            alignSelf="flex-start"
          >
            <CartSummary cart={cart} onChange={setCart} />
          </Box>
        </Box>
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
          disabled={cart.length === 0 || isQuoting}
          flex="1"
        >
          {isQuoting ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Getting quote...</Text>
            </HStack>
          ) : (
            `Get Quote (${totalItems} tyre${totalItems !== 1 ? 's' : ''})`
          )}
        </Button>
      </HStack>

      {/* Mobile sticky cart bar */}
      {cart.length > 0 && (
        <Box
          display={{ base: 'block', lg: 'none' }}
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          zIndex={50}
          bg={c.surface}
          borderTopWidth="1px"
          borderColor={c.border}
          p={3}
          boxShadow="0 -4px 20px rgba(0,0,0,0.4)"
        >
          <HStack justify="space-between">
            <Box>
              <Text fontSize="sm" color={c.muted}>
                {totalItems} tyre{totalItems !== 1 ? 's' : ''}
              </Text>
              <Text fontWeight="700" color={c.accent}>
                {formatPrice(cartTotal(cart))}
              </Text>
            </Box>
            <Button
              colorPalette="orange"
              size="sm"
              onClick={handleRequestQuote}
              disabled={isQuoting}
              minH="48px"
              px={6}
            >
              {isQuoting ? <Spinner size="sm" /> : 'Get Quote'}
            </Button>
          </HStack>
        </Box>
      )}

      {/* Special order confirmation overlay */}
      {orderPrompt && orderPrompt.step === 'confirm' && (
        <Box
          position="fixed"
          inset="0"
          bg="rgba(0,0,0,0.7)"
          zIndex={100}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box
            bg={c.card}
            p={6}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={c.border}
            maxW="440px"
            w="full"
          >
            <VStack gap={4} align="stretch">
              <Text fontSize="lg" fontWeight="700" color={c.text}>
                This tyre is not available for immediate fitting
              </Text>
              <Text fontSize="sm" color={c.muted}>
                <strong style={{ color: c.text }}>
                  {orderPrompt.tyre.brand} {orderPrompt.tyre.pattern}
                </strong>{' '}
                ({orderPrompt.tyre.sizeDisplay}) is a special-order item.
              </Text>
              <Box
                p={3}
                bg={c.surface}
                borderRadius="md"
                borderWidth="1px"
                borderColor={c.border}
              >
                <Text fontSize="sm" fontWeight="600" color={c.accent}>
                  Estimated delivery: 2–3 working days
                </Text>
              </Box>
              <Text fontSize="sm" color={c.muted}>
                Do you want to order it, or choose a budget alternative available now?
              </Text>
              <VStack gap={2}>
                <Button
                  colorPalette="orange"
                  w="full"
                  onClick={() => setOrderPrompt({ ...orderPrompt, step: 'fulfillment' })}
                >
                  Order this tyre
                </Button>
                <Button
                  variant="outline"
                  w="full"
                  borderColor={c.border}
                  color={c.text}
                  onClick={() => setOrderPrompt(null)}
                >
                  Choose budget alternative
                </Button>
              </VStack>
            </VStack>
          </Box>
        </Box>
      )}

      {/* Fulfillment choice overlay */}
      {orderPrompt && orderPrompt.step === 'fulfillment' && (
        <Box
          position="fixed"
          inset="0"
          bg="rgba(0,0,0,0.7)"
          zIndex={100}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box
            bg={c.card}
            p={6}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={c.border}
            maxW="440px"
            w="full"
          >
            <VStack gap={4} align="stretch">
              <Text fontSize="lg" fontWeight="700" color={c.text}>
                How would you like to receive this tyre?
              </Text>
              <Text fontSize="sm" color={c.muted}>
                {orderPrompt.tyre.brand} {orderPrompt.tyre.pattern} — 2–3 working days
              </Text>
              <VStack gap={2}>
                <Button
                  colorPalette="orange"
                  w="full"
                  onClick={() => handleConfirmSpecialOrder('delivery')}
                >
                  Delivery only
                </Button>
                <Button
                  colorPalette="orange"
                  variant="outline"
                  w="full"
                  borderColor={c.accent}
                  color={c.text}
                  onClick={() => handleConfirmSpecialOrder('fitting')}
                >
                  Fitting appointment after arrival
                </Button>
                <Button
                  variant="ghost"
                  w="full"
                  color={c.muted}
                  onClick={() => setOrderPrompt(null)}
                >
                  Cancel
                </Button>
              </VStack>
            </VStack>
          </Box>
        </Box>
      )}
    </VStack>
  );
}
