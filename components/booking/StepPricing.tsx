'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, VStack, HStack, Text, Button, Separator, Spinner } from '@chakra-ui/react';
import { WizardState, WizardStep, updateCartQuantity, removeFromCart } from './types';
import { CartSummary } from './CartSummary';
import { formatPrice, PricingBreakdown, PricingLineItem } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';

interface StepPricingProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
  goToStep?: (step: WizardStep) => void;
}

export function StepPricing({
  state,
  updateState,
  goToNext,
  goToPrev,
  goToStep,
}: StepPricingProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate time remaining
  useEffect(() => {
    if (!state.quoteExpiresAt) return;

    const calculateTimeRemaining = () => {
      const expiresAt = new Date(state.quoteExpiresAt!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

      if (remaining === 0) {
        setIsExpired(true);
      }

      setTimeRemaining(remaining);
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [state.quoteExpiresAt]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle cart edits → re-quote
  const handleCartChange = useCallback(
    async (newCart: typeof state.selectedTyres) => {
      updateState({ selectedTyres: newCart });

      if (newCart.length === 0) return;

      setIsRefreshing(true);
      setIsExpired(false);

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
            tyreSelections: newCart.map((tyre) => ({
              tyreId: tyre.tyreId,
              quantity: tyre.quantity,
              service: tyre.service,
              requiresTpms: false,
              isPreOrder: tyre.isPreOrder ?? false,
            })),
            scheduledAt:
              state.scheduledDate && state.scheduledTime
                ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
                : undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to refresh quote');
        }

        updateState({
          quoteId: data.quoteId,
          breakdown: data.breakdown,
          quoteExpiresAt: data.expiresAt,
        });
      } catch {
        alert('Failed to refresh quote. Please try again.');
      } finally {
        setIsRefreshing(false);
      }
    },
    [state, updateState],
  );

  // Refresh quote (without cart changes)
  const handleRefreshQuote = useCallback(async () => {
    setIsRefreshing(true);
    setIsExpired(false);

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
          tyreSelections: state.selectedTyres.map((tyre) => ({
            tyreId: tyre.tyreId,
            quantity: tyre.quantity,
            service: tyre.service,
            requiresTpms: false,
          })),
          scheduledAt: state.scheduledDate && state.scheduledTime
            ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh quote');
      }

      updateState({
        quoteId: data.quoteId,
        breakdown: data.breakdown,
        quoteExpiresAt: data.expiresAt,
      });
    } catch (error) {
      alert('Failed to refresh quote. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [state, updateState]);

  const breakdown = state.breakdown as PricingBreakdown | null;

  if (!breakdown) {
    return (
      <VStack py={12}>
        <Spinner size="lg" />
        <Text>Loading pricing...</Text>
      </VStack>
    );
  }

  // Group line items by type (memoized to avoid recalculating on every render)
  const tyreItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'tyre'), [breakdown]);
  const serviceItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'service'), [breakdown]);
  const calloutItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'callout'), [breakdown]);
  const surchargeItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'surcharge'), [breakdown]);
  const discountItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'discount'), [breakdown]);

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Your quote
        </Text>

        {/* Countdown Timer */}
        {!isExpired && timeRemaining !== null && (
          <HStack
            p={3}
            bg={timeRemaining < 300 ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)'}
            borderRadius="md"
            borderWidth="1px"
            borderColor={timeRemaining < 300 ? 'rgba(249,115,22,0.3)' : 'rgba(249,115,22,0.2)'}
          >
            <Text
              fontWeight="600"
              color={c.accent}
            >
              Quote expires in: {formatTime(timeRemaining)}
            </Text>
          </HStack>
        )}

        {isExpired && (
          <Box
            p={4}
            bg="rgba(239,68,68,0.1)"
            borderRadius="md"
            borderWidth="1px"
            borderColor="rgba(239,68,68,0.3)"
          >
            <Text fontWeight="600" color="red.400" mb={2}>
              This quote has expired
            </Text>
            <Text color="red.300" fontSize="sm" mb={3}>
              Prices and availability may have changed.
            </Text>
            <Button
              colorPalette="red"
              size="sm"
              onClick={handleRefreshQuote}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <HStack>
                  <Spinner size="sm" />
                  <Text>Refreshing...</Text>
                </HStack>
              ) : (
                'Get New Quote'
              )}
            </Button>
          </Box>
        )}
      </Box>

      {/* Editable Cart */}
      {state.selectedTyres.length > 0 && (
        <Box style={anim.fadeUp('0.4s', '0.05s')}>
          <CartSummary cart={state.selectedTyres} onChange={handleCartChange} />
          {goToStep && (
            <Box
              as="button"
              mt={2}
              fontSize="sm"
              color={c.accent}
              _hover={{ textDecoration: 'underline' }}
              onClick={() => goToStep('tyre-selection')}
            >
              Add more tyres
            </Box>
          )}
        </Box>
      )}

      {/* Price Breakdown */}
      <Box borderWidth="1px" borderColor={c.border} borderRadius="lg" overflow="hidden" style={anim.fadeUp('0.5s', '0.1s')}>
        {/* Tyre Items */}
        {tyreItems.length > 0 && (
          <VStack gap={0} align="stretch">
            {tyreItems.map((item, index) => (
              <LineItemRow key={`tyre-${index}`} item={item} isLast={index === tyreItems.length - 1 && serviceItems.length === 0 && calloutItems.length === 0} />
            ))}
          </VStack>
        )}

        {/* Service Items */}
        {serviceItems.length > 0 && (
          <VStack gap={0} align="stretch">
            {serviceItems.map((item, index) => (
              <LineItemRow key={`service-${index}`} item={item} isLast={index === serviceItems.length - 1 && calloutItems.length === 0} />
            ))}
          </VStack>
        )}

        {/* Callout Fee */}
        {calloutItems.length > 0 && (
          <VStack gap={0} align="stretch" bg={c.surface}>
            {calloutItems.map((item, index) => (
              <LineItemRow key={`callout-${index}`} item={item} isLast={index === calloutItems.length - 1} />
            ))}
          </VStack>
        )}

        {/* Surcharges */}
        {surchargeItems.length > 0 && (
          <>
            <Separator />
              <VStack gap={0} align="stretch" bg="rgba(249,115,22,0.08)">
              {surchargeItems.map((item, index) => (
                <LineItemRow key={`surcharge-${index}`} item={item} isLast={index === surchargeItems.length - 1} />
              ))}
            </VStack>
          </>
        )}

        {/* Discounts */}
        {discountItems.length > 0 && (
          <>
            <Separator />
              <VStack gap={0} align="stretch" bg="rgba(34,197,94,0.08)">
              {discountItems.map((item, index) => (
                <HStack
                  key={`discount-${index}`}
                  justify="space-between"
                  p={4}
                  borderBottomWidth={index < discountItems.length - 1 ? '1px' : '0'}
                  borderColor={c.border}
                >
                  <Text color="green.400">{item.label}</Text>
                  <Text color="green.400" fontWeight="500">
                    -{formatPrice(Math.abs(item.amount))}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </>
        )}

        {/* Subtotal + VAT + Total */}
        <Separator />
        <VStack gap={0} align="stretch">
          <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
            <Text color={c.text}>Subtotal</Text>
            <Text color={c.text}>{formatPrice(breakdown.subtotal)}</Text>
          </HStack>
          <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
            <Text color={c.text}>VAT (20%)</Text>
            <Text color={c.text}>{formatPrice(breakdown.vatAmount)}</Text>
          </HStack>
          <HStack justify="space-between" p={4} bg={c.accent} style={anim.fadeUp('0.5s', '0.4s')}>
            <Text fontWeight="700" fontSize="lg" color={c.bg}>
              Total
            </Text>
            <Text fontWeight="700" fontSize="xl" color={c.bg}>
              {formatPrice(breakdown.total)}
            </Text>
          </HStack>
        </VStack>
      </Box>

      {/* Service Summary */}
      <Box p={4} bg={c.surface} borderRadius="md">
        <Text fontWeight="600" mb={2} color={c.text}>
          Service details
        </Text>
        <VStack align="stretch" gap={1} fontSize="sm" color={c.muted}>
          {state.selectedTyres.map((tyre, i) => (
            <Text key={i}>
              {tyre.quantity}x {tyre.brand} {tyre.pattern}
            </Text>
          ))}
          {state.conditionAssessment === 'repair' && (
            <Text>Puncture repair service</Text>
          )}
          <Text>{state.address}</Text>
          {state.scheduledDate && state.scheduledTime && (
            <Text>
              {new Date(state.scheduledDate).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              at {state.scheduledTime}
            </Text>
          )}
          {state.bookingType === 'emergency' && (
            <Text fontWeight="500" color={c.accent}>
              Emergency booking - fastest available driver
            </Text>
          )}
        </VStack>
      </Box>

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button variant="outline" onClick={goToPrev} flex="1">
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={goToNext}
          disabled={isExpired}
          flex="1"
        >
          Continue to details
        </Button>
      </HStack>
    </VStack>
  );
}

function LineItemRow({ item, isLast }: { item: PricingLineItem; isLast: boolean }) {
  return (
    <HStack
      justify="space-between"
      p={4}
      borderBottomWidth={isLast ? '0' : '1px'}
      borderColor={c.border}
    >
      <Box>
        <Text fontWeight="500" color={c.text}>{item.label}</Text>
        {item.quantity && item.quantity > 1 && item.unitPrice && (
          <Text fontSize="sm" color={c.muted}>
            {formatPrice(item.unitPrice)} x {item.quantity}
          </Text>
        )}
      </Box>
      <Text fontWeight="500" color={c.text}>{formatPrice(item.amount)}</Text>
    </HStack>
  );
}
