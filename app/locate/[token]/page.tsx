'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, VStack, Spinner, Input, Button, Link } from '@chakra-ui/react';
import { useParams } from 'next/navigation';

type PageStatus =
  | 'LOADING'
  | 'PENDING'
  | 'REQUESTING_PERMISSION'
  | 'GETTING_LOCATION'
  | 'CHECKING_ACCURACY'
  | 'SENDING_LOCATION'
  | 'SUCCESS'
  | 'EXPIRED'
  | 'INVALID'
  | 'ALREADY_SHARED'
  | 'FAILED'
  | 'DENIED';

type TokenStatus = 'pending' | 'expired' | 'already_shared';

interface LocationShareGetResponse {
  status?: TokenStatus;
  customerName?: string;
  error?: unknown;
}

interface LocationSharePostResponse {
  success?: boolean;
  error?: unknown;
}

interface MapboxGeocodeResponse {
  features?: Array<{
    center?: [number, number];
  }>;
}

const IN_PROGRESS_STATUSES = [
  'REQUESTING_PERMISSION',
  'GETTING_LOCATION',
  'CHECKING_ACCURACY',
  'SENDING_LOCATION',
] as const;

type ShareProgressStatus = typeof IN_PROGRESS_STATUSES[number];

const PROGRESS_COPY: Record<ShareProgressStatus, { title: string; detail: string }> = {
  REQUESTING_PERMISSION: {
    title: 'Asking your phone for location permission...',
    detail: 'If prompted, tap Allow so we can find you faster.',
  },
  GETTING_LOCATION: {
    title: 'Finding your exact location...',
    detail: 'This can take longer indoors or when GPS signal is weak.',
  },
  CHECKING_ACCURACY: {
    title: 'Checking location accuracy...',
    detail: 'Please keep this page open for a few seconds.',
  },
  SENDING_LOCATION: {
    title: 'Sending location securely...',
    detail: 'Please keep this page open until we confirm it was received.',
  },
};

function isShareInProgress(status: PageStatus): status is ShareProgressStatus {
  return (IN_PROGRESS_STATUSES as readonly PageStatus[]).includes(status);
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (!record) return fallback;
  const error = record.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

export default function LocatePage() {
  const params = useParams();
  const tokenParam = params.token;
  const token = typeof tokenParam === 'string' ? tokenParam : Array.isArray(tokenParam) ? tokenParam[0] ?? '' : '';
  const [status, setStatus] = useState<PageStatus>('LOADING');
  const [customerName, setCustomerName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const shareInFlight = useRef(false);

  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch(`/api/location-share/${token}`);
        const data = (await readJson(res)) as LocationShareGetResponse | null;
        if (!res.ok) {
          setStatus('INVALID');
          return;
        }
        if (data?.status === 'expired') { setStatus('EXPIRED'); return; }
        if (data?.status === 'already_shared') { setStatus('ALREADY_SHARED'); return; }
        setCustomerName(typeof data?.customerName === 'string' ? data.customerName : '');
        setStatus('PENDING');
      } catch {
        setErrorMsg('We could not load this location request. Please try again.');
        setStatus('FAILED');
      }
    }
    if (token) void checkToken();
    else setStatus('INVALID');
  }, [token]);

  const submitLocation = useCallback(async (lat: number, lng: number, address?: string) => {
    setStatus('SENDING_LOCATION');
    try {
      await waitForPaint();
      const res = await fetch(`/api/location-share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, ...(address?.trim() ? { address: address.trim() } : {}) }),
      });
      if (res.ok) {
        setStatus('SUCCESS');
      } else {
        const data = (await readJson(res)) as LocationSharePostResponse | null;
        setErrorMsg(errorMessageFromPayload(data, 'We could not share your location.'));
        setStatus('FAILED');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('FAILED');
    } finally {
      shareInFlight.current = false;
    }
  }, [token]);

  const handleShare = useCallback(async () => {
    if (shareInFlight.current || isShareInProgress(status)) return;
    if (!navigator.geolocation) {
      setErrorMsg('Your browser does not support location sharing. Please enter your address manually.');
      setStatus('FAILED');
      return;
    }

    shareInFlight.current = true;
    setErrorMsg('');
    setStatus('REQUESTING_PERMISSION');
    await waitForPaint();
    setStatus('GETTING_LOCATION');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus('CHECKING_ACCURACY');
        await waitForPaint();
        await submitLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (error) => {
        shareInFlight.current = false;
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMsg('Please allow location access to continue. You can also enter your address manually.');
          setStatus('DENIED');
          return;
        }
        if (error.code === error.TIMEOUT) {
          setErrorMsg('Location timed out. This can take longer indoors or when GPS signal is weak.');
          setStatus('FAILED');
          return;
        }
        setErrorMsg('We could not get your location. Please try again.');
        setStatus('FAILED');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [status, submitLocation]);

  const handleManualSubmit = useCallback(async () => {
    if (!manualAddress.trim() || shareInFlight.current) return;
    shareInFlight.current = true;
    setErrorMsg('');
    setStatus('SENDING_LOCATION');
    try {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(manualAddress)}.json?country=gb&limit=1&access_token=${mapboxToken}`
        );
        const data = (await readJson(res)) as MapboxGeocodeResponse | null;
        const center = data?.features?.[0]?.center;
        if (center) {
          const [lng, lat] = center;
          await submitLocation(lat, lng, manualAddress);
          return;
        }
      }
      const res = await fetch(`/api/location-share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 55.8642, lng: -4.2518, address: manualAddress }),
      });
      if (res.ok) {
        setStatus('SUCCESS');
      } else {
        const data = await readJson(res);
        setErrorMsg(errorMessageFromPayload(data, 'We could not share your address.'));
        setStatus('FAILED');
      }
    } catch {
      setErrorMsg('Failed to submit address. Please try again.');
      setStatus('FAILED');
    } finally {
      shareInFlight.current = false;
    }
  }, [manualAddress, submitLocation, token]);

  const sharing = isShareInProgress(status);
  const progressCopy = sharing ? PROGRESS_COPY[status] : null;

  return (
    <Box
      minH="100vh"
      bg="#09090B"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Box maxW="400px" w="100%" textAlign="center">
        {/* Logo */}
        <Box mb={8}>
          <Text
            fontSize="28px"
            fontWeight="700"
            color="#F97316"
            letterSpacing="0.05em"
            fontFamily="var(--font-display, sans-serif)"
          >
            TYRE RESCUE
          </Text>
          <Text fontSize="12px" color="#A1A1AA" mt={1}>
            Mobile Tyre Fitting
          </Text>
        </Box>

        {status === 'LOADING' && (
          <VStack gap={4}>
            <Spinner size="lg" color="#F97316" />
            <Text color="#A1A1AA">Loading...</Text>
          </VStack>
        )}

        {status === 'PENDING' && (
          <VStack gap={6}>
            <Text color="#FAFAFA" fontSize="lg">
              Hi{customerName ? ` ${customerName}` : ''}!
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              Share your location so we can send a fitter to you as quickly as possible.
            </Text>
            <Button
              w="100%"
              h="56px"
              bg="#F97316"
              color="#09090B"
              fontSize="16px"
              fontWeight="700"
              borderRadius="12px"
              _hover={{ bg: '#EA580C' }}
              onClick={handleShare}
              disabled={sharing}
            >
              Share My Location
            </Button>
            <Text color="#71717A" fontSize="xs">
              Please keep this page open for a few seconds.
            </Text>
          </VStack>
        )}

        {progressCopy && (
          <VStack gap={4}>
            <ProgressSteps status={status} />
            <Spinner size="lg" color="#F97316" />
            <Text color="#FAFAFA" fontSize="lg" fontWeight="600">
              {progressCopy.title}
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              {progressCopy.detail}
            </Text>
            <Text color="#71717A" fontSize="xs">
              Please keep this page open for a few seconds.
            </Text>
            <Button
              w="100%"
              h="56px"
              bg="#3F3F46"
              color="#A1A1AA"
              fontSize="16px"
              fontWeight="700"
              borderRadius="12px"
              disabled
            >
              Share My Location
            </Button>
          </VStack>
        )}

        {status === 'SUCCESS' && (
          <VStack gap={4}>
            <Box
              aria-hidden="true"
              w="56px"
              h="56px"
              borderRadius="full"
              border="2px solid #22C55E"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Box
                w="16px"
                h="28px"
                borderRight="4px solid #22C55E"
                borderBottom="4px solid #22C55E"
                transform="rotate(45deg)"
                mt="-6px"
              />
            </Box>
            <Text color="#FAFAFA" fontSize="lg" fontWeight="600">
              Location shared
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              Location shared. You can close this page now.
            </Text>
          </VStack>
        )}

        {status === 'DENIED' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">
              Location permission was denied.
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              Please allow location access to continue, or enter your address manually.
            </Text>
            {errorMsg ? <Text color="red.300" fontSize="sm">{errorMsg}</Text> : null}
            <Input
              placeholder="e.g. 10 Duke Street, Glasgow, G4 0UL"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              bg="#27272A"
              borderColor="#3F3F46"
              color="#FAFAFA"
              h="48px"
              borderRadius="8px"
            />
            <Button
              w="100%"
              h="48px"
              bg="#F97316"
              color="#09090B"
              fontWeight="700"
              borderRadius="8px"
              _hover={{ bg: '#EA580C' }}
              onClick={handleManualSubmit}
              disabled={!manualAddress.trim() || sharing}
            >
              Submit Address
            </Button>
            <Button
              variant="ghost"
              color="#A1A1AA"
              size="sm"
              onClick={() => {
                setErrorMsg('');
                setStatus('PENDING');
              }}
            >
              Try again
            </Button>
          </VStack>
        )}

        {status === 'EXPIRED' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">Link expired</Text>
            <Text color="#A1A1AA" fontSize="sm">
              This location sharing link has expired. Please call us on{' '}
              <Link href="tel:01412660690" color="#F97316">0141 266 0690</Link>.
            </Text>
          </VStack>
        )}

        {status === 'ALREADY_SHARED' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">Already shared</Text>
            <Text color="#A1A1AA" fontSize="sm">
              Your location has already been received. Our team is on their way!
            </Text>
          </VStack>
        )}

        {status === 'INVALID' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">Invalid link</Text>
            <Text color="#A1A1AA" fontSize="sm">
              This link is not valid. Please check the link or call us on{' '}
              <Link href="tel:01412660690" color="#F97316">0141 266 0690</Link>.
            </Text>
          </VStack>
        )}

        {status === 'FAILED' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">We could not share your location.</Text>
            <Text color="red.300" fontSize="sm">{errorMsg || 'We could not share your location.'}</Text>
            <Text color="#A1A1AA" fontSize="sm">
              You can try again. This can take longer indoors or when GPS signal is weak.
            </Text>
            <Button
              variant="ghost"
              color="#F97316"
              onClick={() => {
                setErrorMsg('');
                setStatus('PENDING');
              }}
            >
              Try again
            </Button>
          </VStack>
        )}
      </Box>
    </Box>
  );
}

function ProgressSteps({ status }: { status: PageStatus }) {
  const steps: Array<{ label: string; active: boolean; done: boolean }> = [
    {
      label: 'Permission',
      active: status === 'REQUESTING_PERMISSION',
      done: status === 'GETTING_LOCATION' || status === 'CHECKING_ACCURACY' || status === 'SENDING_LOCATION',
    },
    {
      label: 'Location',
      active: status === 'GETTING_LOCATION' || status === 'CHECKING_ACCURACY',
      done: status === 'SENDING_LOCATION',
    },
    {
      label: 'Send',
      active: status === 'SENDING_LOCATION',
      done: false,
    },
  ];

  return (
    <Box display="flex" gap={2} w="100%">
      {steps.map((step) => (
        <Box key={step.label} flex="1" textAlign="center">
          <Box
            h="6px"
            borderRadius="999px"
            bg={step.done ? '#22C55E' : step.active ? '#F97316' : '#3F3F46'}
            mb={2}
          />
          <Text color={step.done || step.active ? '#FAFAFA' : '#71717A'} fontSize="11px" fontWeight="700">
            {step.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
