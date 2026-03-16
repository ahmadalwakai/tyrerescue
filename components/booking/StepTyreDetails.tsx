'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Spinner,
  Image,
} from '@chakra-ui/react';
import { WizardState } from './types';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { API } from '@/lib/api-endpoints';

interface SizeSuggestion {
  size: string;
  count: number;
}

interface StepTyreDetailsProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepTyreDetails({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepTyreDetailsProps) {
  const [vehicleReg, setVehicleReg] = useState(state.vehicleReg || '');
  const [vehicleMake, setVehicleMake] = useState(state.vehicleMake || '');
  const [vehicleModel, setVehicleModel] = useState(state.vehicleModel || '');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [width, setWidth] = useState(state.tyreSize.width || '');
  const [aspect, setAspect] = useState(state.tyreSize.aspect || '');
  const [rim, setRim] = useState(state.tyreSize.rim || '');
  const [condition, setCondition] = useState<'repair' | 'replacement' | 'not_sure' | null>(
    state.conditionAssessment
  );
  const [lockingNut, setLockingNut] = useState<'has_key' | 'no_key' | 'standard'>(
    state.lockingNutStatus || 'standard'
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(state.tyrePhotoUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [repairQty, setRepairQty] = useState(state.quantity || 1);

  // Search autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SizeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sizeConfirm, setSizeConfirm] = useState<string | null>(null);
  const [popularSizes, setPopularSizes] = useState<SizeSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vehicle registration lookup
  const handleRegLookup = useCallback(async () => {
    const cleaned = vehicleReg.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 2) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupDone(false);
    try {
      const res = await fetch(`${API.VEHICLE_LOOKUP}?reg=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      if (data.make) setVehicleMake(data.make);
      if (data.model) setVehicleModel(data.model);
      setLookupDone(true);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }, [vehicleReg]);

  // Fetch popular sizes on mount
  useEffect(() => {
    fetch(API.TYRES_POPULAR_SIZES)
      .then((r) => r.json())
      .then((data: SizeSuggestion[]) => setPopularSizes(data))
      .catch(() => {});
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setSizeConfirm(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API.TYRES_SIZES}?q=${encodeURIComponent(val.trim())}`);
        const data: SizeSuggestion[] = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 500);
  }, []);

  // Fill size from suggestion
  const fillSize = useCallback((sizeStr: string) => {
    // parse "205/55/R16"
    const match = sizeStr.match(/^(\d+)\/(\d+)\/R(\d+)$/i);
    if (match) {
      setWidth(match[1]);
      setAspect(match[2]);
      setRim(match[3]);
      setSizeConfirm(sizeStr);
    }
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  // Real-time size display
  const sizeDisplay = width && aspect && rim
    ? `${width}/${aspect}/R${rim}`
    : 'Enter tyre size above';

  // Handle photo upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(API.UPLOAD_TYRE_PHOTO, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setPhotoUrl(data.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload photo';
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  // Validate and continue
  const canContinue = 
    width.length >= 3 &&
    aspect.length >= 2 &&
    rim.length >= 2 &&
    condition !== null;

  const handleContinue = () => {
    if (!canContinue) return;

    updateState({
      vehicleReg,
      vehicleMake,
      vehicleModel,
      tyreSize: { width, aspect, rim },
      conditionAssessment: condition,
      tyrePhotoUrl: photoUrl,
      lockingNutStatus: lockingNut,
      serviceType: condition === 'repair' ? 'repair' : condition === 'replacement' ? 'fit' : 'assess',
      quantity: condition === 'repair' ? repairQty : 1,
    });
    goToNext();
  };

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Tell us about your tyres
        </Text>
        <Text color={c.muted}>
          Help us prepare the right equipment and tyres
        </Text>
      </Box>

      {/* Vehicle Registration with Lookup */}
      <Box style={anim.fadeUp('0.5s', '0.1s')}>
        <Text fontWeight="500" mb={2}>
          Vehicle Registration (optional)
        </Text>
        <HStack gap={2}>
          <Input {...inputProps}
            size="lg"
            placeholder="AB12 CDE"
            value={vehicleReg}
            onChange={(e) => {
              setVehicleReg(e.target.value.toUpperCase());
              setLookupDone(false);
              setLookupError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && vehicleReg.replace(/\s+/g, '').length >= 2) {
                e.preventDefault();
                handleRegLookup();
              }
            }}
            maxLength={10}
            aria-label="Vehicle registration"
            flex={1}
          />
          <Button
            size="lg"
            colorPalette="orange"
            variant="outline"
            onClick={handleRegLookup}
            disabled={lookupLoading || vehicleReg.replace(/\s+/g, '').length < 2}
            minW="100px"
            flexShrink={0}
          >
            {lookupLoading ? <Spinner size="sm" /> : 'Lookup'}
          </Button>
        </HStack>
        <Text fontSize="xs" color={c.muted} mt={1}>
          Enter your reg and tap Lookup to auto-fill vehicle details
        </Text>
        {lookupError && (
          <Text fontSize="xs" color="red.400" mt={1}>
            {lookupError}
          </Text>
        )}
        {lookupDone && (vehicleMake || vehicleModel) && (
          <Box mt={2} p={3} bg="rgba(249,115,22,0.06)" border="1px solid" borderColor={c.accent} borderRadius="md">
            <Text fontSize="sm" color={c.accent} fontWeight="600">
              {[vehicleMake, vehicleModel].filter(Boolean).join(' ')}
            </Text>
            <Text fontSize="xs" color={c.muted} mt={0.5}>
              Vehicle identified — enter your tyre size below
            </Text>
          </Box>
        )}
      </Box>

      {/* Tyre Size */}
      <Box style={anim.fadeUp('0.5s', '0.2s')}>
        <Text fontWeight="500" mb={2}>
          Tyre Size
        </Text>

        {/* Size search autocomplete */}
        <Box position="relative" ref={searchRef} mb={3}>
          <Text fontSize="13px" color={c.muted} mb={1}>
            Search by size
          </Text>
          <Input
            height="48px"
            fontSize="16px"
            bg={c.input.bg}
            borderColor={c.input.border}
            color={c.input.text}
            _placeholder={{ color: c.input.placeholder }}
            _focus={{ borderColor: c.input.borderFocus, bg: c.input.bgFocus }}
            placeholder="Type size e.g. 205/55/R16 or just 205..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            aria-label="Search tyre size"
            aria-autocomplete="list"
          />
          {showSuggestions && suggestions.length > 0 && (
            <Box
              position="absolute"
              top="100%"
              left={0}
              right={0}
              zIndex={9999}
              bg={c.card}
              border="1px solid"
              borderColor={c.border}
              borderRadius="md"
              mt={1}
              overflow="hidden"
              boxShadow="0 8px 32px rgba(0,0,0,0.4)"
            >
              {suggestions.map((s) => (
                <Box
                  key={s.size}
                  as="button"
                  w="full"
                  px={4}
                  py={3}
                  textAlign="left"
                  _hover={{ bg: c.surface }}
                  onClick={() => fillSize(s.size)}
                  transition="background 0.15s"
                >
                  <Text fontSize="15px" color="white" fontWeight="500">
                    {s.size}
                  </Text>
                  <Text fontSize="12px" color={c.muted}>
                    {s.count} tyre{s.count !== 1 ? 's' : ''} available
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {sizeConfirm && (
          <Text fontSize="13px" color={c.accent} mb={2}>
            Size set to {sizeConfirm}
          </Text>
        )}

        <HStack gap={2} align="center">
          <Box flex="1">
            <Input {...inputProps}
              size="lg"
              placeholder="205"
              value={width}
              onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
              maxLength={3}
              textAlign="center"
              aria-label="Tyre width"
            />
            <Text fontSize="xs" color={c.muted} mt={1} textAlign="center">
              Width
            </Text>
          </Box>
          <Text fontSize="xl" fontWeight="600" color={c.muted} pb={4}>
            /
          </Text>
          <Box flex="1">
            <Input {...inputProps}
              size="lg"
              placeholder="55"
              value={aspect}
              onChange={(e) => setAspect(e.target.value.replace(/\D/g, ''))}
              maxLength={2}
              textAlign="center"
              aria-label="Tyre aspect ratio"
            />
            <Text fontSize="xs" color={c.muted} mt={1} textAlign="center">
              Aspect
            </Text>
          </Box>
          <Text fontSize="xl" fontWeight="600" color={c.muted} pb={4}>
            /R
          </Text>
          <Box flex="1">
            <Input {...inputProps}
              size="lg"
              placeholder="16"
              value={rim}
              onChange={(e) => setRim(e.target.value.replace(/\D/g, ''))}
              maxLength={2}
              textAlign="center"
              aria-label="Rim diameter"
            />
            <Text fontSize="xs" color={c.muted} mt={1} textAlign="center">
              Rim
            </Text>
          </Box>
        </HStack>

        {/* Size Preview */}
        <Box
          mt={3}
          p={3}
          bg={c.surface}
          borderRadius="md"
          textAlign="center"
        >
          <Text fontSize="lg" fontWeight="600" fontFamily="mono">
            {sizeDisplay}
          </Text>
        </Box>

        <Text fontSize="xs" color={c.muted} mt={2}>
          You can find the tyre size on the sidewall of your tyre
        </Text>

        {/* Popular sizes */}
        {popularSizes.length > 0 && (
          <Box mt={4}>
            <Text fontSize="11px" color={c.muted} letterSpacing="0.1em" mb={2}>
              POPULAR SIZES IN STOCK
            </Text>
            <HStack gap={2} flexWrap="wrap">
              {popularSizes.map((ps) => (
                <Box
                  key={ps.size}
                  as="button"
                  px={3}
                  py="6px"
                  fontSize="13px"
                  fontFamily="Inter, sans-serif"
                  bg={c.surface}
                  border="1px solid"
                  borderColor={c.border}
                  borderRadius="4px"
                  color={c.text}
                  _hover={{ borderColor: c.accent, color: c.accent }}
                  transition="all 0.15s"
                  onClick={() => fillSize(ps.size)}
                >
                  {ps.size}
                </Box>
              ))}
            </HStack>
          </Box>
        )}
      </Box>

      {/* Condition Assessment */}
      <Box style={anim.fadeUp('0.5s', '0.4s')}>
        <Text fontWeight="500" mb={2}>
          What do your tyres need?
        </Text>
        <VStack gap={2}>
          {/* Repair Option */}
          <Box
            as="button"
            w="full"
            p={4}
            borderWidth="2px"
            borderColor={condition === 'repair' ? c.accent : c.border}
            borderRadius="md"
            bg={condition === 'repair' ? 'rgba(249,115,22,0.1)' : c.surface}
            textAlign="left"
            onClick={() => setCondition('repair')}
            transition="all 0.2s"
            _hover={{ borderColor: c.accent }}
          >
            <Text fontWeight="600" color={condition === 'repair' ? c.accent : c.text}>
              Puncture repair
            </Text>
            <Text fontSize="sm" color={c.muted}>
              Small puncture, slow leak, or nail in tyre
            </Text>
          </Box>

          {/* Replacement Option */}
          <Box
            as="button"
            w="full"
            p={4}
            borderWidth="2px"
            borderColor={condition === 'replacement' ? c.accent : c.border}
            borderRadius="md"
            bg={condition === 'replacement' ? 'rgba(249,115,22,0.1)' : c.surface}
            textAlign="left"
            onClick={() => setCondition('replacement')}
            transition="all 0.2s"
            _hover={{ borderColor: c.accent }}
          >
            <Text fontWeight="600" color={condition === 'replacement' ? c.accent : c.text}>
              Tyre replacement
            </Text>
            <Text fontSize="sm" color={c.muted}>
              Damaged sidewall, blowout, or worn tread
            </Text>
          </Box>

          {/* Not Sure Option */}
          <Box
            as="button"
            w="full"
            p={4}
            borderWidth="2px"
            borderColor={condition === 'not_sure' ? c.accent : c.border}
            borderRadius="md"
            bg={condition === 'not_sure' ? 'rgba(249,115,22,0.1)' : c.surface}
            textAlign="left"
            onClick={() => setCondition('not_sure')}
            transition="all 0.2s"
            _hover={{ borderColor: c.accent }}
          >
            <Text fontWeight="600" color={condition === 'not_sure' ? c.accent : c.text}>
              Not sure
            </Text>
            <Text fontSize="sm" color={c.muted}>
              Let our driver assess and advise on arrival
            </Text>
          </Box>
        </VStack>
      </Box>

      {/* Repair Quantity Selector */}
      {condition === 'repair' && (
        <Box style={anim.fadeUp('0.5s', '0.42s')}>
          <Text
            fontSize="13px"
            color={c.muted}
            letterSpacing="0.1em"
            mb={3}
            fontFamily="Inter, sans-serif"
          >
            HOW MANY TYRES NEED REPAIR?
          </Text>
          <HStack gap={3}>
            {[1, 2, 3, 4].map((n) => (
              <Box
                key={n}
                as="button"
                w="56px"
                h="56px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                bg={repairQty === n ? 'rgba(249,115,22,0.08)' : c.card}
                border={repairQty === n ? '2px solid' : '1px solid'}
                borderColor={repairQty === n ? c.accent : c.border}
                borderRadius="8px"
                cursor="pointer"
                transition="all 0.15s"
                _hover={{ borderColor: c.accent }}
                onClick={() => setRepairQty(n)}
              >
                <Text
                  fontFamily="var(--font-display)"
                  fontSize="24px"
                  color={repairQty === n ? c.accent : c.text}
                >
                  {n}
                </Text>
              </Box>
            ))}
          </HStack>
        </Box>
      )}

      {/* Locking Wheel Nuts */}
      <Box style={anim.fadeUp('0.5s', '0.45s')}>
        <Text
          fontSize="13px"
          color={c.muted}
          letterSpacing="0.1em"
          mb={3}
        >
          LOCKING WHEEL NUTS
        </Text>

        <Box
          display="grid"
          gridTemplateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }}
          gap={3}
        >
          {/* Card 1 — Has key */}
          <Box
            as="button"
            p="20px"
            bg={lockingNut === 'has_key' ? 'rgba(249,115,22,0.06)' : c.surface}
            border="1px solid"
            borderColor={lockingNut === 'has_key' ? c.accent : c.border}
            borderRadius="8px"
            textAlign="left"
            onClick={() => setLockingNut('has_key')}
            transition="all 0.2s"
            _hover={{ borderColor: c.accent }}
          >
            <Text fontSize="16px" fontWeight="600" color={c.text}>
              Yes, I have it
            </Text>
            <Text fontSize="13px" color={c.muted} mt={1}>
              The locking nut key is in my car
            </Text>
          </Box>

          {/* Card 2 — No key */}
          <Box
            as="button"
            p="20px"
            bg={lockingNut === 'no_key' ? 'rgba(239,68,68,0.06)' : c.surface}
            border="1px solid"
            borderColor={lockingNut === 'no_key' ? 'red.400' : c.border}
            borderRadius="8px"
            textAlign="left"
            onClick={() => setLockingNut('no_key')}
            transition="all 0.2s"
            _hover={{ borderColor: 'red.400' }}
          >
            <Text fontSize="16px" fontWeight="600" color={c.text}>
              No, I don&apos;t have it
            </Text>
            <Text fontSize="13px" color={c.muted} mt={1}>
              I cannot find the locking nut key
            </Text>
          </Box>

          {/* Card 3 — Standard nuts */}
          <Box
            as="button"
            p="20px"
            bg={lockingNut === 'standard' ? c.surface : c.surface}
            border="1px solid"
            borderColor={lockingNut === 'standard' ? c.accent : c.border}
            borderRadius="8px"
            textAlign="left"
            onClick={() => setLockingNut('standard')}
            transition="all 0.2s"
            _hover={{ borderColor: c.accent }}
          >
            <Text fontSize="16px" fontWeight="600" color={c.text}>
              Standard nuts only
            </Text>
            <Text fontSize="13px" color={c.muted} mt={1}>
              No special key needed
            </Text>
          </Box>
        </Box>

        {lockingNut === 'no_key' && (
          <Box
            mt={3}
            p={4}
            bg="rgba(239,68,68,0.08)"
            border="1px solid rgba(239,68,68,0.25)"
            borderRadius="8px"
          >
            <Text fontSize="14px" color="red.300" lineHeight="1.6">
              Without the locking nut key, our driver may not be able to remove your wheel.
              Please search for it before the appointment, or call us to discuss options.
            </Text>
            <Text fontSize="14px" mt={2}>
              <a href="tel:01412660690" style={{ color: '#fc8181', fontWeight: 600 }}>
                0141 266 0690
              </a>
            </Text>
          </Box>
        )}
      </Box>

      {/* Photo Upload */}
      <Box style={anim.fadeUp('0.5s', '0.5s')}>
        <Text fontWeight="500" mb={2}>
          Photo of the tyre (optional)
        </Text>
        <Text fontSize="sm" color={c.muted} mb={3}>
          Helps our driver prepare and speeds up the job
        </Text>

        <Input {...inputProps}
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {photoUrl ? (
          <Box position="relative">
            <Image
              src={photoUrl}
              alt="Uploaded tyre photo"
              borderRadius="md"
              maxH="200px"
              objectFit="cover"
              w="full"
            />
            <Button
              size="sm"
              position="absolute"
              top={2}
              right={2}
              onClick={() => setPhotoUrl(null)}
            >
              Remove
            </Button>
          </Box>
        ) : (
          <Box
            as="button"
            w="full"
            p={8}
            borderWidth="2px"
            borderStyle="dashed"
            borderColor={c.border}
            borderRadius="md"
            textAlign="center"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            cursor={isUploading ? 'not-allowed' : 'pointer'}
            opacity={isUploading ? 0.7 : 1}
            _hover={!isUploading ? { borderColor: c.accent, bg: c.surface } : {}}
            transition="all 0.2s"
          >
            {isUploading ? (
              <VStack gap={2}>
                <Spinner size="md" />
                <Text color={c.muted}>Uploading...</Text>
              </VStack>
            ) : (
              <VStack gap={2}>
                <Text fontWeight="500" color={c.muted}>
                  Tap to upload photo
                </Text>
                <Text fontSize="sm" color={c.muted}>
                  JPEG or PNG, max 10MB
                </Text>
              </VStack>
            )}
          </Box>
        )}

        {uploadError && (
          <Text color="red.400" fontSize="sm" mt={2}>
            {uploadError}
          </Text>
        )}
      </Box>

      {/* Navigation */}
      <HStack gap={4} pt={4}>
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
          disabled={!canContinue}
          flex="1"
        >
          Continue
        </Button>
      </HStack>
    </VStack>
  );
}
