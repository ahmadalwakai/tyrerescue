'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Spinner,
} from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WizardState } from './types';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

// Set Mapbox token
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
  const [suggestions, setSuggestions] = useState<any[]>([]);
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
      : null
  );

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: selectedLocation
        ? [selectedLocation.lng, selectedLocation.lat]
        : [-4.2206, 55.8547], // Glasgow
      zoom: selectedLocation ? 14 : 10,
    });

    // Add marker if location already selected
    if (selectedLocation) {
      marker.current = new mapboxgl.Marker({ color: c.accent })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .addTo(map.current);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update marker when location changes
  useEffect(() => {
    if (!map.current || !selectedLocation) return;

    // Remove existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Add new marker
    marker.current = new mapboxgl.Marker({ color: c.accent })
      .setLngLat([selectedLocation.lng, selectedLocation.lat])
      .addTo(map.current);

    // Fly to location
    map.current.flyTo({
      center: [selectedLocation.lng, selectedLocation.lat],
      zoom: 14,
    });
  }, [selectedLocation]);

  // Search for addresses
  const searchAddress = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&country=GB&types=address,poi&limit=5`
      );
      const data = await res.json();
      setSuggestions(data.features || []);
    } catch (e) {
      console.error('Address search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  const handleAddressChange = (value: string) => {
    setAddress(value);
    setShowSuggestions(true);
    setValidation(null);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      searchAddress(value);
    }, 300);
  };

  // Select address from suggestions
  const selectAddress = async (feature: any) => {
    const [lng, lat] = feature.center;
    const addr = feature.place_name;

    setAddress(addr);
    setSelectedLocation({ lat, lng, address: addr });
    setSuggestions([]);
    setShowSuggestions(false);

    // Validate location
    await validateLocation(lat, lng, addr);
  };

  // Use current location
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

        // Reverse geocode to get address
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&country=GB&limit=1`
          );
          const data = await res.json();
          const addr = data.features?.[0]?.place_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

          setAddress(addr);
          setSelectedLocation({ lat, lng, address: addr });

          // Validate location
          await validateLocation(lat, lng, addr);
        } catch (e) {
          console.error('Reverse geocoding failed:', e);
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
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError('Location access denied. Please enter your address manually.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError('Location unavailable. Please enter your address manually.');
            break;
          case error.TIMEOUT:
            setGeoError('Location request timed out. Please try again or enter your address manually.');
            break;
          default:
            setGeoError('Unable to get your location. Please enter your address manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Validate location against service area
  const validateLocation = async (lat: number, lng: number, addr: string) => {
    setIsValidating(true);
    setValidation(null);

    try {
      const res = await fetch('/api/bookings/validate-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, address: addr }),
      });

      const data = await res.json();
      setValidation(data);

      if (data.valid) {
        setSelectedLocation({ lat, lng, address: addr });
      }
    } catch (e) {
      console.error('Location validation failed:', e);
      setValidation({
        valid: false,
        distanceMiles: 0,
        message: 'Unable to validate location. Please try again.',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Continue to next step
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

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Where are you?
        </Text>
        <Text color={c.muted}>
          Enter your location so we can come to you
        </Text>
      </Box>

      {/* Current Location Button */}
      <Button
        size="lg"
        variant="outline"
        onClick={useCurrentLocation}
        disabled={isLocating}
        w="full"
      >
        {isLocating ? (
          <HStack gap={2}>
            <Spinner size="sm" />
            <Text>Getting your location...</Text>
          </HStack>
        ) : (
          'Use My Current Location'
        )}
      </Button>

      {geoError && (
        <Box
          p={3}
          bg="rgba(249,115,22,0.1)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="rgba(249,115,22,0.3)"
        >
          <Text fontSize="sm" color={c.accent}>
            {geoError}
          </Text>
        </Box>
      )}

      <Box textAlign="center">
        <Text fontSize="sm" color={c.muted}>
          or enter address manually
        </Text>
      </Box>

      {/* Address Input */}
      <Box position="relative" style={anim.fadeUp('0.5s', '0.1s')}>
        <Input {...inputProps}
          size="lg"
          placeholder="Start typing your address..."
          value={address}
          onChange={(e) => handleAddressChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <Box
            position="absolute"
            top="100%"
            left="0"
            right="0"
            zIndex="10"
            bg={c.surface}
            borderWidth="1px"
            borderColor={c.border}
            borderRadius="md"
            shadow="lg"
            maxH="200px"
            overflowY="auto"
          >
            {suggestions.map((feature) => (
              <Box
                key={feature.id}
                p={3}
                cursor="pointer"
                _hover={{ bg: c.card }}
                onClick={() => selectAddress(feature)}
              >
                <Text fontSize="sm" color={c.text}>{feature.place_name}</Text>
              </Box>
            ))}
          </Box>
        )}

        {isSearching && (
          <Box position="absolute" right="12px" top="50%" transform="translateY(-50%)">
            <Spinner size="sm" />
          </Box>
        )}
      </Box>

      {/* Map Preview */}
      <Box
        ref={mapContainer}
        h="250px"
        borderRadius="lg"
        overflow="hidden"
        borderWidth="1px"
        borderColor={c.border}
        style={anim.scaleIn('0.5s', '0.2s')}
      />

      {/* Validation Status */}
      {isValidating && (
        <HStack gap={2} justify="center" p={4}>
          <Spinner size="sm" />
          <Text color={c.muted}>Checking service area...</Text>
        </HStack>
      )}

      {validation && !isValidating && (
        <Box
          p={4}
          borderRadius="md"
          bg={validation.valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
          borderWidth="1px"
          borderColor={validation.valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}
        >
          <Text
            color={validation.valid ? 'green.400' : 'red.400'}
            fontWeight={validation.valid ? '500' : '600'}
          >
            {validation.message}
          </Text>
          {!validation.valid && (
            <Text fontSize="sm" color="red.400" mt={2}>
              Please call us on 0141 266 0690 and we will do our best to help.
            </Text>
          )}
        </Box>
      )}

      {/* Navigation */}
      <HStack gap={4} pt={4} style={anim.fadeUp('0.4s', '0.1s')}>
        <Button
          variant="outline"
          onClick={goToPrev}
          flex="1"
        >
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={handleContinue}
          disabled={!selectedLocation || !validation?.valid}
          flex="1"
        >
          Continue
        </Button>
      </HStack>
    </VStack>
  );
}
