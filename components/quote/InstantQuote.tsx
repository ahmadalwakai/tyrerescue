'use client';

/**
 * <InstantQuote /> — service-tier picker + quantity stepper that drives
 * `/api/quote/calculate` and renders the resulting price-range card.
 *
 * Updates are debounced 300ms so rapid quantity / service changes only
 * fire one network call. The CTA forwards the user into the booking
 * wizard with the chosen size + service pre-filled via query params.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import type { QuoteResult, QuoteServiceKey, TyreSize } from '@/types/vehicle';

const c = colorTokens;

const SERVICE_TABS: Array<{ key: QuoteServiceKey; label: string; sub: string }> = [
  { key: 'fitting', label: 'Fitting', sub: 'New tyres at your address' },
  { key: 'emergency', label: 'Emergency', sub: 'ASAP callout, 24/7' },
  { key: 'punctureRepair', label: 'Puncture repair', sub: 'On-site plug & patch' },
];

const QUANTITIES = [1, 2, 4] as const;

export interface InstantQuoteProps {
  tyreSize: TyreSize;
  vrm?: string | null;
  initialService?: QuoteServiceKey;
  initialQuantity?: 1 | 2 | 4;
}

export function InstantQuote({
  tyreSize,
  vrm,
  initialService = 'fitting',
  initialQuantity = 1,
}: InstantQuoteProps) {
  const router = useRouter();
  const [service, setService] = useState<QuoteServiceKey>(initialService);
  const [quantity, setQuantity] = useState<1 | 2 | 4>(initialQuantity);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sizeKey = useMemo(
    () => `${tyreSize.width}-${tyreSize.aspect}-${tyreSize.rim}`,
    [tyreSize.width, tyreSize.aspect, tyreSize.rim]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/quote/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tyreSize, service, quantity }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? 'Could not calculate a quote.');
          return;
        }
        const result = (await res.json()) as QuoteResult;
        setQuote(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Network error.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // sizeKey captures all relevant tyre fields
  }, [sizeKey, service, quantity, tyreSize]);

  const handleBook = useCallback(() => {
    const params = new URLSearchParams();
    params.set('size', `${tyreSize.width}/${tyreSize.aspect}R${tyreSize.rim}`);
    params.set('service', service);
    params.set('qty', String(quantity));
    if (vrm) params.set('vrm', vrm);
    router.push(`/book?${params.toString()}`);
  }, [router, service, quantity, tyreSize, vrm]);

  return (
    <Box>
      <Text fontSize="11px" color={c.accent} letterSpacing="0.12em" textTransform="uppercase" fontWeight="700" mb={2}>
        Choose service
      </Text>
      <Stack
        direction={{ base: 'column', md: 'row' }}
        gap={2}
        role="tablist"
        aria-label="Service type"
      >
        {SERVICE_TABS.map((tab) => {
          const active = service === tab.key;
          return (
            <Button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => setService(tab.key)}
              flex={1}
              h="auto"
              py={3}
              px={3}
              bg={active ? c.accent : c.bg}
              color={active ? '#09090B' : c.text}
              borderWidth="1px"
              borderColor={active ? c.accent : c.border}
              borderRadius="8px"
              _hover={{ borderColor: c.accent }}
              flexDirection="column"
              gap={1}
              alignItems="flex-start"
              textAlign="left"
            >
              <Text fontWeight="800" fontSize="15px">
                {tab.label}
              </Text>
              <Text fontSize="11px" opacity={0.85} fontWeight="500">
                {tab.sub}
              </Text>
            </Button>
          );
        })}
      </Stack>

      <Box mt={4}>
        <Text fontSize="11px" color={c.accent} letterSpacing="0.12em" textTransform="uppercase" fontWeight="700" mb={2}>
          How many tyres?
        </Text>
        <Flex gap={2}>
          {QUANTITIES.map((n) => {
            const active = quantity === n;
            return (
              <Button
                key={n}
                onClick={() => setQuantity(n)}
                flex={1}
                h="48px"
                bg={active ? c.accent : c.bg}
                color={active ? '#09090B' : c.text}
                borderWidth="1px"
                borderColor={active ? c.accent : c.border}
                fontWeight="800"
                fontSize="16px"
              >
                {n}
              </Button>
            );
          })}
        </Flex>
      </Box>

      <Box
        mt={5}
        p={4}
        bg="rgba(249,115,22,0.08)"
        borderLeft="3px solid"
        borderColor={c.accent}
        borderRadius="8px"
        minH="120px"
        aria-live="polite"
      >
        {loading && !quote && (
          <Flex align="center" gap={2} color={c.muted} fontSize="14px">
            <Spinner size="sm" /> Calculating your quote…
          </Flex>
        )}
        {error && (
          <Text color="#EF4444" fontSize="14px" fontWeight="600">
            {error}
          </Text>
        )}
        {quote && !error && (
          <Box>
            <Text fontSize="11px" color={c.muted} letterSpacing="0.1em" textTransform="uppercase">
              Estimated price range
            </Text>
            <Flex align="baseline" gap={2} mt={1}>
              <Text fontSize={{ base: '32px', md: '40px' }} fontWeight="900" color={c.text}>
                £{quote.from}
              </Text>
              <Text fontSize="20px" color={c.muted}>
                – £{quote.to}
              </Text>
              {loading && <Spinner size="xs" color={c.muted} />}
            </Flex>
            <Text fontSize="12px" color={c.muted} mt={1}>
              {quantity} × {tyreSize.width}/{tyreSize.aspect}R{tyreSize.rim} · includes fitting fee of £
              {quote.fittingFee} per tyre
            </Text>
            {quote.surcharge && (
              <Flex
                mt={2}
                align="center"
                gap={2}
                px={2}
                py={1}
                bg="rgba(239,68,68,0.12)"
                borderRadius="6px"
                fontSize="12px"
                color="#EF4444"
                fontWeight="700"
              >
                <Box as="span" aria-hidden>•</Box>
                <Text>
                  {quote.surcharge.label} · +£{quote.surcharge.amount} (+{Math.round((quote.surcharge.multiplier - 1) * 100)}%)
                </Text>
              </Flex>
            )}
            {quote.notes.length > 0 && (
              <Box as="ul" mt={2} pl={4} color={c.muted} fontSize="12px">
                {quote.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Button
        mt={4}
        w="100%"
        h="56px"
        bg={c.accent}
        color="#09090B"
        fontWeight="800"
        fontSize="17px"
        borderRadius="10px"
        _hover={{ opacity: 0.9 }}
        disabled={!quote}
        onClick={handleBook}
      >
        Book this quote
      </Button>
    </Box>
  );
}
