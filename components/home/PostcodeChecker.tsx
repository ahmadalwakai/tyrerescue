'use client';

/**
 * <PostcodeChecker /> — homepage hero coverage probe.
 *
 * Lets the user paste / type a UK postcode and immediately learn whether
 * we cover them and the typical ETA, before being asked to fill in a
 * full booking form.
 *
 * State machine: idle → loading → success | partial | notCovered | error
 * Race condition: every fetch is keyed by an AbortController; a new
 * submission cancels any in-flight request so stale results never win.
 * Persistence: a successful (covered) result is cached in sessionStorage
 * for 1 hour and surfaced to the booking flow via the `?postcode=` query
 * string when the user clicks "Continue to Book".
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens } from '@/lib/design-tokens';
import { normalizePostcode, validateUkPostcode } from '@/lib/postcode';
import type { CoverageErrorResponse, CoverageResult, CoverageTier } from '@/types/coverage';

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CoverageResult }
  | { status: 'error'; message: string };

const SESSION_STORAGE_KEY = 'tyrerescue:coverage';
const SESSION_TTL_MS = 60 * 60 * 1_000;

interface CachedCoverage {
  data: CoverageResult;
  cachedAt: number;
}

const c = colorTokens;

function formatPostcodeInput(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase().slice(0, 8);
  if (compact.length <= 3) return compact;
  const inward = compact.slice(-3);
  const outward = compact.slice(0, compact.length - 3);
  return `${outward} ${inward}`;
}

function tierStyles(tier: CoverageTier): {
  bg: string;
  border: string;
  fg: string;
  badge: string;
} {
  switch (tier) {
    case 'core':
      return {
        bg: 'rgba(34, 197, 94, 0.10)',
        border: '#22C55E',
        fg: '#22C55E',
        badge: 'COVERED',
      };
    case 'extended':
      return {
        bg: 'rgba(245, 158, 11, 0.10)',
        border: '#F59E0B',
        fg: '#F59E0B',
        badge: 'EXTENDED AREA',
      };
    case 'outside':
      return {
        bg: 'rgba(239, 68, 68, 0.10)',
        border: '#EF4444',
        fg: '#EF4444',
        badge: 'OUTSIDE LIVE COVERAGE',
      };
  }
}

export function PostcodeChecker() {
  const [postcode, setPostcode] = useState('');
  const [view, setView] = useState<ViewState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = postcode.trim();
  const looksValid = useMemo(() => validateUkPostcode(trimmed), [trimmed]);

  const submit = useCallback(async () => {
    if (!looksValid) {
      setView({ status: 'error', message: 'Please enter a full UK postcode (e.g. G31 1PD).' });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ status: 'loading' });
    try {
      const res = await fetch('/api/coverage/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcode: normalizePostcode(trimmed) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as CoverageErrorResponse | null;
        const message = body?.error ?? 'Could not check coverage right now.';
        setView({ status: 'error', message });
        return;
      }
      const data = (await res.json()) as CoverageResult;
      setView({ status: 'success', data });
      if (data.covered && typeof window !== 'undefined') {
        const payload: CachedCoverage = { data, cachedAt: Date.now() };
        try {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // sessionStorage may be unavailable (private mode) — non-fatal
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setView({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [looksValid, trimmed]);

  const handleChange = useCallback((value: string) => {
    setPostcode(formatPostcodeInput(value));
    if (view.status === 'error') setView({ status: 'idle' });
  }, [view.status]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void submit();
    },
    [submit]
  );

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setView({ status: 'idle' });
  }, []);

  return (
    <Box w="100%" maxW="540px">
      <Box
        as="form"
        onSubmit={handleSubmit}
        bg="rgba(24,24,27,0.65)"
        backdropFilter="blur(8px)"
        borderWidth="1px"
        borderColor={c.border}
        borderRadius="12px"
        p={{ base: 3, md: 4 }}
      >
        <label
          htmlFor="hero-postcode"
          style={{
            display: 'block',
            marginBottom: 8,
            fontSize: '11px',
            color: c.accent,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Check coverage instantly
        </label>
        <Stack direction={{ base: 'column', md: 'row' }} gap={2}>
          <Input
            id="hero-postcode"
            value={postcode}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Your postcode (e.g. G31 1PD)"
            autoComplete="postal-code"
            inputMode="text"
            spellCheck={false}
            aria-invalid={view.status === 'error'}
            aria-describedby="hero-postcode-result"
            h="52px"
            bg={c.bg}
            borderColor={c.border}
            color={c.text}
            fontSize="16px"
            _placeholder={{ color: c.muted }}
            _focusVisible={{ borderColor: c.accent, boxShadow: `0 0 0 1px ${c.accent}` }}
            disabled={view.status === 'loading'}
          />
          <Button
            type="submit"
            h="52px"
            minW={{ base: '100%', md: '140px' }}
            bg={c.accent}
            color="#09090B"
            fontWeight="700"
            fontSize="15px"
            borderRadius="8px"
            _hover={{ opacity: 0.9 }}
            _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
            disabled={view.status === 'loading' || trimmed.length === 0}
          >
            {view.status === 'loading' ? <Spinner size="sm" /> : 'Check coverage'}
          </Button>
        </Stack>

        <Box
          id="hero-postcode-result"
          aria-live="polite"
          aria-atomic="true"
          mt={view.status === 'idle' ? 0 : 3}
        >
          {view.status === 'loading' && (
            <Flex align="center" gap={2} color={c.muted} fontSize="13px">
              <Spinner size="xs" /> Checking your postcode…
            </Flex>
          )}

          {view.status === 'error' && (
            <Flex
              direction="column"
              gap={2}
              p={3}
              bg="rgba(239, 68, 68, 0.10)"
              borderLeft="3px solid #EF4444"
              borderRadius="6px"
            >
              <Text color="#EF4444" fontSize="14px" fontWeight="600">
                {view.message}
              </Text>
              <Button
                size="sm"
                variant="outline"
                borderColor="#EF4444"
                color="#EF4444"
                bg="transparent"
                onClick={() => void submit()}
                alignSelf="flex-start"
              >
                Try again
              </Button>
            </Flex>
          )}

          {view.status === 'success' && (
            <CoverageResultCard data={view.data} onReset={handleReset} />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function CoverageResultCard({
  data,
  onReset,
}: {
  data: CoverageResult;
  onReset: () => void;
}) {
  const styles = tierStyles(data.tier);
  const bookHref = `/book?postcode=${encodeURIComponent(data.postcode)}`;
  const callbackHref = `/contact?postcode=${encodeURIComponent(data.postcode)}`;

  return (
    <Box
      p={3}
      bg={styles.bg}
      borderLeft={`3px solid ${styles.border}`}
      borderRadius="6px"
    >
      <Flex justify="space-between" align="center" mb={2} gap={2} wrap="wrap">
        <Text color={styles.fg} fontSize="11px" fontWeight="700" letterSpacing="0.1em">
          {styles.badge}
        </Text>
        <Text color={c.muted} fontSize="12px">
          {data.postcode} · {data.distanceMiles} mi from depot
        </Text>
      </Flex>

      {data.tier === 'core' && (
        <Text color={c.text} fontSize="15px" fontWeight="600" mb={1}>
          {data.area} — fitter to you in ~{data.etaMinutes} min
        </Text>
      )}
      {data.tier === 'extended' && (
        <Text color={c.text} fontSize="15px" fontWeight="600" mb={1}>
          {data.area} is in our extended area — allow ~{data.etaMinutes} min ETA
        </Text>
      )}
      {data.tier === 'outside' && (
        <Text color={c.text} fontSize="15px" fontWeight="600" mb={1}>
          {data.area} is outside live coverage — request a callback
        </Text>
      )}

      <Stack direction={{ base: 'column', sm: 'row' }} gap={2} mt={3}>
        {data.covered ? (
          <Button
            asChild
            h="48px"
            bg={c.accent}
            color="#09090B"
            fontWeight="700"
            borderRadius="8px"
            _hover={{ opacity: 0.9 }}
            flex={1}
          >
            <Link href={bookHref}>Continue to book</Link>
          </Button>
        ) : (
          <Button
            asChild
            h="48px"
            bg="#EF4444"
            color="white"
            fontWeight="700"
            borderRadius="8px"
            _hover={{ opacity: 0.9 }}
            flex={1}
          >
            <Link href={callbackHref}>Request callback</Link>
          </Button>
        )}
        <Button
          h="48px"
          variant="outline"
          borderColor={c.border}
          color={c.text}
          bg="transparent"
          fontWeight="600"
          borderRadius="8px"
          onClick={onReset}
        >
          Try another
        </Button>
      </Stack>
    </Box>
  );
}
