'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

/** Auto-lookup cheapest matching tyre for emergency bookings that need replacement */
async function findCheapestMatchingTyre(
  tyreSize: { width: string; aspect: string; rim: string },
  quantity: number,
  service: 'fit' | 'assess',
): Promise<{
  tyreId: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  unitPrice: number;
  quantity: number;
  service: 'fit' | 'assess';
} | null> {
  const params = new URLSearchParams({
    width: tyreSize.width,
    aspect: tyreSize.aspect,
    rim: tyreSize.rim,
    limit: '20',
  });
  const res = await fetch(`${API.TYRES}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const tyres: Array<{
    id: string; brand: string; pattern: string; sizeDisplay: string;
    priceNew: number | null; stockNew: number | null;
  }> = data.tyres ?? [];
  if (tyres.length === 0) return null;

  // Pick cheapest available tyre with sufficient stock, or fall back to any priced tyre
  const priced = tyres.filter(t => t.priceNew != null && t.priceNew > 0);
  const withStock = priced.filter(t => (t.stockNew ?? 0) >= quantity);
  const candidates = withStock.length > 0 ? withStock : priced;
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (a.priceNew ?? 0) - (b.priceNew ?? 0));
  const tyre = candidates[0];
  return {
    tyreId: tyre.id,
    brand: tyre.brand,
    pattern: tyre.pattern,
    sizeDisplay: tyre.sizeDisplay,
    unitPrice: tyre.priceNew!,
    quantity,
    service,
  };
}

const RECOVERY_LIMIT = 3;
const LOADING_TIMEOUT_MS = 20_000;

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
  const [repairQuoteError, setRepairQuoteError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [buildSha, setBuildSha] = useState<string | null>(null);

  // Fetch build SHA once for support diagnostics
  useEffect(() => {
    fetch('/api/public/build-info')
      .then(r => r.json())
      .then(d => setBuildSha(d.gitSha ?? null))
      .catch(() => {});
  }, []);

  // Guards to prevent infinite re-fetch loops
  const inFlightRef = useRef(false);
  const lastFetchKeyRef = useRef('');
  const recoveryCountRef = useRef(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable fingerprint of selectedTyres for dependency tracking
  const tyreFingerprint = useMemo(
    () => state.selectedTyres.map(t => `${t.tyreId}:${t.quantity}:${t.service}`).join('|'),
    [state.selectedTyres],
  );

  // State-driven auto-recovery: reacts to pricing state, not just mount
  useEffect(() => {
    // Already have a valid quote — nothing to do
    if (state.quoteId && state.breakdown) return;

    // Cannot fetch without location
    if (!state.lat || !state.lng) return;

    const isRepair = state.serviceType === 'repair' && state.selectedTyres.length === 0;
    const hasTyres = state.selectedTyres.length > 0;
    // Emergency flow with assess/fit but no tyre selection step — treat as service-only quote
    const isEmergencyNoTyres = state.bookingType === 'emergency' && state.selectedTyres.length === 0;

    // Emergency replacement/assess needs auto tyre lookup (no tyre-selection step)
    const needsAutoTyreLookup =
      isEmergencyNoTyres && state.conditionAssessment !== 'repair';

    // Nothing quotable — no tyres and not a repair/emergency-without-tyres
    if (!isRepair && !hasTyres && !isEmergencyNoTyres) return;

    // Build a stable key from request inputs to avoid duplicate fetches
    const fetchKey = `${state.lat}|${state.lng}|${state.bookingType}|${state.serviceType}|${tyreFingerprint}`;

    // Already fetched (or fetching) for these exact inputs
    if (fetchKey === lastFetchKeyRef.current) return;

    // Concurrent request guard
    if (inFlightRef.current) return;

    // Retry limit reached for this session
    if (recoveryCountRef.current >= RECOVERY_LIMIT) return;
    lastFetchKeyRef.current = fetchKey;
    recoveryCountRef.current += 1;
    inFlightRef.current = true;

    async function fetchQuote() {
      setIsRefreshing(true);
      setRepairQuoteError(null);
      setLoadingTimedOut(false);
      try {
        // Determine how to build the quote request
        let finalServiceType: string;
        type TyreSel = { tyreId: string; quantity: number; service: string; requiresTpms: boolean; isPreOrder: boolean };
        let finalTyreSelections: TyreSel[];
        let autoTyre: Awaited<ReturnType<typeof findCheapestMatchingTyre>> = null;
        let isSendingAsRepair = false;

        if (
          needsAutoTyreLookup &&
          state.tyreSize.width &&
          state.tyreSize.aspect &&
          state.tyreSize.rim
        ) {
          // Emergency replacement/assess — auto-select cheapest matching tyre
          const svc = state.serviceType === 'assess' ? 'assess' as const : 'fit' as const;
          autoTyre = await findCheapestMatchingTyre(
            state.tyreSize,
            state.quantity || 1,
            svc,
          );
        }

        if (autoTyre) {
          // Found a matching tyre — quote with tyre cost + fitting/assess fee
          finalServiceType = autoTyre.service;
          finalTyreSelections = [{
            tyreId: autoTyre.tyreId,
            quantity: autoTyre.quantity,
            service: autoTyre.service,
            requiresTpms: false,
            isPreOrder: false,
          }];
        } else if (isRepair || isEmergencyNoTyres) {
          // Pure repair OR emergency fallback (no matching tyres found)
          isSendingAsRepair = true;
          finalServiceType = 'repair';
          finalTyreSelections = [];
        } else {
          finalServiceType = state.conditionAssessment === 'repair' ? 'repair' : 'fit';
          finalTyreSelections = state.selectedTyres.map((t) => ({
            tyreId: t.tyreId,
            quantity: t.quantity,
            service: t.service,
            requiresTpms: t.requiresTpms ?? false,
            isPreOrder: t.isPreOrder ?? false,
          }));
        }

        const payload = {
            lat: state.lat,
            lng: state.lng,
            addressLine: state.address,
            bookingType: state.bookingType,
            serviceType: finalServiceType,
            tyreSelections: finalTyreSelections,
            quantity: isSendingAsRepair ? (state.quantity || 1) : undefined,
            fulfillmentOption: state.fulfillmentOption ?? undefined,
            scheduledAt:
              state.scheduledDate && state.scheduledTime
                ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
                : undefined,
        };
        const res = await fetch(API.BOOKINGS_QUOTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to get quote');
        }

        // Validate response shape before updating state
        if (!data.quoteId || typeof data.quoteId !== 'string') {
          throw new Error('Invalid quote response — missing quote ID');
        }
        if (!data.breakdown || typeof data.breakdown !== 'object') {
          throw new Error('Invalid quote response — missing pricing breakdown');
        }

        updateState({
          quoteId: data.quoteId,
          breakdown: data.breakdown,
          quoteExpiresAt: data.expiresAt,
          ...(autoTyre
            ? {
                selectedTyres: [{
                  tyreId: autoTyre.tyreId,
                  brand: autoTyre.brand,
                  pattern: autoTyre.pattern,
                  sizeDisplay: autoTyre.sizeDisplay,
                  quantity: autoTyre.quantity,
                  unitPrice: autoTyre.unitPrice,
                  service: autoTyre.service,
                }],
              }
            : isSendingAsRepair
            ? { selectedTyres: [] }
            : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get quote';
        setRepairQuoteError(message);
        // Reset fetch key so user-triggered retry can re-attempt
        lastFetchKeyRef.current = '';
      } finally {
        inFlightRef.current = false;
        setIsRefreshing(false);
      }
    }

    fetchQuote();

    // Cleanup: only reset inFlightRef so the next effect run can proceed.
    // Do NOT cancel in-flight requests — React Strict Mode re-runs effects
    // (mount → cleanup → remount) which would cancel valid fetches via
    // a closure `cancelled` flag before the response arrives.
    return () => {
      inFlightRef.current = false;
    };
  }, [
    state.quoteId,
    state.breakdown,
    state.lat,
    state.lng,
    state.serviceType,
    state.bookingType,
    tyreFingerprint,
    updateState,
    state.conditionAssessment,
    state.address,
    state.quantity,
    state.fulfillmentOption,
    state.scheduledDate,
    state.scheduledTime,
    state.selectedTyres,
  ]);

  // Hard fail-safe: never allow infinite loading spinner
  useEffect(() => {
    if (state.breakdown || repairQuoteError) {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoadingTimedOut(false);
      return;
    }

    // Already timed out — don't restart
    if (loadingTimedOut) return;

    if (!loadingTimerRef.current) {
      loadingTimerRef.current = setTimeout(() => {
        loadingTimerRef.current = null;
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
    }

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [state.breakdown, repairQuoteError, loadingTimedOut]);

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

      if (newCart.length === 0) {
        updateState({ breakdown: null, quoteId: null, quoteExpiresAt: null });
        return;
      }

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

        if (!data.quoteId || !data.breakdown) {
          throw new Error('Incomplete quote response');
        }

        updateState({
          quoteId: data.quoteId,
          breakdown: data.breakdown,
          quoteExpiresAt: data.expiresAt,
        });
      } catch {
        setRepairQuoteError('Failed to refresh quote. Please try again.');
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
      const isEmergencyNeedsTyre =
        state.bookingType === 'emergency' &&
        state.selectedTyres.length === 0 &&
        state.conditionAssessment !== 'repair' &&
        state.tyreSize.width &&
        state.tyreSize.aspect &&
        state.tyreSize.rim;

      let autoTyre: Awaited<ReturnType<typeof findCheapestMatchingTyre>> = null;
      if (isEmergencyNeedsTyre) {
        const svc = state.serviceType === 'assess' ? 'assess' as const : 'fit' as const;
        autoTyre = await findCheapestMatchingTyre(
          state.tyreSize,
          state.quantity || 1,
          svc,
        );
      }

      let refreshServiceType: string;
      type TyreSel = { tyreId: string; quantity: number; service: string; requiresTpms: boolean; isPreOrder: boolean };
      let refreshTyreSelections: TyreSel[];
      let refreshAsRepair = false;

      if (autoTyre) {
        refreshServiceType = autoTyre.service;
        refreshTyreSelections = [{
          tyreId: autoTyre.tyreId,
          quantity: autoTyre.quantity,
          service: autoTyre.service,
          requiresTpms: false,
          isPreOrder: false,
        }];
      } else if (state.selectedTyres.length === 0) {
        refreshAsRepair = true;
        refreshServiceType = 'repair';
        refreshTyreSelections = [];
      } else {
        refreshServiceType = state.conditionAssessment === 'repair' ? 'repair' : 'fit';
        refreshTyreSelections = state.selectedTyres.map((tyre) => ({
          tyreId: tyre.tyreId,
          quantity: tyre.quantity,
          service: tyre.service,
          requiresTpms: false,
          isPreOrder: tyre.isPreOrder ?? false,
        }));
      }

      const res = await fetch(API.BOOKINGS_QUOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType: refreshServiceType,
          tyreSelections: refreshTyreSelections,
          quantity: refreshAsRepair ? (state.quantity || 1) : undefined,
          fulfillmentOption: state.fulfillmentOption ?? undefined,
          scheduledAt: state.scheduledDate && state.scheduledTime
            ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh quote');
      }

      if (!data.quoteId || !data.breakdown) {
        throw new Error('Incomplete quote response');
      }

      updateState({
        quoteId: data.quoteId,
        breakdown: data.breakdown,
        quoteExpiresAt: data.expiresAt,
        ...(autoTyre
          ? {
              selectedTyres: [{
                tyreId: autoTyre.tyreId,
                brand: autoTyre.brand,
                pattern: autoTyre.pattern,
                sizeDisplay: autoTyre.sizeDisplay,
                quantity: autoTyre.quantity,
                unitPrice: autoTyre.unitPrice,
                service: autoTyre.service,
              }],
            }
          : {}),
      });
    } catch (error) {
      setRepairQuoteError('Failed to refresh quote. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [state, updateState]);

  // Manual retry handler — resets guards so the recovery effect can re-trigger
  const handleManualRetry = useCallback(() => {
    lastFetchKeyRef.current = '';
    recoveryCountRef.current = 0;
    setRepairQuoteError(null);
    setLoadingTimedOut(false);
    // Clear stale quote state to trigger the recovery effect
    updateState({ quoteId: null, breakdown: null, quoteExpiresAt: null });
  }, [updateState]);

  const breakdown = state.breakdown as PricingBreakdown | null;

  // Group line items by type — must be above early returns to preserve hook order
  const tyreItems = useMemo(() => breakdown?.lineItems.filter(item => item.type === 'tyre') ?? [], [breakdown]);
  const serviceItems = useMemo(() => breakdown?.lineItems.filter(item => item.type === 'service') ?? [], [breakdown]);
  const calloutItems = useMemo(() => breakdown?.lineItems.filter(item => item.type === 'callout') ?? [], [breakdown]);
  const surchargeItems = useMemo(() => breakdown?.lineItems.filter(item => item.type === 'surcharge') ?? [], [breakdown]);
  const discountItems = useMemo(() => breakdown?.lineItems.filter(item => item.type === 'discount') ?? [], [breakdown]);

  if (!breakdown) {
    // Error state (API error or response validation failure)
    if (repairQuoteError) {
      return (
        <VStack py={12} gap={4}>
          <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)" textAlign="center">
            <Text fontWeight="600" color="red.400" mb={2}>
              Unable to generate quote
            </Text>
            <Text color="red.300" fontSize="sm" mb={3}>
              {repairQuoteError}
            </Text>
            <Text color={c.muted} fontSize="sm">
              Please call us on{' '}
              <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 500 }}>
                0141 266 0690
              </a>
            </Text>
            {buildSha && buildSha !== 'unknown' && (
              <Text color={c.muted} fontSize="xs" mt={1}>Build: {buildSha.slice(0, 7)}</Text>
            )}
          </Box>
          <HStack gap={3} justify="center">
            <Button variant="outline" onClick={goToPrev}>
              Back
            </Button>
            <Button colorPalette="orange" onClick={handleManualRetry}>
              Retry
            </Button>
          </HStack>
        </VStack>
      );
    }

    // Timed-out state — spinner has been showing too long
    if (loadingTimedOut) {
      return (
        <VStack py={12} gap={4}>
          <Box p={4} bg="rgba(249,115,22,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(249,115,22,0.3)" textAlign="center">
            <Text fontWeight="600" color={c.accent} mb={2}>
              Quote is taking longer than expected
            </Text>
            <Text color={c.muted} fontSize="sm" mb={3}>
              This may be due to a slow connection. You can retry or go back and try again.
            </Text>
            <Text color={c.muted} fontSize="sm">
              Need help? Call{' '}
              <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 500 }}>
                0141 266 0690
              </a>
            </Text>
            {buildSha && buildSha !== 'unknown' && (
              <Text color={c.muted} fontSize="xs" mt={1}>Build: {buildSha.slice(0, 7)}</Text>
            )}
          </Box>
          <HStack gap={3} justify="center">
            <Button variant="outline" onClick={goToPrev}>
              Back
            </Button>
            <Button colorPalette="orange" onClick={handleManualRetry}>
              Retry
            </Button>
          </HStack>
        </VStack>
      );
    }

    // Normal loading state (bounded by the timeout above)
    return (
      <VStack py={12}>
        <Spinner size="lg" />
        <Text>Loading pricing...</Text>
      </VStack>
    );
  }

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
          {breakdown.vatAmount > 0 && (
            <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.text}>VAT (20%)</Text>
              <Text color={c.text}>{formatPrice(breakdown.vatAmount)}</Text>
            </HStack>
          )}
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
          disabled={isExpired || !breakdown || breakdown.total <= 0}
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
