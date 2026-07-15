'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  Container,
  VStack,
  HStack,
  SimpleGrid,
  Text,
  Spinner,
} from '@chakra-ui/react';
import Link from 'next/link';
import { TrackingMap } from '@/components/tracking/TrackingMap';
import { StatusTimeline } from '@/components/tracking/StatusTimeline';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { buildWhatsAppHref } from '@/lib/contact/whatsapp-options';
import { trackCallClick, trackWhatsAppClick } from '@/lib/analytics/gtag';
import { logTrackingDiagnostic } from '@/lib/tracking/diagnostic-log';

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  note: string | null;
}

interface TrackingData {
  status: string;
  bookingType: string;
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  driverName: string | null;
  driverPhone: string | null;
  etaMinutes: number | null;
  estimatedArrivalAt: string | null;
  distanceMiles: number | null;
  routeCoordinates: [number, number][] | null;
  statusHistory: StatusHistoryItem[];
  addressLine: string;
  scheduledAt: string | null;
  completedAt: string | null;
}

interface TrackingContentProps {
  refNumber: string;
  initialStatus: string;
}

const SUPPORT_PHONE_DISPLAY = '0141 266 0690';
const SUPPORT_PHONE_TEL = '01412660690';
const IOS_APP_URL = 'https://apps.apple.com/gb/app/tyre-rescue/id6782555222';
const IOS_APP_NAME = 'Tyre Rescue';
const IOS_APP_SCHEME = 'tyrerescue';
const IOS_APP_PROMPT_DISMISSED_KEY = 'tyre-rescue-ios-app-prompt-dismissed-at';
const IOS_APP_PROMPT_HIDE_MS = 7 * 24 * 60 * 60 * 1000;
const IOS_APP_PROMPT_DELAY_MS = 1400;
const POLL_MS = 30_000;

type FetchReason = 'initial' | 'polling' | 'visibility' | 'network_recovery';

function logLegacyTracking(
  event: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
) {
  logTrackingDiagnostic(event, {
    surface: 'legacy_tracking',
    ...details,
  });
}

function isIosMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  const ua = nav.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((nav as Navigator & { standalone?: boolean }).standalone);
  return isiOS && !standalone;
}

function shouldForceAppPromptForLocalTesting(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(window.location.href);
    const forced = url.searchParams.get('debugAppPrompt') === '1';
    if (forced) window.localStorage.removeItem(IOS_APP_PROMPT_DISMISSED_KEY);
    return forced;
  } catch {
    return false;
  }
}

function toolButtonStyles(accent = false) {
  return {
    justifyContent: 'flex-start',
    h: 'auto',
    minH: '58px',
    px: 4,
    py: 3,
    borderRadius: '8px',
    borderWidth: '1px',
    borderColor: accent ? 'rgba(249,115,22,0.55)' : c.border,
    bg: accent ? 'rgba(249,115,22,0.14)' : c.card,
    color: accent ? c.accent : c.text,
    fontWeight: '800',
    _hover: {
      bg: accent ? 'rgba(249,115,22,0.22)' : c.surface,
      borderColor: accent ? c.accent : 'rgba(249,115,22,0.35)',
    },
  } as const;
}

function AppleIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.7 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.3-1.8-1.4-.1-2.7.8-3.4.8s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2.1-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.2-2.6-.1 0-2.6-1-2.6-3.6ZM14.5 5.6c.6-.8 1.1-1.8 1-2.8-1 .1-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.8 1.1.1 2.2-.6 2.8-1.4Z"
      />
    </svg>
  );
}

function formatEtaDuration(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  if (minutes < 1) return 'Arriving now';
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${rounded} min`;
  const hourText = hours === 1 ? '1 hr' : `${hours} hrs`;
  if (mins === 0) return hourText;
  return `${hourText} ${mins} min`;
}

function formatArrivalTime(value: string | null, etaMinutes: number | null): string | null {
  const arrival = value
    ? new Date(value)
    : etaMinutes != null && Number.isFinite(etaMinutes)
      ? new Date(Date.now() + Math.max(0, etaMinutes) * 60_000)
      : null;
  if (!arrival || Number.isNaN(arrival.getTime())) return null;
  return arrival.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatArrivalDate(value: string | null): string | null {
  if (!value) return null;
  const arrival = new Date(value);
  if (Number.isNaN(arrival.getTime())) return null;
  const today = new Date();
  if (arrival.toDateString() === today.toDateString()) return 'Today';
  return arrival.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatDistance(distanceMiles: number | null): string | null {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return null;
  if (distanceMiles < 0.1) return 'Less than 0.1 miles away';
  if (distanceMiles < 10) return `${distanceMiles.toFixed(1)} miles away`;
  return `${Math.round(distanceMiles)} miles away`;
}

function formatLastUpdated(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime()) || diffMs < 0) return 'just now';
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 60 * 60_000) {
    const mins = Math.max(1, Math.round(diffMs / 60_000));
    return mins === 1 ? '1 min ago' : `${mins} min ago`;
  }
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'driver_assigned':
      return 'Your driver is assigned and preparing to leave.';
    case 'en_route':
      return 'Your driver is on the way.';
    case 'arrived':
      return 'Your driver has arrived at your location.';
    case 'in_progress':
      return 'The job is now in progress.';
    default:
      return 'We will update this page as your booking progresses.';
  }
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to textarea fallback.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function TrackingContent({ refNumber, initialStatus }: TrackingContentProps) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showIosAppPrompt, setShowIosAppPrompt] = useState(false);
  const appFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStaleRef = useRef<boolean | null>(null);

  const fetchTrackingData = useCallback(async (reason: FetchReason = 'polling') => {
    const resultEvent = reason === 'initial' ? 'initial_fetch_result' : 'polling_result';
    if (reason === 'initial') {
      logLegacyTracking('initial_fetch_started', { jobId: refNumber });
    }

    try {
      const res = await fetch(`/api/tracking/${refNumber}`, { cache: 'no-store' });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch tracking data');
      }

      const trackingData: TrackingData = await res.json();
      logLegacyTracking(resultEvent, {
        trigger: reason,
        result: 'success',
        httpStatus: res.status,
        jobId: refNumber,
        serverTimestamp: trackingData.driverLocationAt,
      });
      setData(trackingData);
      setError(null);

      // Return whether we should continue polling
      return trackingData.status !== 'completed' && trackingData.status !== 'cancelled';
    } catch (err) {
      console.error('Error fetching tracking data:', err);
      logLegacyTracking(resultEvent, {
        trigger: reason,
        result: 'failed',
        jobId: refNumber,
      });
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
      return true; // Continue polling on error
    } finally {
      setIsLoading(false);
    }
  }, [refNumber]);

  // Initial fetch and polling
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = async () => {
      logLegacyTracking('realtime_connected', { jobId: refNumber, result: 'not_configured' });
      logLegacyTracking('realtime_disconnected', { jobId: refNumber, reason: 'not_configured' });
      const shouldContinue = await fetchTrackingData('initial');

      if (shouldContinue) {
        logLegacyTracking('polling_started', { jobId: refNumber, intervalMs: POLL_MS });
        intervalId = setInterval(async () => {
          const continuePolling = await fetchTrackingData('polling');
          if (!continuePolling && intervalId) {
            clearInterval(intervalId);
          }
        }, POLL_MS);
      }
    };

    startPolling();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchTrackingData, refNumber]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      logLegacyTracking('visibility_refetch', { jobId: refNumber });
      void fetchTrackingData('visibility');
    };
    const handleOnline = () => {
      logLegacyTracking('network_recovery_refetch', { jobId: refNumber });
      void fetchTrackingData('network_recovery');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchTrackingData, refNumber]);

  useEffect(() => {
    if (isLoading || !data) return;

    let dismissedAt = 0;
    try {
      dismissedAt = Number(window.localStorage.getItem(IOS_APP_PROMPT_DISMISSED_KEY) ?? 0);
    } catch {
      dismissedAt = 0;
    }

    const forced = shouldForceAppPromptForLocalTesting();
    if (!forced && !isIosMobileBrowser()) return;
    if (!forced && dismissedAt && Date.now() - dismissedAt < IOS_APP_PROMPT_HIDE_MS) return;

    const timer = window.setTimeout(() => {
      setShowIosAppPrompt(true);
    }, IOS_APP_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [data, isLoading]);

  // Check if driver location is stale (more than 5 minutes old)
  const isLocationStale = data?.driverLocationAt
    ? Date.now() - new Date(data.driverLocationAt).getTime() > 5 * 60 * 1000
    : false;

  useEffect(() => {
    if (!data) return;
    if (lastStaleRef.current === isLocationStale) return;
    lastStaleRef.current = isLocationStale;
    logLegacyTracking('stale_state_changed', {
      jobId: refNumber,
      state: isLocationStale ? 'delayed' : data.driverLocationAt ? 'polling' : 'unavailable',
      serverTimestamp: data.driverLocationAt,
    });
  }, [data, isLocationStale, refNumber]);

  // Check if tracking is active
  const currentStatus = data?.status ?? initialStatus;
  const hasDriverAssigned = !!data && ['driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'].includes(currentStatus);
  const etaLabel = useMemo(() => formatEtaDuration(data?.etaMinutes ?? null), [data?.etaMinutes]);
  const arrivalTimeLabel = useMemo(
    () => formatArrivalTime(data?.estimatedArrivalAt ?? null, data?.etaMinutes ?? null),
    [data?.estimatedArrivalAt, data?.etaMinutes],
  );
  const arrivalDateLabel = useMemo(
    () => formatArrivalDate(data?.estimatedArrivalAt ?? null),
    [data?.estimatedArrivalAt],
  );
  const distanceLabel = useMemo(
    () => formatDistance(data?.distanceMiles ?? null),
    [data?.distanceMiles],
  );
  const lastUpdatedLabel = useMemo(
    () => formatLastUpdated(data?.driverLocationAt ?? null),
    [data?.driverLocationAt],
  );
  const showEta = hasDriverAssigned
    && currentStatus !== 'completed'
    && currentStatus !== 'arrived'
    && currentStatus !== 'in_progress';
  const locationHref = data
    ? `https://www.google.com/maps/search/?api=1&query=${data.customerLat},${data.customerLng}`
    : null;
  const trackingShareText = `Tyre Rescue tracking for booking ${refNumber}`;

  const setTemporaryMessage = useCallback((message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 2600);
  }, []);

  const handleRefreshTracking = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchTrackingData();
      setTemporaryMessage('Tracking refreshed just now.');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchTrackingData, setTemporaryMessage]);

  const handleShareTracking = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: trackingShareText,
          text: trackingShareText,
          url,
        });
        setTemporaryMessage('Tracking link shared.');
        return;
      } catch {
        return;
      }
    }

    const ok = await copyToClipboard(url);
    setTemporaryMessage(ok ? 'Tracking link copied.' : 'Could not copy the tracking link.');
  }, [setTemporaryMessage, trackingShareText]);

  const handleCopyReference = useCallback(async () => {
    const ok = await copyToClipboard(refNumber);
    setTemporaryMessage(ok ? 'Booking reference copied.' : 'Could not copy the reference.');
  }, [refNumber, setTemporaryMessage]);

  const handleOpenWhatsApp = useCallback(() => {
    const statusLine = data?.status ? ` Current status: ${data.status}.` : '';
    const etaLine = arrivalTimeLabel ? ` ETA: ${arrivalTimeLabel}${etaLabel ? ` (${etaLabel})` : ''}.` : '';
    const message = `Hi, I need help with my Tyre Rescue booking ${refNumber}.${statusLine}${etaLine}`;
    trackWhatsAppClick('tracking_customer_tools');
    window.open(buildWhatsAppHref(message), '_blank', 'noopener,noreferrer');
  }, [arrivalTimeLabel, data?.status, etaLabel, refNumber]);

  const handleOpenLocation = useCallback(() => {
    if (!locationHref) return;
    window.open(locationHref, '_blank', 'noopener,noreferrer');
  }, [locationHref]);

  const handleDismissIosAppPrompt = useCallback(() => {
    setShowIosAppPrompt(false);
    if (appFallbackTimerRef.current) {
      clearTimeout(appFallbackTimerRef.current);
      appFallbackTimerRef.current = null;
    }
    try {
      window.localStorage.setItem(IOS_APP_PROMPT_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures; the prompt can still be dismissed in memory.
    }
  }, []);

  const handleOpenIosApp = useCallback(() => {
    handleDismissIosAppPrompt();
    let opened = false;
    const cancelFallback = () => {
      opened = true;
      if (appFallbackTimerRef.current) {
        clearTimeout(appFallbackTimerRef.current);
        appFallbackTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    const handleVisibility = () => {
      if (document.hidden) cancelFallback();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.location.href = `${IOS_APP_SCHEME}://track?ref=${encodeURIComponent(refNumber)}`;
    appFallbackTimerRef.current = setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (!opened && !document.hidden) {
        window.location.href = IOS_APP_URL;
      }
    }, 1_250);
  }, [handleDismissIosAppPrompt, refNumber]);

  const handleDownloadIosApp = useCallback(() => {
    handleDismissIosAppPrompt();
    window.location.href = IOS_APP_URL;
  }, [handleDismissIosAppPrompt]);

  if (isLoading) {
    return (
      <Container maxW="container.lg" py={12}>
        <VStack gap={4} py={12}>
          <Spinner size="lg" />
          <Text color={c.muted}>Loading tracking information...</Text>
        </VStack>
      </Container>
    );
  }

  if (error && !data) {
    return (
      <Container maxW="container.lg" py={12}>
        <VStack gap={4} py={12}>
          <Text color="red.400">{error}</Text>
          <Link href="/" style={{ textDecoration: 'underline', color: 'gray' }}>
            Return to Homepage
          </Link>
        </VStack>
      </Container>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <>
      {showIosAppPrompt && (
        <Box
          position="fixed"
          inset="0"
          zIndex={1500}
          bg="rgba(9,9,11,0.72)"
          backdropFilter="blur(10px)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          px={4}
          role="dialog"
          aria-modal="true"
          aria-label={`${IOS_APP_NAME} iOS app`}
        >
          <Box
            w="full"
            maxW="520px"
            bg="linear-gradient(145deg, rgba(39,39,42,0.98), rgba(9,9,11,0.98))"
            borderRadius="12px"
            borderWidth="1px"
            borderColor="rgba(249,115,22,0.38)"
            boxShadow="0 28px 90px rgba(0,0,0,0.52)"
            p={{ base: 5, md: 6 }}
          >
            <HStack justify="space-between" align="start" gap={4}>
              <HStack gap={3} align="center">
                <Box
                  w="48px"
                  h="48px"
                  borderRadius="12px"
                  bg="#FAFAFA"
                  color="#09090B"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <AppleIcon size={28} />
                </Box>
                <Box>
                  <Text fontSize="lg" fontWeight="900" color={c.text}>
                    Track your driver in the app
                  </Text>
                  <Text fontSize="sm" color={c.muted} fontWeight="700">
                    {IOS_APP_NAME}
                  </Text>
                </Box>
              </HStack>
              <Button
                size="sm"
                variant="ghost"
                color={c.muted}
                onClick={handleDismissIosAppPrompt}
                aria-label="Continue in browser"
              >
                Continue in browser
              </Button>
            </HStack>

            <Text mt={5} color={c.muted} lineHeight="1.7">
              Get faster live updates and booking notifications.
            </Text>

            <HStack mt={5} gap={3} flexWrap="wrap">
              <Button
                onClick={handleOpenIosApp}
                bg={c.accent}
                color="#09090B"
                _hover={{ bg: c.accentHover }}
                flex={{ base: '1 1 100%', sm: '1' }}
                minH="48px"
              >
                <HStack gap={2}>
                  <AppleIcon size={20} />
                  <Text>Open App</Text>
                </HStack>
              </Button>
              <Button
                variant="outline"
                borderColor={c.border}
                color={c.text}
                onClick={handleDownloadIosApp}
                flex={{ base: '1 1 100%', sm: '1' }}
                minH="48px"
              >
                Download App
              </Button>
            </HStack>
            <Button
              mt={3}
              variant="ghost"
              color={c.muted}
              onClick={handleDismissIosAppPrompt}
              w="full"
            >
              Continue in browser
            </Button>
          </Box>
        </Box>
      )}

      <Container maxW="container.lg" py={8}>
      <VStack gap={6} align="stretch">
        {/* Header */}
        <Box>
          <Text fontSize="sm" color={c.muted}>
            Tracking
          </Text>
          <Text fontSize="2xl" fontWeight="700" color={c.text}>
            {refNumber}
          </Text>
        </Box>

        {/* Job Complete Message */}
        {data.status === 'completed' && (
          <Box p={6} bg="rgba(34,197,94,0.1)" borderRadius="lg" textAlign="center">
            <Text fontSize="xl" fontWeight="600" color="green.400" mb={2}>
              Job Complete
            </Text>
            <Text color="green.300">
              Thank you for choosing Tyre Rescue. We hope everything went smoothly.
            </Text>
            {data.completedAt && (
              <Text fontSize="sm" color="green.300" mt={2}>
                Completed at {new Date(data.completedAt).toLocaleString('en-GB')}
              </Text>
            )}
          </Box>
        )}

        {/* Live ETA */}
        {showEta && (
          <Box
            p={{ base: 4, md: 5 }}
            bg="linear-gradient(135deg, rgba(249,115,22,0.18), rgba(39,39,42,0.96))"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="rgba(249,115,22,0.35)"
            style={anim.fadeSlideUp('0.5s', '0.1s')}
          >
            <HStack justify="space-between" align={{ base: 'start', md: 'center' }} gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="sm" color={c.muted} fontWeight="700">
                  Estimated arrival
                </Text>
                <HStack gap={3} align="end" mt={1}>
                  <Text fontSize={{ base: '4xl', md: '5xl' }} lineHeight="1" fontWeight="800" color={c.text}>
                    {arrivalTimeLabel ?? 'Updating'}
                  </Text>
                  {arrivalDateLabel && (
                    <Text pb={1} fontSize="sm" color={c.muted} fontWeight="700">
                      {arrivalDateLabel}
                    </Text>
                  )}
                </HStack>
              </Box>
              <Box textAlign={{ base: 'left', md: 'right' }}>
                <Text fontSize="sm" color={c.muted} fontWeight="700">
                  Time left
                </Text>
                <Text fontSize="2xl" fontWeight="800" color={c.accent}>
                  {etaLabel ?? 'Calculating'}
                </Text>
                {distanceLabel && (
                  <Text fontSize="sm" color={c.muted} fontWeight="600">
                    {distanceLabel}
                  </Text>
                )}
              </Box>
            </HStack>
            <Text mt={4} color={c.muted} fontSize="sm">
              {getStatusMessage(data.status)}
            </Text>
          </Box>
        )}

        {/* Map Section */}
        <Box
          h={{ base: '430px', md: '520px' }}
          borderRadius="lg"
          overflow="hidden"
          borderWidth="1px"
          borderColor={c.border}
          style={anim.fadeIn('0.8s', '0.2s')}
          boxShadow="0 22px 70px rgba(0,0,0,0.32)"
        >
          <TrackingMap
            customerLat={data.customerLat}
            customerLng={data.customerLng}
            driverLat={data.driverLat}
            driverLng={data.driverLng}
            routeCoordinates={data.routeCoordinates}
            showRoute={!!hasDriverAssigned && data.driverLat !== null}
            etaLabel={etaLabel}
            arrivalTimeLabel={arrivalTimeLabel}
            distanceLabel={distanceLabel}
            lastUpdatedLabel={lastUpdatedLabel}
            isLocationStale={isLocationStale}
          />
        </Box>

        {/* Driver Location Stale Warning */}
        {isLocationStale && data.status !== 'completed' && (
          <Box p={4} bg="rgba(234,179,8,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(234,179,8,0.3)">
            <Text color="yellow.400">
              Location update pending. The driver may be in a low-signal area.
            </Text>
          </Box>
        )}

        {/* Driver Info + Confidence Badges */}
        {hasDriverAssigned && data.status !== 'completed' && (
          <Box
            p={4}
            bg={c.card}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={c.border}
            style={anim.slideInRight('0.6s', '0.3s')}
          >
            <HStack justify="space-between" align="start">
              <Box>
                <Text fontWeight="600" mb={1}>
                  Your Driver
                </Text>
                {data.driverName && (
                  <Text color={c.muted}>
                    {data.driverName}
                  </Text>
                )}
                {data.driverPhone && (
                  <Text color={c.muted}>
                    {data.driverPhone}
                  </Text>
                )}
              </Box>

              {showEta && (
                <Box textAlign="right">
                  <Text fontWeight="600" mb={1}>
                    Arrival
                  </Text>
                  <Text fontSize="2xl" fontWeight="800" color={c.accent}>
                    {arrivalTimeLabel ?? 'Updating'}
                  </Text>
                  <Text fontSize="sm" color={c.muted} fontWeight="600">
                    {etaLabel ?? 'Calculating'}
                  </Text>
                </Box>
              )}

              {(data.status === 'arrived' || data.status === 'in_progress') && (
                <Box textAlign="right">
                  <Text fontWeight="600" color="green.400">
                    {data.status === 'arrived' ? 'Driver has arrived' : 'Job in progress'}
                  </Text>
                </Box>
              )}
            </HStack>

            {/* Confidence Badges */}
            <HStack gap={2} mt={3} flexWrap="wrap">
              {data.driverLat && data.driverLng && !isLocationStale && (
                <HStack
                  gap={1.5}
                  bg="rgba(34,197,94,0.12)"
                  px={3}
                  py={1}
                  borderRadius="full"
                  align="center"
                >
                  <Box w="8px" h="8px" borderRadius="full" bg="green.400"
                    css={{ animation: 'pulse 2s infinite' }} />
                  <Text fontSize="xs" fontWeight="600" color="green.400">
                    Live tracking active
                  </Text>
                </HStack>
              )}
              {data.status === 'en_route' && (
                <HStack
                  gap={1.5}
                  bg="rgba(249,115,22,0.12)"
                  px={3}
                  py={1}
                  borderRadius="full"
                  align="center"
                >
                  <Text fontSize="xs" fontWeight="600" color={c.accent}>
                    Driver on the way
                  </Text>
                </HStack>
              )}
              {data.status === 'arrived' && (
                <HStack
                  gap={1.5}
                  bg="rgba(34,197,94,0.12)"
                  px={3}
                  py={1}
                  borderRadius="full"
                  align="center"
                >
                  <Text fontSize="xs" fontWeight="600" color="green.400">
                    Driver at your location
                  </Text>
                </HStack>
              )}
              {data.status === 'in_progress' && (
                <HStack
                  gap={1.5}
                  bg="rgba(59,130,246,0.12)"
                  px={3}
                  py={1}
                  borderRadius="full"
                  align="center"
                >
                  <Text fontSize="xs" fontWeight="600" color="blue.400">
                    Work in progress
                  </Text>
                </HStack>
              )}
            </HStack>
          </Box>
        )}

        {/* Waiting for Driver Assignment */}
        {!hasDriverAssigned && data.status !== 'cancelled' && (
          <Box p={4} bg="rgba(249,115,22,0.08)" borderRadius="lg" textAlign="center">
            <Text fontWeight="500" color={c.accent} mb={1}>
              Assigning Your Driver
            </Text>
            <Text color={c.muted} fontSize="sm">
              We&apos;re finding the best available driver for you. This page will update automatically.
            </Text>
          </Box>
        )}

        {/* Customer Tools */}
        <Box
          p={4}
          bg={c.card}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={c.border}
          style={anim.fadeSlideUp('0.5s', '0.25s')}
        >
          <HStack justify="space-between" align="start" mb={3} gap={3} flexWrap="wrap">
            <Box>
              <Text fontWeight="800" color={c.text}>
                Quick actions
              </Text>
              <Text color={c.muted} fontSize="sm">
                Useful tools for this booking.
              </Text>
            </Box>
            {actionMessage && (
              <Text
                color={c.accent}
                fontSize="sm"
                fontWeight="800"
                bg="rgba(249,115,22,0.1)"
                borderRadius="full"
                px={3}
                py={1}
              >
                {actionMessage}
              </Text>
            )}
          </HStack>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
            <Button {...toolButtonStyles(true)} onClick={handleRefreshTracking} loading={isRefreshing}>
              <Box textAlign="left">
                <Text>Refresh tracking</Text>
                <Text fontSize="xs" color={c.muted} fontWeight="700">
                  Get the latest driver update
                </Text>
              </Box>
            </Button>

            <Button {...toolButtonStyles(Boolean(data.driverPhone))} asChild>
              <a
                href={`tel:${data.driverPhone ?? SUPPORT_PHONE_TEL}`}
                onClick={() => trackCallClick(data.driverPhone ? 'tracking_call_driver' : 'tracking_call_support_fallback')}
                style={{ width: '100%', textDecoration: 'none' }}
              >
                <Box textAlign="left">
                  <Text>{data.driverPhone ? 'Call driver' : 'Call support'}</Text>
                  <Text fontSize="xs" color={c.muted} fontWeight="700">
                    {data.driverPhone ?? SUPPORT_PHONE_DISPLAY}
                  </Text>
                </Box>
              </a>
            </Button>

            <Button {...toolButtonStyles()} onClick={handleOpenWhatsApp}>
              <Box textAlign="left">
                <Text>WhatsApp support</Text>
                <Text fontSize="xs" color={c.muted} fontWeight="700">
                  Opens with booking details
                </Text>
              </Box>
            </Button>

            <Button {...toolButtonStyles()} onClick={handleOpenIosApp}>
              <HStack gap={3} align="center">
                <AppleIcon size={22} />
                <Box textAlign="left">
                  <Text>{IOS_APP_NAME} iOS app</Text>
                  <Text fontSize="xs" color={c.muted} fontWeight="700">
                    Better tracking and faster booking
                  </Text>
                </Box>
              </HStack>
            </Button>

            <Button {...toolButtonStyles()} onClick={handleShareTracking}>
              <Box textAlign="left">
                <Text>Share tracking link</Text>
                <Text fontSize="xs" color={c.muted} fontWeight="700">
                  Send this live page to someone
                </Text>
              </Box>
            </Button>

            <Button {...toolButtonStyles()} onClick={handleCopyReference}>
              <Box textAlign="left">
                <Text>Copy booking ref</Text>
                <Text fontSize="xs" color={c.muted} fontWeight="700">
                  {refNumber}
                </Text>
              </Box>
            </Button>

            <Button {...toolButtonStyles()} onClick={handleOpenLocation} disabled={!locationHref}>
              <Box textAlign="left">
                <Text>Open booked location</Text>
                <Text fontSize="xs" color={c.muted} fontWeight="700">
                  View in Google Maps
                </Text>
              </Box>
            </Button>
          </SimpleGrid>
        </Box>

        {/* Location */}
        <Box>
          <Text fontWeight="600" mb={1}>
            Location
          </Text>
          <Text color={c.muted}>{data.addressLine}</Text>
          {data.bookingType === 'scheduled' && data.scheduledAt && (
            <Text color={c.muted} mt={1}>
              Scheduled for: {new Date(data.scheduledAt).toLocaleString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </Box>

        {/* Status Timeline */}
        <Box style={anim.slideInLeft('0.6s')}>
          <Text fontWeight="600" mb={4} color={c.text}>
            Status Updates
          </Text>
          <StatusTimeline history={data.statusHistory} currentStatus={data.status} />
        </Box>

        {/* Help */}
        <Box fontSize="sm" color={c.muted} textAlign="center" pt={4}>
          Need help? Call us on 0141 266 0690
        </Box>
      </VStack>
      </Container>
    </>
  );
}
