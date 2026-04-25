'use client';

/**
 * <VrmLookup /> — UK number-plate input that calls /api/vehicle/lookup
 * and surfaces the matched vehicle + suggested OEM tyre size.
 *
 * On success → calls `onResolved` with the vehicle + size so the parent
 * can pass them into <InstantQuote />. On not-found → exposes a "Continue
 * with manual size" affordance via `onManualFallback`.
 *
 * The plate input is styled to look like a real UK rear plate (yellow
 * background, black bold characters in a Charles-Wright-ish monospace).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { isValidVrm, normalizeVrm } from '@/lib/vrm';
import type { TyreSize, Vehicle, VrmErrorCode } from '@/types/vehicle';

const c = colorTokens;

interface LookupResponse {
  ok: boolean;
  vehicle?: Vehicle;
  tyreSize?: TyreSize | null;
  error?: { code: VrmErrorCode; message: string };
}

type View =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; vehicle: Vehicle; tyreSize: TyreSize | null }
  | { status: 'error'; code: VrmErrorCode; message: string };

export interface VrmLookupProps {
  onResolved: (vehicle: Vehicle, tyreSize: TyreSize | null) => void;
  onManualFallback: () => void;
}

export function VrmLookup({ onResolved, onManualFallback }: VrmLookupProps) {
  const [vrm, setVrm] = useState('');
  const [view, setView] = useState<View>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const valid = useMemo(() => isValidVrm(vrm), [vrm]);

  const submit = useCallback(async () => {
    if (!valid) {
      setView({
        status: 'error',
        code: 'invalid_format',
        message: 'Please enter a valid UK number plate.',
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ status: 'loading' });

    try {
      const res = await fetch('/api/vehicle/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationNumber: normalizeVrm(vrm) }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as LookupResponse | null;

      if (!res.ok || !body || !body.ok || !body.vehicle) {
        setView({
          status: 'error',
          code: body?.error?.code ?? 'unknown',
          message: body?.error?.message ?? 'Could not look up that plate.',
        });
        return;
      }
      setView({ status: 'success', vehicle: body.vehicle, tyreSize: body.tyreSize ?? null });
      onResolved(body.vehicle, body.tyreSize ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setView({
        status: 'error',
        code: 'network',
        message: err instanceof Error ? err.message : 'Network error.',
      });
    }
  }, [valid, vrm, onResolved]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void submit();
    },
    [submit]
  );

  const isError = view.status === 'error';

  return (
    <Box>
      <form onSubmit={handleSubmit} noValidate>
        <Text
          fontSize="11px"
          color={c.accent}
          letterSpacing="0.12em"
          textTransform="uppercase"
          fontWeight="700"
          display="block"
          mb={2}
        >
          <label htmlFor="vrm-input">Enter your number plate</label>
        </Text>

        <Stack direction={{ base: 'column', md: 'row' }} gap={3} align={{ md: 'stretch' }}>
          <Box position="relative" flex={1}>
            {/* Yellow UK rear-plate styling */}
            <Input
              id="vrm-input"
              value={vrm}
              onChange={(e) => setVrm(e.target.value.toUpperCase().slice(0, 8))}
              onBlur={() => setVrm((v) => normalizeVrm(v))}
              placeholder="AB12 CDE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              aria-invalid={isError}
              aria-describedby="vrm-status"
              h="64px"
              bg="#FFD400"
              color="#0B0B0B"
              borderColor="#0B0B0B"
              borderWidth="2px"
              borderRadius="8px"
              fontWeight="900"
              letterSpacing="0.18em"
              textAlign="center"
              fontSize={{ base: '28px', md: '32px' }}
              fontFamily="'UKNumberPlate', 'Charles Wright', 'Courier New', monospace"
              _placeholder={{ color: 'rgba(11,11,11,0.45)' }}
              _focusVisible={{
                borderColor: '#0B0B0B',
                boxShadow: '0 0 0 3px rgba(249,115,22,0.4)',
              }}
              disabled={view.status === 'loading'}
            />
            {view.status === 'loading' && (
              <Box position="absolute" right="16px" top="50%" transform="translateY(-50%)">
                <Spinner size="md" color="#0B0B0B" />
              </Box>
            )}
          </Box>

          <Button
            type="submit"
            h={{ base: '52px', md: '64px' }}
            minW={{ base: '100%', md: '160px' }}
            bg={c.accent}
            color="#09090B"
            fontWeight="800"
            fontSize="16px"
            borderRadius="8px"
            _hover={{ opacity: 0.9 }}
            _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
            disabled={view.status === 'loading' || !valid}
          >
            {view.status === 'loading' ? <Spinner size="sm" /> : 'Find my car'}
          </Button>
        </Stack>
      </form>

      <Box id="vrm-status" aria-live="polite" mt={3}>
        {view.status === 'success' && (
          <VehicleCard vehicle={view.vehicle} tyreSize={view.tyreSize} />
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
            {view.code === 'not_found' && (
              <Text color={c.muted} fontSize="13px">
                You can still continue and tell us your tyre size manually.
              </Text>
            )}
            <Flex gap={2} wrap="wrap">
              <Button
                size="sm"
                variant="outline"
                borderColor="#EF4444"
                color="#EF4444"
                bg="transparent"
                onClick={() => void submit()}
              >
                Try again
              </Button>
              {view.code === 'not_found' && (
                <Button size="sm" bg={c.accent} color="#09090B" fontWeight="700" onClick={onManualFallback}>
                  Enter size manually
                </Button>
              )}
            </Flex>
          </Flex>
        )}
      </Box>
    </Box>
  );
}

function VehicleCard({ vehicle, tyreSize }: { vehicle: Vehicle; tyreSize: TyreSize | null }) {
  return (
    <Box
      p={4}
      bg="rgba(34, 197, 94, 0.10)"
      borderLeft="3px solid #22C55E"
      borderRadius="8px"
    >
      <Text color="#22C55E" fontSize="11px" fontWeight="700" letterSpacing="0.1em" mb={1}>
        VEHICLE FOUND
      </Text>
      <Text color={c.text} fontSize="18px" fontWeight="700">
        {vehicle.make} {vehicle.model ?? ''}
      </Text>
      <Text color={c.muted} fontSize="13px" mt={1}>
        {[vehicle.yearOfManufacture, vehicle.fuelType, vehicle.colour].filter(Boolean).join(' · ')}
      </Text>
      {tyreSize && (
        <Box mt={3} p={2} bg={c.bg} borderRadius="6px" borderWidth="1px" borderColor={c.border}>
          <Text color={c.muted} fontSize="11px" letterSpacing="0.08em" textTransform="uppercase">
            Suggested tyre size {tyreSize.fallback ? '(estimate)' : '(OEM)'}
          </Text>
          <Text color={c.text} fontSize="20px" fontWeight="700" fontFamily="monospace">
            {tyreSize.width}/{tyreSize.aspect}R{tyreSize.rim}
          </Text>
        </Box>
      )}
    </Box>
  );
}
