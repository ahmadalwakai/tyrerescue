'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, VStack, HStack, Input, Button, Flex, Spinner, Textarea } from '@chakra-ui/react';
import { QuickBookMap } from './QuickBookMap';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import {
  buildLocationCopyMessage,
  type LocationMessageContext,
} from '@/lib/quick-book-message-templates';

type LocationMethod = 'address' | 'link';
type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'polling' | 'finalizing';

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  locationMethod: LocationMethod;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  serviceType: 'fit' | 'repair' | 'assess';
  tyreSize: string;
  tyreCount: number;
  notes: string;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

interface TyreSizeSuggestion {
  size: string;
  count: number;
}

interface PricingLineItem {
  label: string;
  amount: number;
  type: string;
  quantity?: number;
  unitPrice?: number;
}

interface CreatedBooking {
  locationLink: string | null;
  whatsappLink: string | null;
  whatsappText: string | null;
  booking: {
    id: string;
    status: string;
    locationLat: string | null;
    locationLng: string | null;
    distanceKm: string | null;
    totalPrice: string | null;
    basePrice: string | null;
    surchargePercent: string | null;
    selectedTyreProductId: string | null;
    selectedTyreUnitPrice: string | null;
    selectedTyreBrand: string | null;
    selectedTyrePattern: string | null;
    priceBreakdown: {
      lineItems: PricingLineItem[];
      totalTyreCost: number;
      totalServiceFee: number;
      calloutFee: number;
      totalSurcharges: number;
      discountAmount: number;
      subtotal: number;
      vatAmount: number;
      total: number;
      serviceOrigin?: {
        lat: number;
        lng: number;
        source: 'driver' | 'garage';
        driverId: string | null;
        etaMinutes: number | null;
      } | null;
    } | null;
    adminAdjustmentAmount: string | null;
    adminAdjustmentReason: string | null;
  };
}

interface FinalizedResult {
  bookingId: string;
  refNumber: string;
  invoiceNumber: string;
  paymentMethod: 'stripe' | 'cash';
  paymentUrl: string | null;
  stripeClientSecret: string | null;
  breakdown: {
    subtotal: number;
    vatAmount: number;
    total: number;
    lineItems: { label: string; amount: number; type: string }[];
  };
}

const initialForm: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  locationMethod: 'address',
  locationAddress: '',
  locationLat: null,
  locationLng: null,
  serviceType: 'fit',
  tyreSize: '',
  tyreCount: 1,
  notes: '',
};

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (Array.isArray(nested.formErrors) && nested.formErrors.length > 0) {
      const first = nested.formErrors[0];
      if (typeof first === 'string' && first.trim()) return first;
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  return fallback;
}

export function QuickBookForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [finalized, setFinalized] = useState<FinalizedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // SMS send state
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Email send state
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  // Route/distance info (from map)
  const [routeInfo, setRouteInfo] = useState<{ drivingKm: number | null; drivingMinutes: number | null } | null>(null);

  const [isFinalizing, setIsFinalizing] = useState(false);

  // Admin price adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tyre size autocomplete
  const [tyreSuggestions, setTyreSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showTyreSuggestions, setShowTyreSuggestions] = useState(false);
  const tyreSizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Mapbox address autocomplete ──
  const searchAddress = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setIsSearchingAddress(true);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return;
      const encoded = encodeURIComponent(query);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6&access_token=${token}`
      );
      const data = await res.json();
      setAddressSuggestions(data.features || []);
    } catch { /* silent */ }
    finally { setIsSearchingAddress(false); }
  }, []);

  const handleAddressChange = (value: string) => {
    set('locationAddress', value);
    set('locationLat', null);
    set('locationLng', null);
    setShowSuggestions(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAddress(value), 250);
  };

  const selectAddress = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    setForm((f) => ({
      ...f,
      locationAddress: feature.place_name,
      locationLat: lat,
      locationLng: lng,
    }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Tyre size autocomplete from real DB ──
  const searchTyreSizes = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setTyreSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/tyres/sizes?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setTyreSuggestions(data.sizes || []);
      }
    } catch { /* silent */ }
  }, []);

  const handleTyreSizeChange = (value: string) => {
    set('tyreSize', value);
    setShowTyreSuggestions(true);
    if (tyreSizeTimeout.current) clearTimeout(tyreSizeTimeout.current);
    tyreSizeTimeout.current = setTimeout(() => searchTyreSizes(value), 200);
  };

  const selectTyreSize = (size: string) => {
    set('tyreSize', size);
    setTyreSuggestions([]);
    setShowTyreSuggestions(false);
  };

  // ── Submit quick booking ──
  const handleSubmit = useCallback(async () => {
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/admin/quick-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail || undefined,
          locationMethod: form.locationMethod,
          locationAddress: form.locationMethod === 'address' ? form.locationAddress : undefined,
          locationLat: form.locationLat ?? undefined,
          locationLng: form.locationLng ?? undefined,
          serviceType: form.serviceType,
          tyreSize: form.tyreSize || undefined,
          tyreCount: form.tyreCount,
          notes: form.notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessage(data, 'Failed to create booking'));
      }

      const data = await res.json();
      setCreated(data);
      setStatus(form.locationMethod === 'link' ? 'polling' : 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [form]);

  // ── Finalize into real booking ──
  const handleFinalize = useCallback(async (paymentMethod: 'stripe' | 'cash') => {
    if (!created?.booking.id) return;
    setIsFinalizing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessage(data, 'Failed to finalize booking'));
      }

      const data: FinalizedResult = await res.json();
      setFinalized(data);

      // If Stripe payment: redirect to Stripe checkout page
      // Use window.location.href for mobile compatibility (window.open is blocked on mobile)
      if (paymentMethod === 'stripe' && data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsFinalizing(false);
    }
  }, [created?.booking.id]);

  // ── Save admin price adjustment ──
  const handleSaveAdjustment = useCallback(async () => {
    if (!created?.booking.id) return;
    const amt = parseFloat(adjustmentAmount);
    if (isNaN(amt)) return;
    setAdjustmentSaving(true);
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAdjustmentAmount: amt,
          adminAdjustmentReason: adjustmentReason || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreated((prev) =>
          prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
        );
      }
    } catch { /* silent */ }
    finally { setAdjustmentSaving(false); }
  }, [created?.booking.id, adjustmentAmount, adjustmentReason]);

  const handleRemoveAdjustment = useCallback(async () => {
    if (!created?.booking.id) return;
    setAdjustmentSaving(true);
    try {
      const res = await fetch(`/api/admin/quick-book/${created.booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminAdjustmentAmount: 0,
          adminAdjustmentReason: '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreated((prev) =>
          prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
        );
        setAdjustmentAmount('');
        setAdjustmentReason('');
        setShowAdjustment(false);
      }
    } catch { /* silent */ }
    finally { setAdjustmentSaving(false); }
  }, [created?.booking.id]);

  // ── Poll for location updates when method is 'link' ──
  useEffect(() => {
    if (status !== 'polling' || !created?.booking.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/quick-book/${created.booking.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.booking.locationLat && data.booking.locationLng) {
            setCreated((prev) =>
              prev ? { ...prev, booking: { ...prev.booking, ...data.booking } } : prev
            );
            setStatus('success');
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, created?.booking.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSms = async () => {
    if (!created?.booking.id || smsSending) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: created.booking.id, method: 'sms' }),
      });
      const data = await res.json();
      setSmsResult({ ok: data.ok, message: data.message, error: data.error });
    } catch {
      setSmsResult({ ok: false, error: 'Network error' });
    } finally {
      setSmsSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!created?.booking.id || emailSending) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch('/api/admin/quick-book/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickBookingId: created.booking.id, method: 'email' }),
      });
      const data = await res.json();
      setEmailResult({ ok: data.ok, message: data.message, error: data.error });
    } catch {
      setEmailResult({ ok: false, error: 'Network error' });
    } finally {
      setEmailSending(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm);
    setCreated(null);
    setFinalized(null);
    setStatus('idle');
    setError('');
    setSmsSending(false);
    setSmsResult(null);
    setEmailSending(false);
    setEmailResult(null);
    setShowAdjustment(false);
    setAdjustmentAmount('');
    setAdjustmentReason('');
  };

  // ── Finalized success state ──
  if (finalized) {
    return (
      <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
        <VStack gap={4} align="stretch">
          <Flex align="center" gap={3}>
            <Text fontSize="32px">{finalized.paymentMethod === 'stripe' ? '💳' : '✅'}</Text>
            <Box>
              <Text color={c.text} fontSize="lg" fontWeight="600">
                {finalized.paymentMethod === 'stripe' ? 'Awaiting Stripe Payment' : 'Booking Created — Paid'}
              </Text>
              <Text color={c.accent} fontSize="md" fontWeight="700">{finalized.refNumber}</Text>
              {finalized.paymentMethod === 'stripe' && (
                <Text color={c.muted} fontSize="xs">Redirected to Stripe checkout page</Text>
              )}
            </Box>
          </Flex>

          <Box bg={c.surface} p={4} borderRadius="8px">
            <Text color={c.muted} fontSize="xs" mb={2}>Pricing Breakdown</Text>
            {finalized.breakdown.lineItems
              .filter((li) => li.type !== 'subtotal' && li.type !== 'vat' && li.type !== 'total')
              .map((li, i) => (
                <Flex key={i} justify="space-between" mb={1}>
                  <Text color={li.label.startsWith('Admin adjustment') ? '#F59E0B' : c.text} fontSize="sm">{li.label}</Text>
                  <Text color={li.amount < 0 ? '#22C55E' : li.label.startsWith('Admin adjustment') ? '#F59E0B' : c.text} fontSize="sm">
                    {li.amount < 0 ? '-' : ''}£{Math.abs(li.amount).toFixed(2)}
                  </Text>
                </Flex>
              ))}
            <Box borderTop={`1px solid ${c.border}`} mt={2} pt={2}>
              <Flex justify="space-between" mt={1}>
                <Text color={c.text} fontSize="md" fontWeight="700">Total</Text>
                <Text color={c.accent} fontSize="xl" fontWeight="700">
                  £{finalized.breakdown.total.toFixed(2)}
                </Text>
              </Flex>
            </Box>
          </Box>

          <Box bg={c.surface} p={3} borderRadius="8px">
            <Text color={c.muted} fontSize="xs">Invoice</Text>
            <Text color={c.text} fontSize="sm" fontWeight="600">{finalized.invoiceNumber}</Text>
          </Box>

          <HStack gap={3}>
            <a href={`/admin/bookings/${finalized.refNumber}`} style={{ flex: 1 }}>
              <Button w="100%" bg={c.accent} color="#09090B" h="48px" fontWeight="700" borderRadius="8px">
                View Booking
              </Button>
            </a>
            <Button
              flex={1}
              h="48px"
              variant="outline"
              borderColor={c.border}
              color={c.text}
              fontWeight="600"
              borderRadius="8px"
              onClick={handleReset}
            >
              New Booking
            </Button>
          </HStack>
        </VStack>
      </Box>
    );
  }

  // ── Success state (pre-finalize) ──
  if (status === 'success' && created) {
    const selectedTyreUnitPrice = created.booking.selectedTyreUnitPrice
      ? Number(created.booking.selectedTyreUnitPrice)
      : null;
    const hasTyreSnapshot =
      Boolean(created.booking.selectedTyreProductId) &&
      selectedTyreUnitPrice != null &&
      Number.isFinite(selectedTyreUnitPrice);
    const tyreLineTotal = hasTyreSnapshot
      ? selectedTyreUnitPrice! * form.tyreCount
      : 0;

    return (
      <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
        <VStack gap={5} align="stretch">
          <Flex align="center" gap={3}>
            <Text fontSize="32px">📋</Text>
            <Box>
              <Text color={c.text} fontSize="lg" fontWeight="600">Draft Created</Text>
              <Text color={c.muted} fontSize="sm">Ready to finalize into a real booking</Text>
            </Box>
          </Flex>

          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid ${hasTyreSnapshot ? '#22C55E' : '#64748B'}`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={2}>Pricing Mode</Text>
            <Text color={hasTyreSnapshot ? '#22C55E' : c.muted} fontSize="sm" fontWeight="600">
              {hasTyreSnapshot ? 'Includes tyre product pricing' : 'Service-only pricing'}
            </Text>
            {hasTyreSnapshot && (
              <VStack align="stretch" gap={1} mt={2}>
                <Text color={c.text} fontSize="sm">
                  {created.booking.selectedTyreBrand} {created.booking.selectedTyrePattern}
                </Text>
                <Text color={c.muted} fontSize="xs">
                  Unit price: £{selectedTyreUnitPrice!.toFixed(2)} x {form.tyreCount}
                </Text>
                <Text color={c.accent} fontSize="sm" fontWeight="700">
                  Tyre line: £{tyreLineTotal.toFixed(2)}
                </Text>
              </VStack>
            )}
          </Box>

          {/* ═══ LOCATION SECTION WITH MAP ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #3B82F6`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>📍 Customer Location</Text>
            
            {created.booking.locationLat ? (
              <VStack align="stretch" gap={4}>
                {/* ── LIVE MAP ── */}
                <Box borderRadius="8px" overflow="hidden" h="280px">
                  <QuickBookMap
                    customerLat={Number(created.booking.locationLat)}
                    customerLng={Number(created.booking.locationLng)}
                    serviceOriginLat={created.booking.priceBreakdown?.serviceOrigin?.lat}
                    serviceOriginLng={created.booking.priceBreakdown?.serviceOrigin?.lng}
                    serviceOriginSource={created.booking.priceBreakdown?.serviceOrigin?.source}
                    showRoute={true}
                    onRouteCalculated={(km, mins) => setRouteInfo({ drivingKm: km, drivingMinutes: mins })}
                  />
                </Box>

                {/* ── DISTANCE & ETA ── */}
                <Flex gap={4} wrap="wrap">
                  <Box flex={1} minW="120px" bg="rgba(34, 197, 94, 0.1)" p={3} borderRadius="8px">
                    <Text color={c.muted} fontSize="xs" mb={1}>🚗 Driving Distance</Text>
                    <Text color="#22C55E" fontSize="lg" fontWeight="700">
                      {routeInfo?.drivingKm
                        ? `${(routeInfo.drivingKm * 0.621371).toFixed(1)} mi`
                        : created.booking.distanceKm
                          ? `${(Number(created.booking.distanceKm) * 0.621371).toFixed(1)} mi`
                          : '—'}
                    </Text>
                    {(routeInfo?.drivingKm || created.booking.distanceKm) && (
                      <Text color={c.muted} fontSize="xs">
                        ({routeInfo?.drivingKm?.toFixed(1) || Number(created.booking.distanceKm).toFixed(1)} km)
                      </Text>
                    )}
                  </Box>
                  <Box flex={1} minW="120px" bg="rgba(249, 115, 22, 0.1)" p={3} borderRadius="8px">
                    <Text color={c.muted} fontSize="xs" mb={1}>⏱ ETA to Customer</Text>
                    <Text color={c.accent} fontSize="lg" fontWeight="700">
                      {routeInfo?.drivingMinutes ? `${routeInfo.drivingMinutes} min` : '—'}
                    </Text>
                    {!routeInfo?.drivingMinutes && (
                      <Text color={c.muted} fontSize="xs">Calculating...</Text>
                    )}
                  </Box>
                </Flex>

                {/* ── COORDINATES & ADDRESS ── */}
                <Box bg="rgba(59, 130, 246, 0.1)" p={3} borderRadius="8px">
                  <HStack justify="space-between" mb={2}>
                    <Text color={c.muted} fontSize="xs">Coordinates</Text>
                    <Text color="#22C55E" fontSize="xs" fontWeight="600">✓ Received</Text>
                  </HStack>
                  <HStack justify="space-between" align="center">
                    <Text color={c.text} fontSize="sm" fontFamily="monospace">
                      {Number(created.booking.locationLat).toFixed(6)}, {Number(created.booking.locationLng).toFixed(6)}
                    </Text>
                    <Button
                      size="xs"
                      bg={copiedCoords ? '#22C55E' : c.accent}
                      color="#09090B"
                      fontWeight="600"
                      onClick={() => {
                        const coords = `${Number(created.booking.locationLat).toFixed(6)}, ${Number(created.booking.locationLng).toFixed(6)}`;
                        navigator.clipboard.writeText(coords);
                        setCopiedCoords(true);
                        setTimeout(() => setCopiedCoords(false), 2000);
                      }}
                    >
                      {copiedCoords ? '✓ Copied' : '📋 Copy'}
                    </Button>
                  </HStack>
                  {form.locationAddress && (
                    <Text color={c.muted} fontSize="xs" mt={2}>
                      {form.locationAddress}
                    </Text>
                  )}
                </Box>

                {/* ── MAP ACTION BUTTONS ── */}
                <Box>
                  <Text color={c.muted} fontSize="xs" mb={2}>Quick Actions</Text>
                  <Flex gap={2} wrap="wrap">
                    <Button
                      size="sm"
                      bg="#4285F4"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://www.google.com/maps?q=${created.booking.locationLat},${created.booking.locationLng}`;
                        window.open(url, '_blank');
                      }}
                    >
                      🗺️ Google Maps
                    </Button>
                    <Button
                      size="sm"
                      bg="#34A853"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${created.booking.locationLat},${created.booking.locationLng}&travelmode=driving`;
                        window.open(url, '_blank');
                      }}
                    >
                      🚗 Get Directions
                    </Button>
                    <Button
                      size="sm"
                      bg="#1DA1F2"
                      color="white"
                      fontWeight="600"
                      onClick={() => {
                        const url = `https://waze.com/ul?ll=${created.booking.locationLat},${created.booking.locationLng}&navigate=yes`;
                        window.open(url, '_blank');
                      }}
                    >
                      📍 Waze
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={c.border}
                      color={c.text}
                      fontWeight="600"
                      onClick={() => {
                        const coords = `${Number(created.booking.locationLat).toFixed(6)}, ${Number(created.booking.locationLng).toFixed(6)}`;
                        navigator.clipboard.writeText(coords);
                        setCopiedCoords(true);
                        setTimeout(() => setCopiedCoords(false), 2000);
                      }}
                    >
                      {copiedCoords ? '✓ Copied' : '📋 Copy Coords'}
                    </Button>
                  </Flex>
                </Box>
              </VStack>
            ) : created.locationLink ? (
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text color={c.muted} fontSize="xs">Location Link (expires 2h)</Text>
                  <Text color="#F59E0B" fontSize="xs" fontWeight="600">⏳ Pending</Text>
                </HStack>
                <Text color={c.accent} fontSize="sm" wordBreak="break-all">
                  {created.locationLink}
                </Text>
                <Flex gap={2} wrap="wrap">
                  <Button
                    size="sm"
                    bg={c.accent}
                    color="#09090B"
                    fontWeight="600"
                    onClick={() => {
                      const ctx: LocationMessageContext = {
                        customerName: form.customerName,
                        locationLink: created.locationLink!,
                        serviceType: form.serviceType,
                      };
                      handleCopy(buildLocationCopyMessage(ctx));
                    }}
                  >
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </Button>
                  {created.whatsappLink && (
                    <a href={created.whatsappLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" bg="#25D366" color="white" fontWeight="600">
                        WhatsApp
                      </Button>
                    </a>
                  )}
                  <Button size="sm" bg="#3B82F6" color="white" fontWeight="600" onClick={handleSendSms} disabled={smsSending}>
                    {smsSending ? '⏳ Sending…' : '💬 SMS'}
                  </Button>
                  {form.customerEmail && (
                    <Button size="sm" bg="#8B5CF6" color="white" fontWeight="600" onClick={handleSendEmail} disabled={emailSending}>
                      {emailSending ? '⏳ Sending…' : '✉️ Email'}
                    </Button>
                  )}
                </Flex>
                {smsResult && (
                  <Text fontSize="xs" color={smsResult.ok ? 'green.500' : 'red.500'}>
                    {smsResult.ok ? '✅ SMS sent successfully' : `❌ SMS failed: ${smsResult.error}`}
                  </Text>
                )}
                {emailResult && (
                  <Text fontSize="xs" color={emailResult.ok ? 'green.500' : 'red.500'}>
                    {emailResult.ok ? '✅ Email sent successfully' : `❌ Email failed: ${emailResult.error}`}
                  </Text>
                )}
                <Text color={c.muted} fontSize="xs">
                  Send this link to the customer so they can share their GPS location
                </Text>
              </VStack>
            ) : (
              <Text color={c.muted} fontSize="sm">Address entered manually during booking</Text>
            )}
          </Box>

          {/* ═══ PRICING SECTION ═══ */}
          {created.booking.totalPrice && (
            <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #22C55E`}>
              <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>💰 Price Breakdown</Text>

              {/* Line items from pricing engine */}
              {created.booking.priceBreakdown?.lineItems
                ?.filter((li) => li.type !== 'subtotal' && li.type !== 'vat' && li.type !== 'total')
                .map((li, i) => (
                  <Flex key={i} justify="space-between" mb={1}>
                    <Text color={c.text} fontSize="sm">{li.label}</Text>
                    <Text color={li.amount < 0 ? '#22C55E' : c.text} fontSize="sm">
                      {li.amount < 0 ? '-' : ''}£{Math.abs(li.amount).toFixed(2)}
                    </Text>
                  </Flex>
                ))}

              <Box borderTop={`1px solid ${c.border}`} mt={2} pt={2}>
                <Flex justify="space-between">
                  <Text color={c.text} fontSize="md" fontWeight="700">Total</Text>
                  <Text color={c.accent} fontSize="xl" fontWeight="700">
                    £{Number(created.booking.totalPrice).toFixed(2)}
                  </Text>
                </Flex>
              </Box>

              {/* Fallback if no breakdown stored */}
              {!created.booking.priceBreakdown && (
                <Text color={c.muted} fontSize="xs" mt={1}>
                  Engine total: £{Number(created.booking.totalPrice).toFixed(2)}
                </Text>
              )}
            </Box>
          )}

          {/* ═══ ADMIN ADJUSTMENT ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft="3px solid #F59E0B">
            {!showAdjustment ? (
              <VStack gap={2} align="stretch">
                {created.booking.adminAdjustmentAmount && Number(created.booking.adminAdjustmentAmount) !== 0 ? (
                  <>
                    <Flex justify="space-between" align="center">
                      <Text color="#F59E0B" fontSize="sm" fontWeight="600">
                        ✓ Adjustment Applied (included in Fitting fee)
                      </Text>
                      <Text color="#F59E0B" fontSize="sm" fontWeight="700">
                        {Number(created.booking.adminAdjustmentAmount) >= 0 ? '+' : ''}£{Number(created.booking.adminAdjustmentAmount).toFixed(2)}
                      </Text>
                    </Flex>
                    {created.booking.adminAdjustmentReason && (
                      <Text color={c.muted} fontSize="xs">
                        Reason: {created.booking.adminAdjustmentReason}
                      </Text>
                    )}
                    <Button
                      w="100%"
                      variant="outline"
                      borderColor="#F59E0B"
                      color="#F59E0B"
                      fontWeight="600"
                      borderRadius="8px"
                      onClick={() => setShowAdjustment(true)}
                    >
                      ✏️ Edit Adjustment
                    </Button>
                  </>
                ) : (
                  <Button
                    w="100%"
                    variant="outline"
                    borderColor="#F59E0B"
                    color="#F59E0B"
                    fontWeight="600"
                    borderRadius="8px"
                    onClick={() => setShowAdjustment(true)}
                  >
                    ➕ Add Price Adjustment
                  </Button>
                )}
              </VStack>
            ) : (
              <VStack gap={3} align="stretch">
                <Text color={c.text} fontSize="sm" fontWeight="600">Manual Price Adjustment</Text>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount (e.g. 15.00)"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  {...inputProps}
                />
                <Input
                  placeholder="Reason (optional)"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  {...inputProps}
                />
                <HStack gap={2}>
                  <Button
                    flex={1}
                    bg="#F59E0B"
                    color="#09090B"
                    fontWeight="600"
                    borderRadius="8px"
                    onClick={handleSaveAdjustment}
                    disabled={adjustmentSaving || !adjustmentAmount}
                  >
                    {adjustmentSaving ? <Spinner size="xs" /> : 'Apply'}
                  </Button>
                  {created.booking.adminAdjustmentAmount && Number(created.booking.adminAdjustmentAmount) !== 0 && (
                    <Button
                      flex={1}
                      variant="outline"
                      borderColor="red.500"
                      color="red.400"
                      fontWeight="600"
                      borderRadius="8px"
                      onClick={handleRemoveAdjustment}
                      disabled={adjustmentSaving}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    color={c.muted}
                    onClick={() => setShowAdjustment(false)}
                  >
                    Cancel
                  </Button>
                </HStack>
              </VStack>
            )}
          </Box>

          {error && <Text color="red.400" fontSize="sm">{error}</Text>}

          {/* ═══ PAYMENT SECTION ═══ */}
          <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid ${c.accent}`}>
            <Text color={c.text} fontSize="sm" fontWeight="600" mb={3}>💳 Payment Method</Text>
            <VStack gap={2}>
              <HStack gap={3} w="100%">
                <Button
                  flex={1}
                  bg={c.accent}
                  color="#09090B"
                  h="56px"
                  fontWeight="700"
                  borderRadius="8px"
                  fontSize="15px"
                  onClick={() => handleFinalize('stripe')}
                  disabled={isFinalizing}
                >
                  {isFinalizing ? <Spinner size="sm" /> : '💳 Pay with Stripe'}
                </Button>
                <Button
                  flex={1}
                  bg="#22C55E"
                  color="white"
                  h="56px"
                  fontWeight="700"
                  borderRadius="8px"
                  fontSize="15px"
                  onClick={() => handleFinalize('cash')}
                  disabled={isFinalizing}
                >
                  {isFinalizing ? <Spinner size="sm" /> : '💵 Cash Collected'}
                </Button>
              </HStack>
              <Text color={c.muted} fontSize="xs" textAlign="center">
                Stripe opens Stripe checkout in new tab. Cash marks booking as paid.
              </Text>
            </VStack>
          </Box>

          <Button
            w="100%"
            h="44px"
            variant="outline"
            borderColor={c.border}
            color={c.muted}
            fontWeight="500"
            borderRadius="8px"
            onClick={handleReset}
          >
            Cancel / Start Over
          </Button>
        </VStack>
      </Box>
    );
  }

  // Polling state (waiting for customer location)
  if (status === 'polling' && created) {
    return (
      <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
        <VStack gap={6} align="stretch">
          <Flex align="center" gap={3}>
            <Spinner size="md" color={c.accent} />
            <Box>
              <Text color={c.text} fontSize="lg" fontWeight="600">
                Waiting for customer location
              </Text>
              <Text color={c.muted} fontSize="sm">Polling every 3 seconds...</Text>
            </Box>
          </Flex>

          {/* ═══ LOCATION SHARING SECTION ═══ */}
          {created.locationLink && (
            <Box bg={c.surface} p={4} borderRadius="8px" borderLeft={`3px solid #3B82F6`}>
              <Text color={c.text} fontSize="sm" fontWeight="600" mb={2}>📍 Location Link (send to customer)</Text>
              <Text color={c.accent} fontSize="sm" wordBreak="break-all" mb={3}>
                {created.locationLink}
              </Text>
              <Flex gap={2} wrap="wrap">
                <Button
                  size="sm"
                  bg={c.accent}
                  color="#09090B"
                  fontWeight="600"
                  onClick={() => {
                    const ctx: LocationMessageContext = {
                      customerName: form.customerName,
                      locationLink: created.locationLink!,
                      serviceType: form.serviceType,
                    };
                    handleCopy(buildLocationCopyMessage(ctx));
                  }}
                >
                  {copied ? '✓ Copied' : '📋 Copy Link'}
                </Button>
                {created.whatsappLink && (
                  <a href={created.whatsappLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" bg="#25D366" color="white" fontWeight="600">
                      WhatsApp
                    </Button>
                  </a>
                )}
                <Button size="sm" bg="#3B82F6" color="white" fontWeight="600" onClick={handleSendSms} disabled={smsSending}>
                  {smsSending ? '⏳ Sending…' : '💬 Text / SMS'}
                </Button>
                {form.customerEmail && (
                  <Button size="sm" bg="#8B5CF6" color="white" fontWeight="600" onClick={handleSendEmail} disabled={emailSending}>
                    {emailSending ? '⏳ Sending…' : '✉️ Email'}
                  </Button>
                )}
              </Flex>
              {smsResult && (
                <Text fontSize="xs" color={smsResult.ok ? 'green.500' : 'red.500'}>
                  {smsResult.ok ? '✅ SMS sent successfully' : `❌ SMS failed: ${smsResult.error}`}
                </Text>
              )}
              {emailResult && (
                <Text fontSize="xs" color={emailResult.ok ? 'green.500' : 'red.500'}>
                  {emailResult.ok ? '✅ Email sent successfully' : `❌ Email failed: ${emailResult.error}`}
                </Text>
              )}
              <Text color={c.muted} fontSize="xs" mt={2}>
                Customer clicks this link to share their GPS location with you
              </Text>
            </Box>
          )}

          <Button variant="ghost" color={c.muted} size="sm" onClick={handleReset}>
            Cancel / Start Over
          </Button>
        </VStack>
      </Box>
    );
  }

  // ── Main form ──
  return (
    <Box bg={c.card} p={6} borderRadius="12px" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
      <VStack gap={5} align="stretch">
        {/* Customer Details */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em">
          Customer
        </Text>
        <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
          <Input
            flex={1}
            placeholder="Name *"
            value={form.customerName}
            onChange={(e) => set('customerName', e.target.value)}
            {...inputProps}
          />
          <Input
            flex={1}
            placeholder="Phone *"
            value={form.customerPhone}
            onChange={(e) => set('customerPhone', e.target.value)}
            {...inputProps}
          />
        </Flex>
        <Input
          placeholder="Email (optional)"
          value={form.customerEmail}
          onChange={(e) => set('customerEmail', e.target.value)}
          {...inputProps}
        />

        {/* Location */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" mt={2}>
          Location
        </Text>
        <Flex gap={3}>
          {(['address', 'link'] as LocationMethod[]).map((m) => (
            <Box
              key={m}
              as="button"
              flex={1}
              p={4}
              borderRadius="8px"
              borderWidth="2px"
              borderColor={form.locationMethod === m ? c.accent : c.border}
              bg={form.locationMethod === m ? 'rgba(249,115,22,0.1)' : c.surface}
              color={form.locationMethod === m ? c.accent : c.text}
              cursor="pointer"
              transition="all 0.2s"
              textAlign="center"
              minH="48px"
              onClick={() => set('locationMethod', m)}
              _hover={{ borderColor: c.accent }}
            >
              <Text fontSize="lg" mb={1}>
                {m === 'address' ? '🏠' : '📍'}
              </Text>
              <Text fontSize="13px" fontWeight="600">
                {m === 'address' ? 'Enter Address' : 'Send Link'}
              </Text>
            </Box>
          ))}
        </Flex>

        {form.locationMethod === 'address' && (
          <Box position="relative" style={anim.fadeUp('0.3s')}>
            <Input
              placeholder="Start typing address or postcode..."
              value={form.locationAddress}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              {...inputProps}
            />
            {isSearchingAddress && (
              <Box position="absolute" right="12px" top="50%" transform="translateY(-50%)">
                <Spinner size="xs" color={c.accent} />
              </Box>
            )}
            {showSuggestions && addressSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                bg={c.card}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                mt={1}
                zIndex={10}
                maxH="240px"
                overflow="auto"
                boxShadow="0 8px 24px rgba(0,0,0,0.3)"
              >
                {addressSuggestions.map((s) => (
                  <Box
                    key={s.id}
                    px={4}
                    py={3}
                    cursor="pointer"
                    _hover={{ bg: c.surface }}
                    borderBottom={`1px solid ${c.border}`}
                    onMouseDown={() => selectAddress(s)}
                  >
                    <Text color={c.text} fontSize="sm">{s.place_name}</Text>
                  </Box>
                ))}
              </Box>
            )}
            {form.locationLat && (
              <Text color="#22C55E" fontSize="xs" mt={1}>
                ✓ Location confirmed ({form.locationLat.toFixed(4)}, {form.locationLng?.toFixed(4)})
              </Text>
            )}
          </Box>
        )}

        {form.locationMethod === 'link' && (
          <Box bg={c.surface} p={3} borderRadius="8px" style={anim.fadeUp('0.3s')}>
            <Text color={c.muted} fontSize="sm">
              A location sharing link will be generated. Send via WhatsApp or copy to clipboard.
              Expires in 2 hours.
            </Text>
          </Box>
        )}

        {/* Service */}
        <Text color={c.text} fontSize="sm" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" mt={2}>
          Service
        </Text>
        <Flex gap={3}>
          {(['fit', 'repair', 'assess'] as const).map((s) => (
            <Box
              key={s}
              as="button"
              flex={1}
              py={3}
              borderRadius="8px"
              borderWidth="2px"
              borderColor={form.serviceType === s ? c.accent : c.border}
              bg={form.serviceType === s ? 'rgba(249,115,22,0.1)' : c.surface}
              color={form.serviceType === s ? c.accent : c.text}
              cursor="pointer"
              transition="all 0.2s"
              textAlign="center"
              onClick={() => set('serviceType', s)}
              _hover={{ borderColor: c.accent }}
            >
              <Text fontSize="13px" fontWeight="600" textTransform="capitalize">
                {s === 'fit' ? 'Tyre Fitting' : s === 'repair' ? 'Repair' : 'Assessment'}
              </Text>
            </Box>
          ))}
        </Flex>

        <Flex gap={3}>
          <Box flex={1} position="relative">
            <Input
              placeholder="Tyre size e.g. 205/55R16"
              value={form.tyreSize}
              onChange={(e) => handleTyreSizeChange(e.target.value)}
              onFocus={() => setShowTyreSuggestions(true)}
              onBlur={() => setTimeout(() => setShowTyreSuggestions(false), 200)}
              {...inputProps}
            />
            {showTyreSuggestions && tyreSuggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                bg={c.card}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                mt={1}
                zIndex={10}
                maxH="200px"
                overflow="auto"
                boxShadow="0 8px 24px rgba(0,0,0,0.3)"
              >
                {tyreSuggestions.map((s) => (
                  <Box
                    key={s.size}
                    px={4}
                    py={3}
                    cursor="pointer"
                    _hover={{ bg: c.surface }}
                    borderBottom={`1px solid ${c.border}`}
                    onMouseDown={() => selectTyreSize(s.size)}
                  >
                    <Flex justify="space-between" align="center">
                      <Text color={c.text} fontSize="sm" fontWeight="600">{s.size}</Text>
                      <Text color={c.muted} fontSize="xs">{s.count} in stock</Text>
                    </Flex>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <Box w="100px">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.tyreCount}
              onChange={(e) => set('tyreCount', Math.max(1, parseInt(e.target.value) || 1))}
              textAlign="center"
              {...inputProps}
            />
            <Text color={c.muted} fontSize="xs" textAlign="center" mt={1}>Qty</Text>
          </Box>
        </Flex>

        <Textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          bg={c.input.bg}
          borderColor={c.input.border}
          color={c.input.text}
          fontSize="15px"
          borderRadius="6px"
          minH="80px"
          resize="vertical"
        />

        {error && <Text color="red.400" fontSize="sm">{error}</Text>}

        <Button
          w="100%"
          h="56px"
          bg={c.accent}
          color="#09090B"
          fontSize="16px"
          fontWeight="700"
          borderRadius="8px"
          _hover={{ bg: c.accentHover }}
          onClick={handleSubmit}
          disabled={
            status === 'submitting' ||
            !form.customerName ||
            !form.customerPhone ||
            (form.locationMethod === 'address' && !form.locationAddress)
          }
        >
          {status === 'submitting' ? <Spinner size="sm" /> : 'Create Quick Booking'}
        </Button>
      </VStack>
    </Box>
  );
}
