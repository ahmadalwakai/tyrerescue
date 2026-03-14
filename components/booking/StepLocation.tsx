'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, Text, Spinner, Input, Button } from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WizardState } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { inputProps } from '@/lib/design-tokens';
import { API } from '@/lib/api-endpoints';

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

interface LocationValidation {
  valid: boolean;
  distanceMiles: number;
  estimatedMinutes?: number;
  message: string;
}

interface StepLocationProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepLocation({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepLocationProps) {
  const [address, setAddress] = useState(state.address || '');
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<LocationValidation | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(
    state.lat && state.lng
      ? { lat: state.lat, lng: state.lng, address: state.address }
      : null,
  );

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const mapInitialized = useRef(false);

  // Initialize / update map when a location is confirmed
  useEffect(() => {
    if (!selectedLocation || !mapContainer.current) return;

    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [selectedLocation.lng, selectedLocation.lat],
        zoom: 14,
        interactive: false,
      });
      mapInitialized.current = true;
    } else {
      map.current.flyTo({
        center: [selectedLocation.lng, selectedLocation.lat],
        zoom: 14,
      });
    }

    if (marker.current) marker.current.remove();
    marker.current = new mapboxgl.Marker({ color: c.accent })
      .setLngLat([selectedLocation.lng, selectedLocation.lat])
      .addTo(map.current);

    return () => {
      // cleanup only on unmount
    };
  }, [selectedLocation]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Search for addresses via Mapbox geocoding
  const searchAddress = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    try {
      const encoded = encodeURIComponent(query);
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6&access_token=${token}`,
      );
      const data = await res.json();
      setSuggestions(data.features || []);
    } catch {
      // Address search failed — silent
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setShowSuggestions(true);
    setValidation(null);
    setSelectedLocation(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAddress(value), 250);
  };

  const selectAddress = async (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    const addr: string = feature.place_name;
    setAddress(addr);
    setSelectedLocation({ lat, lng, address: addr });
    setSuggestions([]);
    setShowSuggestions(false);
    await validateLocation(lat, lng, addr);
  };

  const clearSelection = () => {
    setSelectedLocation(null);
    setValidation(null);
    setAddress('');
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser');
      return;
    }
    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=gb&language=en&limit=1&access_token=${token}`,
          );
          const data = await res.json();
          const addr =
            data.features?.[0]?.place_name ||
            `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setAddress(addr);
          setSelectedLocation({ lat, lng, address: addr });
          await validateLocation(lat, lng, addr);
        } catch {
          const addr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          setAddress(addr);
          setSelectedLocation({ lat, lng, address: addr });
          await validateLocation(lat, lng, addr);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGeoError('Location access denied. Please type your address below.');
        } else {
          setGeoError('Unable to get your location. Please type your address below.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const validateLocation = async (lat: number, lng: number, addr: string) => {
    setIsValidating(true);
    setValidation(null);
    try {
      const res = await fetch(API.BOOKINGS_VALIDATE_LOCATION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, address: addr }),
      });
      const data = await res.json();
      setValidation(data);
      if (data.valid) setSelectedLocation({ lat, lng, address: addr });
    } catch {
      setValidation({
        valid: false,
        distanceMiles: 0,
        message: 'Unable to validate location. Please try again.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = () => {
    if (!selectedLocation || !validation?.valid) return;
    updateState({
      address: selectedLocation.address,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      distanceMiles: validation.distanceMiles,
    });
    goToNext();
  };

  const canContinue = !!selectedLocation && !!validation?.valid;

  return (
    <Box>
      {/* Header */}
      <Box mb={6} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Text
          fontSize="11px"
          fontWeight="500"
          letterSpacing="0.15em"
          color={c.accent}
          mb={2}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          STEP 2
        </Text>
        <Text
          color={c.text}
          lineHeight="1"
          mb={2}
          fontSize={{ base: '40px', md: '64px' }}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          WHERE ARE YOU?
        </Text>
        <Text
          fontSize="15px"
          color={c.muted}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          We come to you. Enter your address or postcode.
        </Text>
      </Box>

      {/* Location button */}
      {!selectedLocation && (
        <Box style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both' }}>
          <Button
            variant="outline"
            onClick={useCurrentLocation}
            disabled={isLocating}
            w="full"
            h="52px"
            bg={c.surface}
            borderColor={c.border}
            color={c.text}
            fontSize="15px"
            fontWeight={500}
            fontFamily="var(--font-body)"
            borderRadius="8px"
            _hover={{ borderColor: c.accent }}
          >
            {isLocating ? (
              <>
                <Spinner size="xs" mr={2} />
                Getting your location…
              </>
            ) : (
              '📍 Use My Current Location'
            )}
          </Button>

          {geoError && (
            <Text fontSize="13px" color={c.muted} mt={2} style={{ fontFamily: 'var(--font-body)' }}>
              {geoError}
            </Text>
          )}

          {/* Divider */}
          <Flex align="center" gap={3} my={4}>
            <Box flex={1} h="1px" bg={c.border} />
            <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
              or
            </Text>
            <Box flex={1} h="1px" bg={c.border} />
          </Flex>

          {/* Address input */}
          <Box position="relative">
            <Input
              {...inputProps}
              type="text"
              placeholder="Address or postcode…"
              value={address}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              aria-label="Address or postcode"
              aria-autocomplete="list"
            />

            {isSearching && (
              <Box position="absolute" right="14px" top="50%" style={{ transform: 'translateY(-50%)' }}>
                <Spinner size="xs" />
              </Box>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <Box
                position="absolute"
                top="100%"
                left={0}
                right={0}
                zIndex={9999}
                bg={c.card}
                border={`1px solid ${c.border}`}
                borderRadius="8px"
                overflow="hidden"
                maxH="240px"
                overflowY="auto"
                boxShadow="0 8px 32px rgba(0,0,0,0.4)"
                mt="2px"
              >
                {suggestions.map((feature) => {
                  const parts = feature.place_name.split(', ');
                  const main = parts[0];
                  const rest = parts.slice(1).join(', ');
                  return (
                    <Box
                      key={feature.id}
                      px={4}
                      py={3}
                      cursor="pointer"
                      borderBottom={`1px solid ${c.border}`}
                      _hover={{ bg: c.surface }}
                      onClick={() => selectAddress(feature)}
                    >
                      <Text fontSize="14px" color={c.text} style={{ fontFamily: 'var(--font-body)' }}>
                        {main}
                      </Text>
                      {rest && (
                        <Text fontSize="12px" color={c.muted} mt="2px" style={{ fontFamily: 'var(--font-body)' }}>
                          {rest}
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Selected address confirmation */}
      {selectedLocation && (
        <Box style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
          {/* Address card */}
          <Box
            bg={c.surface}
            border={`1px solid ${c.accent}`}
            borderRadius="8px"
            p="12px 16px"
          >
            <Flex justify="space-between" align="center" gap={3}>
              <Text fontSize="14px" color={c.text} style={{ fontFamily: 'var(--font-body)' }}>
                {selectedLocation.address}
              </Text>
              <Text
                as="button"
                fontSize="12px"
                color={c.accent}
                bg="transparent"
                border="none"
                cursor="pointer"
                flexShrink={0}
                _hover={{ textDecoration: 'underline' }}
                style={{ fontFamily: 'var(--font-body)' }}
                onClick={clearSelection}
              >
                Change
              </Text>
            </Flex>
          </Box>

          {/* Map preview — only when address confirmed */}
          <Box
            ref={mapContainer}
            h={{ base: '200px', md: '280px' }}
            borderRadius="8px"
            overflow="hidden"
            border={`1px solid ${c.border}`}
            mt={4}
            position="relative"
          />

          {/* Validation */}
          {isValidating && (
            <Flex gap={2} justify="center" py={4}>
              <Spinner size="sm" />
              <Text fontSize="14px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                Checking service area…
              </Text>
            </Flex>
          )}

          {validation && !isValidating && !validation.valid && (
            <Box
              mt={3}
              p={4}
              bg="rgba(239,68,68,0.1)"
              border="1px solid rgba(239,68,68,0.3)"
              borderRadius="8px"
            >
              <Text fontSize="14px" color="red.400" style={{ fontFamily: 'var(--font-body)' }}>
                This address is outside our service area. We cover Glasgow, Edinburgh and within 50 miles.
              </Text>
              <Text fontSize="13px" color="red.400" mt={1} style={{ fontFamily: 'var(--font-body)' }}>
                Call us:{' '}
                <a href="tel:01412660690" style={{ color: c.accent, textDecoration: 'none', fontWeight: 600 }}>
                  0141 266 0690
                </a>
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Navigation buttons */}
      <Flex gap={3} mt={5} style={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
        <Button
          variant="outline"
          onClick={goToPrev}
          flex={1}
          h="52px"
          bg="transparent"
          borderColor={c.border}
          borderRadius="6px"
          color={c.text}
          fontSize="15px"
          fontWeight={500}
          fontFamily="var(--font-body)"
          _hover={{ borderColor: c.accent }}
        >
          Back
        </Button>
        {canContinue && (
          <Button
            onClick={handleContinue}
            flex={1}
            h="52px"
            bg={c.accent}
            borderRadius="6px"
            color="#09090B"
            fontSize="20px"
            letterSpacing="0.05em"
            fontFamily="var(--font-display)"
            _hover={{ bg: c.accentHover }}
          >
            CONTINUE →
          </Button>
        )}
      </Flex>
    </Box>
  );
}
