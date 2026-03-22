'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, VStack, Spinner, Input, Button } from '@chakra-ui/react';
import { useParams } from 'next/navigation';

type PageStatus = 'loading' | 'pending' | 'sharing' | 'success' | 'expired' | 'invalid' | 'already_shared' | 'error' | 'denied';

export default function LocatePage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<PageStatus>('loading');
  const [customerName, setCustomerName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function checkToken() {
      try {
        const res = await fetch(`/api/location-share/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setStatus('invalid');
          return;
        }
        if (data.status === 'expired') { setStatus('expired'); return; }
        if (data.status === 'already_shared') { setStatus('already_shared'); return; }
        setCustomerName(data.customerName || '');
        setStatus('pending');
      } catch {
        setStatus('error');
      }
    }
    checkToken();
  }, [token]);

  const submitLocation = useCallback(async (lat: number, lng: number) => {
    setStatus('sharing');
    try {
      const res = await fetch(`/api/location-share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to share location');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }, [token]);

  const handleShare = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('denied');
      return;
    }
    setStatus('sharing');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        submitLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [submitLocation]);

  const handleManualSubmit = useCallback(async () => {
    if (!manualAddress.trim()) return;
    // Geocode the address via a simple fetch
    setStatus('sharing');
    try {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(manualAddress)}.json?country=gb&limit=1&access_token=${mapboxToken}`
        );
        const data = await res.json();
        if (data.features?.length > 0) {
          const [lng, lat] = data.features[0].center;
          await submitLocation(lat, lng);
          return;
        }
      }
      // Fallback: submit address as text
      const res = await fetch(`/api/location-share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 55.8642, lng: -4.2518, address: manualAddress }),
      });
      if (res.ok) setStatus('success');
      else setStatus('error');
    } catch {
      setErrorMsg('Failed to submit address');
      setStatus('error');
    }
  }, [manualAddress, submitLocation, token]);

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
            style={{ fontFamily: 'var(--font-display, sans-serif)' }}
          >
            TYRE RESCUE
          </Text>
          <Text fontSize="12px" color="#A1A1AA" mt={1}>
            Mobile Tyre Fitting
          </Text>
        </Box>

        {status === 'loading' && (
          <VStack gap={4}>
            <Spinner size="lg" color="#F97316" />
            <Text color="#A1A1AA">Loading...</Text>
          </VStack>
        )}

        {status === 'pending' && (
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
              style={{ animation: 'pulseGlow 2s infinite' }}
            >
              📍 Share My Location
            </Button>
          </VStack>
        )}

        {status === 'sharing' && (
          <VStack gap={4}>
            <Spinner size="lg" color="#F97316" />
            <Text color="#A1A1AA">Sharing your location...</Text>
          </VStack>
        )}

        {status === 'success' && (
          <VStack gap={4}>
            <Text fontSize="48px">✅</Text>
            <Text color="#FAFAFA" fontSize="lg" fontWeight="600">
              Location shared!
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              Our team is on their way. You can close this page.
            </Text>
          </VStack>
        )}

        {status === 'denied' && (
          <VStack gap={4}>
            <Text color="#FAFAFA" fontSize="lg">
              Location access denied
            </Text>
            <Text color="#A1A1AA" fontSize="sm">
              Please enter your address manually:
            </Text>
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
              disabled={!manualAddress.trim()}
            >
              Submit Address
            </Button>
            <Button
              variant="ghost"
              color="#A1A1AA"
              size="sm"
              onClick={() => setStatus('pending')}
            >
              Try again
            </Button>
          </VStack>
        )}

        {status === 'expired' && (
          <VStack gap={4}>
            <Text fontSize="48px">⏰</Text>
            <Text color="#FAFAFA" fontSize="lg">Link expired</Text>
            <Text color="#A1A1AA" fontSize="sm">
              This location sharing link has expired. Please call us on{' '}
              <a href="tel:01412660690" style={{ color: '#F97316' }}>0141 266 0690</a>.
            </Text>
          </VStack>
        )}

        {status === 'already_shared' && (
          <VStack gap={4}>
            <Text fontSize="48px">✅</Text>
            <Text color="#FAFAFA" fontSize="lg">Already shared</Text>
            <Text color="#A1A1AA" fontSize="sm">
              Your location has already been received. Our team is on their way!
            </Text>
          </VStack>
        )}

        {status === 'invalid' && (
          <VStack gap={4}>
            <Text fontSize="48px">❌</Text>
            <Text color="#FAFAFA" fontSize="lg">Invalid link</Text>
            <Text color="#A1A1AA" fontSize="sm">
              This link is not valid. Please check the link or call us on{' '}
              <a href="tel:01412660690" style={{ color: '#F97316' }}>0141 266 0690</a>.
            </Text>
          </VStack>
        )}

        {status === 'error' && (
          <VStack gap={4}>
            <Text color="red.400">{errorMsg || 'Something went wrong'}</Text>
            <Button
              variant="ghost"
              color="#F97316"
              onClick={() => setStatus('pending')}
            >
              Retry
            </Button>
          </VStack>
        )}
      </Box>
    </Box>
  );
}
