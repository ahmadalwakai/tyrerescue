import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { api, ApiError } from '@/lib/api';
import {
  ASSISTED_CHAT_SERVICE_LABELS,
  buildBookingTyreLinePayload,
  compactAssistedChatTyreSize,
  createBookingTyreLine,
  ensureBookingTyreLines,
  isAssistedChatServiceOnly,
  normalizeAssistedChatTyreSize,
  summarizeBookingTyreLines,
  validateBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import type {
  AssistedChatDraft,
  AssistedChatTyreFitmentOption,
  AssistedChatTyreSize,
  AssistedChatVehicleFitmentLookupResponse,
  AssistedChatServiceType,
  BookingTyreLine,
  TyreSizeSuggestion,
} from '@/types/assisted-chat';
import { AppButton, FieldLabel, SectionCard } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

interface TyreLineCardProps {
  line: BookingTyreLine;
  index: number;
  required: boolean;
  serviceType: AssistedChatServiceType;
  stockSearchEnabled: boolean;
  onChange: (patch: Partial<BookingTyreLine>) => void;
  onRemove?: () => void;
}

const SERVICE_OPTIONS: ReadonlyArray<{
  value: AssistedChatServiceType;
  title: string;
  subtitle: string;
}> = [
  {
    value: 'fit',
    title: 'Replacement tyre',
    subtitle: 'Stocked replacement, fitting and travel.',
  },
  {
    value: 'repair',
    title: 'Tyre repair',
    subtitle: 'Puncture repair callout, no stock hold.',
  },
  {
    value: 'locking_nut',
    title: 'Locking wheel nut removal',
    subtitle: 'Break or remove the locking nut only.',
  },
  {
    value: 'assess',
    title: 'Unknown / inspection required',
    subtitle: 'Quote call-out, inspection and labour only.',
  },
];

function clampQuantity(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function displayTyreSize(size: AssistedChatTyreSize): string {
  return size.sizeDisplay ?? `${size.width}/${size.aspect}R${size.rim}${size.commercial ? 'C' : ''}`;
}

function fitmentLabel(option: AssistedChatTyreFitmentOption): string {
  const front = displayTyreSize(option.front);
  const rear = displayTyreSize(option.rear);
  return option.staggered && front !== rear ? `Front ${front} / Rear ${rear}` : front;
}

function fitmentSizeKey(option: AssistedChatTyreFitmentOption): string {
  const front = compactAssistedChatTyreSize(displayTyreSize(option.front));
  const rear = compactAssistedChatTyreSize(displayTyreSize(option.rear));
  return option.staggered && front !== rear ? `${front}|${rear}` : front;
}

function uniqueFitmentOptions(
  options: AssistedChatTyreFitmentOption[],
  recommendedOptionId: string | null,
): AssistedChatTyreFitmentOption[] {
  const uniqueOptions: AssistedChatTyreFitmentOption[] = [];
  const indexBySize = new Map<string, number>();
  options.forEach((option) => {
    const sizeKey = fitmentSizeKey(option);
    const existingIndex = indexBySize.get(sizeKey);
    if (existingIndex === undefined) {
      indexBySize.set(sizeKey, uniqueOptions.length);
      uniqueOptions.push(option);
      return;
    }
    if (option.id === recommendedOptionId) {
      uniqueOptions[existingIndex] = option;
    }
  });
  return uniqueOptions;
}

function compactRegistrationInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function vehicleLookupErrorMessage(error?: { code: string; message: string }): string {
  if (error?.code === 'not_found') {
    return 'Vehicle not found. Please check the registration number and try again.';
  }
  if (
    error?.code === 'network' ||
    error?.code === 'upstream_error' ||
    error?.code === 'malformed_response' ||
    error?.code === 'rate_limited' ||
    error?.code === 'unknown'
  ) {
    return 'Unable to retrieve vehicle details. Please try again.';
  }
  return error?.message ?? 'Unable to retrieve vehicle details. Please try again.';
}

function vehicleDescription(
  response: AssistedChatVehicleFitmentLookupResponse | null,
  draft: AssistedChatDraft,
  registrationInput: string,
): string | null {
  const responseVehicle = response?.vehicle ?? null;
  const draftVehicle =
    draft.vehicle && compactRegistrationInput(draft.vehicle.registrationNumber) === compactRegistrationInput(registrationInput)
      ? draft.vehicle
      : null;
  const vehicle = responseVehicle ?? draftVehicle;
  if (!vehicle) return null;
  const parts = [
    vehicle.make,
    vehicle.model,
    vehicle.yearOfManufacture ? String(vehicle.yearOfManufacture) : null,
    vehicle.colour,
  ].filter(Boolean);
  return parts.length > 0 ? `${vehicle.registrationNumber} - ${parts.join(' ')}` : vehicle.registrationNumber;
}

function TyreLineCard({ line, index, required, serviceType, stockSearchEnabled, onChange, onRemove }: TyreLineCardProps) {
  const isFit = serviceType === 'fit';
  const canSearchTyreSizes = isFit;
  const canCheckStockAvailability = isFit && stockSearchEnabled;
  const [sizeInput, setSizeInput] = useState(line.size);
  const [lastSize, setLastSize] = useState(line.size);
  if (lastSize !== line.size) {
    setLastSize(line.size);
    setSizeInput(line.size);
  }

  const [suggestions, setSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const localSizeEdit = useRef(false);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const search = useCallback(async (q: string) => {
    const requestSeq = ++searchSeq.current;
    const query = q.trim();
    if (!canSearchTyreSizes) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    if (query.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    try {
      const data = await api.get<{ sizes?: TyreSizeSuggestion[] }>(
        `/api/tyres/sizes?q=${encodeURIComponent(query)}`,
      );
      if (requestSeq === searchSeq.current) {
        setSuggestions(data.sizes ?? []);
        setSearched(true);
      }
    } catch {
      if (requestSeq === searchSeq.current) {
        setSuggestions([]);
        setSearched(true);
      }
    }
  }, [canSearchTyreSizes]);

  useEffect(() => {
    if (localSizeEdit.current) {
      localSizeEdit.current = false;
      return;
    }
    if (!canSearchTyreSizes || line.size.trim().length < 2) {
      searchSeq.current += 1;
      const resetTimer = setTimeout(() => {
        setSuggestions([]);
        setSearched(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }
    const searchTimer = setTimeout(() => {
      void search(line.size);
    }, 0);
    return () => clearTimeout(searchTimer);
  }, [canSearchTyreSizes, line.size, search]);

  const handleChange = (value: string) => {
    setSizeInput(value);
    localSizeEdit.current = true;
    onChange({ size: value });
    setShowSugs(canSearchTyreSizes);
    if (timer.current) clearTimeout(timer.current);
    if (canSearchTyreSizes && value.trim().length >= 2) {
      timer.current = setTimeout(() => search(value), 200);
    } else {
      searchSeq.current += 1;
      setSuggestions([]);
      setSearched(false);
    }
  };

  const select = (size: string) => {
    setSizeInput(size);
    localSizeEdit.current = true;
    onChange({ size });
    setShowSugs(false);
  };

  const setQty = (q: number) => {
    onChange({ quantity: clampQuantity(q) });
  };

  const normalizedInputSize = normalizeAssistedChatTyreSize(sizeInput);
  const compactInputSize = compactAssistedChatTyreSize(sizeInput);
  const matchedSuggestion = suggestions.find(
    (s) => compactAssistedChatTyreSize(s.size) === compactInputSize,
  );

  let stockLabel: string | null = null;
  let stockTone: 'ok' | 'warn' | 'err' | 'muted' = 'muted';
  let insufficientStock = false;
  if (canCheckStockAvailability && matchedSuggestion) {
    const count = matchedSuggestion.count;
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      stockLabel = 'Stock match found. Exact quantity will be confirmed by the system.';
      stockTone = 'muted';
    } else if (count <= 0) {
      stockLabel = 'Not available';
      stockTone = 'err';
    } else if (count < line.quantity) {
      stockLabel = `Only ${count} available`;
      stockTone = 'err';
      insufficientStock = true;
    } else if (count <= 2) {
      stockLabel = `Low stock (${count} available)`;
      stockTone = 'warn';
    } else {
      stockLabel = `In stock (${count} available)`;
      stockTone = 'ok';
    }
  } else if (canCheckStockAvailability && showSugs && searched && sizeInput.trim().length >= 2 && suggestions.length === 0) {
    stockLabel = 'No matching in-stock size';
    stockTone = 'err';
  }

  return (
    <View style={styles.tyreCard}>
      <View style={styles.tyreHeader}>
        <View style={styles.tyreHeaderCopy}>
          <Text style={styles.tyreTitle}>Tyre {index + 1}</Text>
          <Text style={styles.tyreSubtitle}>{required ? 'Required' : 'Optional'}</Text>
        </View>
        {!required && onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove tyre ${index + 1}`}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.removeBtnText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <FieldLabel>{isFit ? 'Size' : 'Affected tyre size'}</FieldLabel>
      <View>
        <TextInput
          value={sizeInput}
          onChangeText={handleChange}
          onFocus={() => setShowSugs(canSearchTyreSizes)}
          placeholder={isFit ? 'e.g. 205/55R16' : 'e.g. 205/55R16 if known'}
          placeholderTextColor={colors.subtle}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        {canSearchTyreSizes && showSugs && suggestions.length > 0 ? (
          <View style={styles.suggestionsBox}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={`${line.id}-${s.size}`}
                  onPress={() => select(s.size)}
                  android_ripple={{ color: colors.ripple }}
                  style={styles.suggestionItem}
                >
                  <Text style={styles.suggestionText}>
                    {s.size}
                    <Text style={styles.suggestionCount}>  {s.count} in stock</Text>
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {canSearchTyreSizes && showSugs && searched && suggestions.length === 0 && sizeInput.length >= 2 ? (
          <Text style={styles.empty}>No in-stock tyres match that size.</Text>
        ) : null}
        {sizeInput.trim().length > 0 && !normalizedInputSize ? (
          <Text style={styles.empty}>Enter the full tyre size before continuing.</Text>
        ) : null}
        {isFit && sizeInput.trim().length > 0 && normalizedInputSize && !stockSearchEnabled ? (
          <Text style={styles.empty}>Confirm this size against the tyre sidewall before booking.</Text>
        ) : null}
        {stockLabel ? (
          <Text
            style={[
              styles.stockLabel,
              stockTone === 'ok' && styles.stockOk,
              stockTone === 'warn' && styles.stockWarn,
              stockTone === 'err' && styles.stockErr,
              stockTone === 'muted' && styles.stockMuted,
            ]}
          >
            {stockLabel}
          </Text>
        ) : null}
        {insufficientStock ? (
          <Text style={styles.unavailable}>
            Lower the quantity or pick a different size before pricing.
          </Text>
        ) : null}
      </View>

      <View style={styles.quantityBlock}>
        <FieldLabel>{isFit ? 'Quantity' : 'Tyres to repair'}</FieldLabel>
        <View style={styles.qtyRow}>
          <AppButton
            label="-"
            variant="secondary"
            onPress={() => setQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            style={styles.qtyBtn}
          />
          <TextInput
            value={String(line.quantity)}
            onChangeText={(value) => {
              const parsed = Number.parseInt(value, 10);
              setQty(Number.isFinite(parsed) ? parsed : 1);
            }}
            keyboardType="numeric"
            selectTextOnFocus
            style={styles.qtyInput}
            accessibilityLabel={`Tyre ${index + 1} quantity`}
          />
          <AppButton
            label="+"
            variant="secondary"
            onPress={() => setQty(line.quantity + 1)}
            disabled={line.quantity >= 10}
            style={styles.qtyBtn}
          />
        </View>
      </View>
    </View>
  );
}

export function TyreSelectionSection({ draft, update }: Props) {
  const serviceType = draft.serviceType ?? 'fit';
  const isServiceOnly = isAssistedChatServiceOnly(serviceType);
  const tyreLines = ensureBookingTyreLines(draft.tyreLines);
  const summary = isServiceOnly ? [] : summarizeBookingTyreLines(tyreLines);
  const tyreLineError = isServiceOnly ? null : validateBookingTyreLines(tyreLines);
  const tyreSizeCanConfirmSidewall = !isServiceOnly && tyreLineError === null;
  const [registrationInput, setRegistrationInput] = useState((draft.vehicle?.registrationNumber ?? '').toUpperCase());
  const [vehicleLookup, setVehicleLookup] = useState<AssistedChatVehicleFitmentLookupResponse | null>(null);
  const [vehicleBusy, setVehicleBusy] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [fitmentSaveMessage, setFitmentSaveMessage] = useState<string | null>(null);
  const [fitmentSaveTone, setFitmentSaveTone] = useState<'muted' | 'ok' | 'err'>('muted');
  const vehicleLookupSeq = useRef(0);
  const vehicleLookupAbort = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const canConfirmSidewall = tyreSizeCanConfirmSidewall;
  const serviceOnlyNotice =
    serviceType === 'locking_nut'
      ? {
          title: 'Quote locking wheel nut removal without tyre stock.',
          text: 'No tyre size, tyre type, stock match or tyre price is required. The quote only includes call-out, locking wheel nut removal and labour.',
          summary: 'No tyre replacement or repair is included.',
        }
      : {
          title: 'Final tyre cost will be confirmed after inspection.',
          text: 'No tyre size, tyre type, stock match or tyre price is required. The quote only includes call-out, inspection and labour.',
          summary: 'Final tyre cost will be confirmed after inspection.',
        };

  useEffect(() => {
    const syncTimer = setTimeout(() => {
      setRegistrationInput((draft.vehicle?.registrationNumber ?? '').toUpperCase());
    }, 0);
    return () => clearTimeout(syncTimer);
  }, [draft.vehicle?.registrationNumber]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      vehicleLookupAbort.current?.abort();
    };
  }, []);

  const quoteResetPatch = {
    quote: null,
    priceNeedsRefresh: Boolean(draft.quote || draft.priceNeedsRefresh),
    paymentChoice: null,
    paymentLink: null,
    dispatchedRefNumber: null,
    dispatchedBookingId: null,
    savedQuoteId: null,
    savedQuoteRef: null,
  };

  const updateLines = (nextLines: BookingTyreLine[], resetSidewall = false) => {
    if (resetSidewall) {
      setFitmentSaveMessage(null);
      setFitmentSaveTone('muted');
    }
    update({
      tyreLines: ensureBookingTyreLines(nextLines),
      ...(resetSidewall ? { tyreConfirmedFromSidewall: false } : {}),
      ...quoteResetPatch,
    });
  };

  const updateServiceType = (nextServiceType: AssistedChatServiceType) => {
    if (nextServiceType === serviceType) return;
    update({
      serviceType: nextServiceType,
      ...quoteResetPatch,
    });
  };

  const updateLine = (index: number, patch: Partial<BookingTyreLine>) => {
    const resetSidewall = Object.prototype.hasOwnProperty.call(patch, 'size');
    updateLines(
      tyreLines.map((line, i) => (
        i === index
          ? {
              ...line,
              ...patch,
              quantity:
                patch.quantity != null
                  ? clampQuantity(patch.quantity)
                  : clampQuantity(line.quantity),
            }
          : line
      )),
      resetSidewall,
    );
  };

  const addLine = () => {
    updateLines([...tyreLines, createBookingTyreLine()], true);
  };

  const removeLine = (index: number) => {
    if (index === 0) return;
    updateLines(tyreLines.filter((_, i) => i !== index), true);
  };

  const runVehicleLookup = async () => {
    if (vehicleBusy) return;
    const registrationNumber = compactRegistrationInput(registrationInput);
    if (registrationNumber.length < 2) {
      setVehicleError('Enter the vehicle registration first.');
      return;
    }

    const seq = ++vehicleLookupSeq.current;
    vehicleLookupAbort.current?.abort();
    const controller = new AbortController();
    vehicleLookupAbort.current = controller;
    setVehicleBusy(true);
    setVehicleError(null);
    try {
      const data = await api.post<AssistedChatVehicleFitmentLookupResponse>(
        '/api/admin/vehicle-fitments/lookup',
        { registrationNumber },
        { signal: controller.signal },
      );
      if (!mountedRef.current || seq !== vehicleLookupSeq.current) return;
      setVehicleLookup(data);
      if (!data.ok) {
        setVehicleError(vehicleLookupErrorMessage(data.error));
        setFitmentSaveMessage(null);
        setFitmentSaveTone('muted');
        update({
          vehicle: null,
          tyreConfirmedFromSidewall: false,
          ...quoteResetPatch,
        });
        return;
      }
      if (!data.vehicle) throw new Error('empty-vehicle-response');
      setRegistrationInput(data.vehicle.registrationNumber.toUpperCase());
      setFitmentSaveMessage(null);
      setFitmentSaveTone('muted');
      update({
        vehicle: data.vehicle,
        tyreConfirmedFromSidewall: false,
        ...quoteResetPatch,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
      ) {
        return;
      }
      if (!mountedRef.current || seq !== vehicleLookupSeq.current) return;
      setVehicleLookup(null);
      setVehicleError('Unable to retrieve vehicle details. Please try again.');
      setFitmentSaveMessage(null);
      setFitmentSaveTone('muted');
      update({
        vehicle: null,
        tyreConfirmedFromSidewall: false,
        ...quoteResetPatch,
      });
    } finally {
      if (mountedRef.current && seq === vehicleLookupSeq.current) setVehicleBusy(false);
    }
  };

  const applyFitmentOption = (option: AssistedChatTyreFitmentOption) => {
    const frontSize = displayTyreSize(option.front);
    const rearSize = displayTyreSize(option.rear);
    const firstLine = tyreLines[0] ?? createBookingTyreLine({ id: 'tyre-1' });
    const currentVehicle = vehicleLookup?.vehicle ?? draft.vehicle;
    const optionLines = (option.tyreLines ?? [])
      .map((line, index) => {
        const size = displayTyreSize(line.size);
        const currentLine = tyreLines[index] ?? createBookingTyreLine({ id: `tyre-${index + 1}` });
        return createBookingTyreLine({
          ...currentLine,
          id: line.id ?? currentLine.id,
          size,
          quantity: clampQuantity(line.quantity || currentLine.quantity || 1),
          axle: line.axle ?? currentLine.axle ?? null,
          loadIndex: line.loadIndex ?? line.size.loadIndex ?? currentLine.loadIndex ?? null,
          speedIndex: line.speedIndex ?? line.size.speedIndex ?? currentLine.speedIndex ?? null,
          runFlat: line.runFlat ?? line.size.runFlat ?? currentLine.runFlat ?? null,
          xl: line.xl ?? line.size.xl ?? currentLine.xl ?? null,
          commercial: line.commercial ?? line.size.commercial ?? currentLine.commercial ?? null,
          source: option.sourceLabel,
        });
      })
      .filter((line) => line.size.trim());
    const nextLines =
      optionLines.length > 0
        ? optionLines
        : option.staggered && compactAssistedChatTyreSize(frontSize) !== compactAssistedChatTyreSize(rearSize)
        ? [
            createBookingTyreLine({
              ...firstLine,
              id: firstLine.id || 'tyre-front',
              size: frontSize,
              quantity: clampQuantity(firstLine.quantity || 1),
              axle: 'front',
              loadIndex: option.front.loadIndex ?? null,
              speedIndex: option.front.speedIndex ?? null,
              runFlat: option.front.runFlat ?? null,
              xl: option.front.xl ?? null,
              commercial: option.front.commercial ?? null,
              source: option.sourceLabel,
            }),
            createBookingTyreLine({
              ...(tyreLines[1] ?? {}),
              id: tyreLines[1]?.id || 'tyre-rear',
              size: rearSize,
              quantity: clampQuantity(tyreLines[1]?.quantity || 1),
              axle: 'rear',
              loadIndex: option.rear.loadIndex ?? null,
              speedIndex: option.rear.speedIndex ?? null,
              runFlat: option.rear.runFlat ?? null,
              xl: option.rear.xl ?? null,
              commercial: option.rear.commercial ?? null,
              source: option.sourceLabel,
            }),
          ]
        : [
            createBookingTyreLine({
              ...firstLine,
              size: frontSize,
              quantity: clampQuantity(firstLine.quantity || 1),
              loadIndex: option.front.loadIndex ?? null,
              speedIndex: option.front.speedIndex ?? null,
              runFlat: option.front.runFlat ?? null,
              xl: option.front.xl ?? null,
              commercial: option.front.commercial ?? null,
              source: option.sourceLabel,
            }),
            ...tyreLines.slice(1),
          ];
    update({
      vehicle: currentVehicle,
      tyreLines: ensureBookingTyreLines(nextLines),
      tyreConfirmedFromSidewall: false,
      ...quoteResetPatch,
    });
  };

  const saveConfirmedFitment = async () => {
    const vehicle = draft.vehicle;
    if (!vehicle?.registrationNumber) {
      setFitmentSaveTone('muted');
      setFitmentSaveMessage('Add a vehicle registration to save this as a verified fitment.');
      return;
    }

    const payloadLines = buildBookingTyreLinePayload(tyreLines);
    if (payloadLines.length === 0) return;

    setFitmentSaveTone('muted');
    setFitmentSaveMessage('Saving verified fitment for this registration...');
    try {
      const result = await api.post<{
        ok: boolean;
        saved?: boolean;
        sizeDisplay?: string;
        error?: { message?: string };
      }>('/api/admin/vehicle-fitments/confirm', {
        registrationNumber: vehicle.registrationNumber,
        vehicle,
        tyreLines: payloadLines.map((line) => ({
          id: line.id,
          size: line.size,
          quantity: line.quantity,
          axle: line.axle ?? null,
          loadIndex: line.loadIndex ?? null,
          speedIndex: line.speedIndex ?? null,
          runFlat: line.runFlat ?? null,
          xl: line.xl ?? null,
          commercial: line.commercial ?? null,
        })),
      });

      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Could not save verified fitment.');
      }

      setFitmentSaveTone('ok');
      setFitmentSaveMessage(
        result.saved
          ? `Saved ${result.sizeDisplay ?? 'this size'} as verified for ${vehicle.registrationNumber}.`
          : `${result.sizeDisplay ?? 'This size'} is already verified for ${vehicle.registrationNumber}.`,
      );
    } catch (error) {
      setFitmentSaveTone('err');
      setFitmentSaveMessage(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Could not save verified fitment.',
      );
    }
  };

  const toggleSidewallConfirmation = () => {
    if (!canConfirmSidewall) return;
    const nextConfirmed = !draft.tyreConfirmedFromSidewall;
    if (!nextConfirmed) {
      setFitmentSaveMessage(null);
      setFitmentSaveTone('muted');
    }
    update({
      tyreConfirmedFromSidewall: nextConfirmed,
      ...(nextConfirmed ? {} : quoteResetPatch),
    });
    if (nextConfirmed) {
      void saveConfirmedFitment();
    }
  };

  const vehicleText = vehicleDescription(vehicleLookup, draft, registrationInput);
  const recommendedOptionId = vehicleLookup?.tyreAssistance?.recommendedOptionId ?? null;
  const tyreOptions = uniqueFitmentOptions(vehicleLookup?.tyreOptions ?? [], recommendedOptionId);
  const lookupStates = vehicleLookup?.states ?? (vehicleLookup?.status ? [vehicleLookup.status] : []);
  const vehicleSourceLabel = (() => {
    if (!vehicleLookup) return null;
    if (!vehicleLookup.ok) return null;
    if (lookupStates.includes('dvla_resolved')) return 'DVLA vehicle found';
    return null;
  })();

  return (
    <SectionCard title="Service and tyre details">
      <View style={styles.servicePicker}>
        {SERVICE_OPTIONS.map((option) => {
          const selected = serviceType === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => updateServiceType(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.title}
              style={({ pressed }) => [
                styles.serviceOption,
                selected && styles.serviceOptionSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.serviceDot, selected && styles.serviceDotSelected]} />
              <View style={styles.serviceCopy}>
                <Text style={[styles.serviceTitle, selected && styles.serviceTitleSelected]}>
                  {option.title}
                </Text>
                <Text style={styles.serviceSubtitle}>{option.subtitle}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {isServiceOnly ? (
        <View style={styles.inspectNotice}>
          <Text style={styles.inspectNoticeTitle}>{serviceOnlyNotice.title}</Text>
          <Text style={styles.inspectNoticeText}>
            {serviceOnlyNotice.text}
          </Text>
        </View>
      ) : !tyreLines[0]?.size.trim() ? (
        <Text style={styles.empty}>
          {serviceType === 'fit'
            ? 'Enter the first tyre size to continue. Suggestions appear as you type.'
            : 'Enter the affected tyre size so the job details are clear for the driver.'}
        </Text>
      ) : null}

      {!isServiceOnly ? (
        <>
          <View style={styles.vehicleLookupCard}>
            <FieldLabel>Registration</FieldLabel>
            <View style={styles.vehicleLookupRow}>
              <TextInput
                value={registrationInput}
                onChangeText={(value) => {
                  setRegistrationInput(value.toUpperCase());
                  vehicleLookupSeq.current += 1;
                  vehicleLookupAbort.current?.abort();
                  setVehicleLookup(null);
                  setVehicleBusy(false);
                  setVehicleError(null);
                }}
                onSubmitEditing={() => {
                  void runVehicleLookup();
                }}
                placeholder="e.g. AB12CDE"
                placeholderTextColor={colors.subtle}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.input, styles.registrationInput]}
              />
              <AppButton
                label="Find vehicle"
                variant="secondary"
                onPress={runVehicleLookup}
                loading={vehicleBusy}
                style={styles.vehicleLookupButton}
              />
            </View>
            {vehicleError ? <Text style={styles.vehicleError}>{vehicleError}</Text> : null}
            {vehicleBusy ? <Text style={styles.vehicleAssistance}>Checking DVLA vehicle details...</Text> : null}
            {!vehicleLookup && !vehicleBusy ? (
              <Text style={styles.vehicleAssistance}>Enter a registration to load the DVLA vehicle.</Text>
            ) : null}
            {vehicleSourceLabel ? (
              <Text style={styles.lookupPill}>
                {vehicleSourceLabel}
              </Text>
            ) : null}
            {vehicleText ? (
              <View style={styles.vehicleResult}>
                <Text style={styles.vehicleResultLabel}>Vehicle</Text>
                <Text style={styles.vehicleResultText}>{vehicleText}</Text>
              </View>
            ) : null}
            {tyreOptions.length === 0 && vehicleLookup?.tyreAssistance?.summary ? (
              <Text style={styles.vehicleAssistance}>{vehicleLookup.tyreAssistance.summary}</Text>
            ) : null}
            {tyreOptions.length === 0
              ? vehicleLookup?.tyreAssistance?.warnings?.map((warning) => (
                  <Text key={warning} style={styles.vehicleWarning}>{warning}</Text>
                ))
              : null}
            {tyreOptions.length === 0
              ? vehicleLookup?.messages?.slice(0, 4).map((message) => (
                  <Text key={message} style={styles.vehicleAssistance}>{message}</Text>
                ))
              : null}
            {tyreOptions.length > 0 ? (
              <View style={styles.fitmentStack}>
                {tyreOptions.map((option) => {
                  const optionSize = fitmentLabel(option);
                  const selected =
                    compactAssistedChatTyreSize(tyreLines[0]?.size ?? '') ===
                    compactAssistedChatTyreSize(displayTyreSize(option.front));
                  const verified = option.id === recommendedOptionId;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Use tyre fitment ${optionSize}`}
                      onPress={() => applyFitmentOption(option)}
                      style={({ pressed }) => [
                        styles.fitmentOption,
                        verified && styles.fitmentRecommended,
                        selected && styles.fitmentSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.fitmentTitle}>{optionSize}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : vehicleLookup?.ok ? (
              <Text style={styles.empty}>No catalogue tyre size found. Enter the sidewall size manually.</Text>
            ) : null}
          </View>

          <View style={styles.cardStack}>
            {tyreLines.map((line, index) => (
              <TyreLineCard
                key={line.id}
                line={line}
                index={index}
                required={index === 0}
                serviceType={serviceType}
                stockSearchEnabled={draft.tyreConfirmedFromSidewall}
                onChange={(patch) => updateLine(index, patch)}
                onRemove={index === 0 ? undefined : () => removeLine(index)}
              />
            ))}
          </View>

          <View style={styles.addButtonWrap}>
            <AppButton
              label="+ Add another tyre"
              variant="secondary"
              onPress={addLine}
              fullWidth
            />
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: draft.tyreConfirmedFromSidewall, disabled: !canConfirmSidewall }}
            onPress={toggleSidewallConfirmation}
            style={({ pressed }) => [
              styles.sidewallConfirm,
              draft.tyreConfirmedFromSidewall && styles.sidewallConfirmActive,
              !canConfirmSidewall && styles.sidewallConfirmDisabled,
              pressed && canConfirmSidewall && styles.pressed,
            ]}
          >
            <View style={[styles.sidewallCheck, draft.tyreConfirmedFromSidewall && styles.sidewallCheckActive]}>
              {draft.tyreConfirmedFromSidewall ? <Text style={styles.sidewallCheckText}>OK</Text> : null}
            </View>
            <View style={styles.sidewallCopy}>
              <Text style={styles.sidewallTitle}>I confirmed this size from the tyre sidewall.</Text>
              <Text style={styles.sidewallText}>
                Confirm this size against the tyre sidewall before booking.
              </Text>
              {!canConfirmSidewall && tyreLineError ? (
                <Text style={styles.sidewallWarning}>{tyreLineError}</Text>
              ) : !draft.tyreConfirmedFromSidewall ? (
                <Text style={styles.sidewallWarning}>Confirm the sidewall before pricing.</Text>
              ) : null}
              {fitmentSaveMessage ? (
                <Text
                  style={[
                    styles.sidewallSaveStatus,
                    fitmentSaveTone === 'ok' && styles.sidewallSaveOk,
                    fitmentSaveTone === 'err' && styles.sidewallSaveErr,
                  ]}
                >
                  {fitmentSaveMessage}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </>
      ) : null}

      {summary.length > 0 || isServiceOnly ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Booking summary</Text>
          <Text style={styles.summaryLine}>Service: {ASSISTED_CHAT_SERVICE_LABELS[serviceType]}</Text>
          {isServiceOnly ? (
            <Text style={styles.summaryLine}>{serviceOnlyNotice.summary}</Text>
          ) : null}
          {!isServiceOnly && summary.length > 0 ? (
            <Text style={styles.summaryLine}>
              Sidewall: {draft.tyreConfirmedFromSidewall ? 'confirmed' : 'pending confirmation'}
            </Text>
          ) : null}
          {summary.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.summaryLine}>{line}</Text>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

const tyreCardShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 14px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)' } as ViewStyle,
  default: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
});

const styles = StyleSheet.create({
  servicePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  serviceOption: {
    flexGrow: 1,
    flexBasis: 170,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    ...tyreCardShadow,
  },
  serviceOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  serviceDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  serviceDotSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  serviceTitleSelected: { color: colors.accent },
  serviceSubtitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 4,
  },
  cardStack: { gap: space.md },
  tyreCard: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: space.sm,
    ...tyreCardShadow,
  },
  tyreHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  tyreHeaderCopy: { flex: 1, minWidth: 0 },
  tyreTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  tyreSubtitle: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  removeBtn: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  input: {
    minHeight: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
    ...tyreCardShadow,
  },
  vehicleLookupCard: {
    borderColor: colors.infoBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.md,
    ...tyreCardShadow,
  },
  vehicleLookupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  registrationInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    minWidth: 0,
    fontWeight: '900',
  },
  vehicleLookupButton: {
    flexGrow: 1,
    flexBasis: 132,
    minWidth: 132,
  },
  vehicleError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  vehicleResult: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.sm,
    gap: 2,
  },
  vehicleResultLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  vehicleResultText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  vehicleAssistance: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '600',
  },
  vehicleWarning: {
    color: colors.warning,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
  },
  lookupPill: {
    alignSelf: 'flex-start',
    color: colors.info,
    fontSize: fontSize.xs,
    fontWeight: '900',
    borderWidth: 1,
    borderColor: colors.infoBorder,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  fitmentStack: {
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    padding: 6,
    gap: 6,
  },
  fitmentOption: {
    minHeight: 42,
    justifyContent: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fitmentRecommended: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  fitmentSelected: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  fitmentTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: '900',
  },
  suggestionsBox: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    overflow: 'hidden',
    ...tyreCardShadow,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  suggestionText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  suggestionCount: { color: colors.subtle, fontWeight: '400' },
  empty: { marginTop: 6, color: colors.muted, fontSize: fontSize.xs },
  inspectNotice: {
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    padding: space.md,
    gap: 4,
  },
  inspectNoticeTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  inspectNoticeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
  },
  stockLabel: { marginTop: 6, fontSize: fontSize.xs, fontWeight: '600' },
  stockOk: { color: colors.success },
  stockWarn: { color: colors.warning },
  stockErr: { color: colors.danger },
  stockMuted: { color: colors.muted },
  unavailable: { marginTop: 6, color: colors.danger, fontSize: fontSize.xs, fontWeight: '600' },
  quantityBlock: { marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 56 },
  qtyInput: {
    minWidth: 64,
    flex: 1,
    minHeight: 48,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  addButtonWrap: { marginTop: space.md },
  sidewallConfirm: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    padding: space.md,
    ...tyreCardShadow,
  },
  sidewallConfirmActive: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  sidewallConfirmDisabled: {
    opacity: 0.72,
  },
  sidewallCheck: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
  },
  sidewallCheckActive: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  sidewallCheckText: {
    color: colors.accentText,
    fontSize: 10,
    fontWeight: '900',
  },
  sidewallCopy: { flex: 1, minWidth: 0 },
  sidewallTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  sidewallText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: 3,
  },
  sidewallWarning: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 5,
  },
  sidewallSaveStatus: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: 5,
  },
  sidewallSaveOk: { color: colors.success },
  sidewallSaveErr: { color: colors.danger },
  summaryBox: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: 4,
    ...tyreCardShadow,
  },
  summaryTitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
