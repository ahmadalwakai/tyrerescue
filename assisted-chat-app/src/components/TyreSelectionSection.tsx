import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { api } from '@/lib/api';
import {
  ASSISTED_CHAT_SERVICE_LABELS,
  compactAssistedChatTyreSize,
  createBookingTyreLine,
  ensureBookingTyreLines,
  isAssistedChatServiceOnly,
  normalizeAssistedChatTyreSize,
  summarizeBookingTyreLines,
} from '@/lib/assisted-chat-workflow';
import type {
  AssistedChatDraft,
  AssistedChatServiceType,
  AssistedChatTyreFitmentOption,
  AssistedChatTyreSize,
  AssistedChatVehicle,
  AssistedChatVehicleFitmentLookupResponse,
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

interface TyreProductPriceResult {
  sizeDisplay?: string | null;
  priceNew?: number | string | null;
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

function formatSuggestionPrice(suggestion: TyreSizeSuggestion): string | null {
  const min = suggestion.minPrice ?? suggestion.price ?? null;
  const max = suggestion.maxPrice ?? suggestion.price ?? min;
  if (typeof min !== 'number' || !Number.isFinite(min)) return null;
  if (typeof max === 'number' && Number.isFinite(max) && max > min) {
    return `from £${min.toFixed(2)}`;
  }
  return `£${min.toFixed(2)}`;
}

function suggestionHasPrice(suggestion: TyreSizeSuggestion): boolean {
  return formatSuggestionPrice(suggestion) !== null;
}

function parseSearchWidth(value: string): number | null {
  const width = Number.parseInt(value.trim().match(/\d{3}/)?.[0] ?? '', 10);
  return Number.isFinite(width) && width >= 100 && width <= 400 ? width : null;
}

function toFinitePrice(value: TyreProductPriceResult['priceNew']): number | null {
  const price = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
  return Number.isFinite(price) ? price : null;
}

function formatLookupTyreSize(size: AssistedChatTyreSize): string {
  const display = size.sizeDisplay?.trim();
  if (display) return normalizeAssistedChatTyreSize(display) ?? display;

  const width = String(size.width ?? '').trim();
  const aspect = String(size.aspect ?? '').trim();
  const rim = String(size.rim ?? '').trim().replace(/^R/i, '');
  const commercialSuffix = size.commercial ? 'C' : '';
  const raw = aspect ? `${width}/${aspect}/R${rim}${commercialSuffix}` : `${width}/R${rim}${commercialSuffix}`;
  return normalizeAssistedChatTyreSize(raw) ?? raw;
}

function normalizeLineMetadata(line: BookingTyreLine): BookingTyreLine {
  return {
    ...line,
    axle: line.axle ?? null,
    loadIndex: line.loadIndex ?? null,
    speedIndex: line.speedIndex ?? null,
    runFlat: line.runFlat ?? null,
    xl: line.xl ?? null,
    commercial: line.commercial ?? null,
    brand: line.brand ?? null,
    pattern: line.pattern ?? null,
    season: line.season ?? null,
    source: line.source ?? null,
    price: line.price ?? null,
  };
}

function tyreLineFromLookupSize(
  id: string,
  size: AssistedChatTyreSize,
  quantity: number,
  axle: string | null = null,
): BookingTyreLine {
  return normalizeLineMetadata(createBookingTyreLine({
    id,
    size: formatLookupTyreSize(size),
    quantity,
    axle,
    loadIndex: size.loadIndex ?? null,
    speedIndex: size.speedIndex ?? null,
    runFlat: size.runFlat ?? null,
    xl: size.xl ?? null,
    commercial: size.commercial ?? null,
    source: size.source ?? null,
  }));
}

function tyreLinesFromFitmentOption(
  option: AssistedChatTyreFitmentOption,
  existingLines: BookingTyreLine[],
): BookingTyreLine[] {
  if (option.tyreLines?.length) {
    return option.tyreLines.map((line, index) =>
      normalizeLineMetadata(createBookingTyreLine({
        id: line.id || existingLines[index]?.id || `tyre-${index + 1}`,
        size: formatLookupTyreSize(line.size),
        quantity: line.quantity,
        axle: line.axle ?? null,
        loadIndex: line.loadIndex ?? line.size.loadIndex ?? null,
        speedIndex: line.speedIndex ?? line.size.speedIndex ?? null,
        runFlat: line.runFlat ?? line.size.runFlat ?? null,
        xl: line.xl ?? line.size.xl ?? null,
        commercial: line.commercial ?? line.size.commercial ?? null,
        source: line.size.source ?? option.source ?? null,
      })),
    );
  }

  const lines = [
    tyreLineFromLookupSize(existingLines[0]?.id || 'tyre-1', option.front, existingLines[0]?.quantity || 1, option.staggered ? 'front' : null),
  ];

  if (option.staggered) {
    lines.push(
      tyreLineFromLookupSize(existingLines[1]?.id || 'tyre-2', option.rear, existingLines[1]?.quantity || 1, 'rear'),
    );
  }

  return lines;
}

async function enrichSuggestionsWithTyrePrices(
  query: string,
  suggestions: TyreSizeSuggestion[],
): Promise<TyreSizeSuggestion[]> {
  if (suggestions.length === 0 || suggestions.every(suggestionHasPrice)) return suggestions;

  const width = parseSearchWidth(query);
  if (width === null) return suggestions;

  try {
    const data = await api.get<{ tyres?: TyreProductPriceResult[] }>(
      `/api/tyres?width=${encodeURIComponent(String(width))}&limit=100`,
    );
    const priceBySize = new Map<string, { minPrice: number; maxPrice: number }>();
    for (const tyre of data.tyres ?? []) {
      if (!tyre.sizeDisplay) continue;
      const price = toFinitePrice(tyre.priceNew);
      if (price === null) continue;

      const key = compactAssistedChatTyreSize(tyre.sizeDisplay);
      const existing = priceBySize.get(key);
      priceBySize.set(key, {
        minPrice: existing ? Math.min(existing.minPrice, price) : price,
        maxPrice: existing ? Math.max(existing.maxPrice, price) : price,
      });
    }

    return suggestions.map((suggestion) => {
      if (suggestionHasPrice(suggestion)) return suggestion;
      const prices = priceBySize.get(compactAssistedChatTyreSize(suggestion.size));
      return prices
        ? { ...suggestion, price: prices.minPrice, minPrice: prices.minPrice, maxPrice: prices.maxPrice }
        : suggestion;
    });
  } catch {
    return suggestions;
  }
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
        const enriched = await enrichSuggestionsWithTyrePrices(query, data.sizes ?? []);
        if (requestSeq === searchSeq.current) {
          setSuggestions(enriched);
          setSearched(true);
        }
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
              {suggestions.map((s) => {
                const priceLabel = formatSuggestionPrice(s);
                return (
                  <Pressable
                    key={`${line.id}-${s.size}`}
                    onPress={() => select(s.size)}
                    android_ripple={{ color: colors.ripple }}
                    style={styles.suggestionItem}
                  >
                    <View style={styles.suggestionCopy}>
                      <View style={styles.suggestionTopRow}>
                        <Text style={styles.suggestionText} numberOfLines={1}>{s.size}</Text>
                        {priceLabel ? <Text style={styles.suggestionPrice} numberOfLines={1}>{priceLabel}</Text> : null}
                      </View>
                      <Text style={styles.suggestionCount}>{s.count} in stock</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        {canSearchTyreSizes && showSugs && searched && suggestions.length === 0 && sizeInput.length >= 2 ? (
          <Text style={styles.empty}>No in-stock tyres match that size.</Text>
        ) : null}
        {sizeInput.trim().length > 0 && !normalizedInputSize ? (
          <Text style={styles.empty}>Enter the full tyre size before continuing.</Text>
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
  const draftVehicleRegistration = draft.vehicle?.registrationNumber ?? '';
  const [vehicleRegInput, setVehicleRegInput] = useState(draftVehicleRegistration);
  const [vehicleRegTouched, setVehicleRegTouched] = useState(false);
  const displayedVehicleReg = vehicleRegTouched ? vehicleRegInput : (vehicleRegInput || draftVehicleRegistration);
  const [vehicleLookupLoading, setVehicleLookupLoading] = useState(false);
  const [vehicleLookupMessage, setVehicleLookupMessage] = useState<string | null>(null);
  const [vehicleLookupError, setVehicleLookupError] = useState<string | null>(null);
  const [fitmentOptions, setFitmentOptions] = useState<AssistedChatTyreFitmentOption[]>([]);
  const vehicleLookupSeq = useRef(0);
  const vehicleLookupAbort = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      vehicleLookupSeq.current += 1;
      vehicleLookupAbort.current?.abort();
    };
  }, []);

  const updateLines = (nextLines: BookingTyreLine[], resetSidewall = false) => {
    update({
      tyreLines: ensureBookingTyreLines(nextLines).map(normalizeLineMetadata),
      ...(resetSidewall ? { tyreConfirmedFromSidewall: false } : {}),
      ...quoteResetPatch,
    });
  };

  const applyFitmentOption = (option: AssistedChatTyreFitmentOption) => {
    update({
      tyreLines: tyreLinesFromFitmentOption(option, tyreLines),
      tyreConfirmedFromSidewall: false,
      ...quoteResetPatch,
    });
    setVehicleLookupMessage(`Applied ${option.label}. Confirm this size against the tyre sidewall before booking.`);
  };

  const lookupVehicleFitment = async () => {
    const registrationNumber = displayedVehicleReg.trim().toUpperCase().replace(/\s+/g, '');
    if (!registrationNumber) {
      setVehicleLookupError('Enter the vehicle registration before lookup.');
      return;
    }

    vehicleLookupSeq.current += 1;
    const seq = vehicleLookupSeq.current;
    vehicleLookupAbort.current?.abort();
    const controller = new AbortController();
    vehicleLookupAbort.current = controller;
    setVehicleLookupLoading(true);
    setVehicleLookupError(null);
    setVehicleLookupMessage(null);
    setFitmentOptions([]);

    try {
      const result = await api.post<AssistedChatVehicleFitmentLookupResponse>(
        '/api/admin/vehicle-fitments/lookup',
        { registrationNumber },
        { signal: controller.signal },
      );
      if (!mountedRef.current || seq !== vehicleLookupSeq.current) return;

      const vehicle: AssistedChatVehicle | null = result.vehicle ?? result.localVehicle ?? null;
      const rawOptions = result.tyreOptions ?? [];

      // Sort: OEM + high confidence first, then by confidence ranking
      const confidenceRank = (opt: AssistedChatTyreFitmentOption): number => {
        const base = opt.oem ? 100 : opt.optional ? 0 : 50;
        const conf = opt.confidence === 'high' ? 30 : opt.confidence === 'medium' ? 10 : 0;
        return base + conf;
      };
      const options = [...rawOptions].sort((a, b) => confidenceRank(b) - confidenceRank(a));
      setFitmentOptions(options);

      const patch: Partial<AssistedChatDraft> = {
        ...(vehicle ? { vehicle } : {}),
        ...quoteResetPatch,
      };

      if (options.length === 1) {
        patch.tyreLines = tyreLinesFromFitmentOption(options[0], tyreLines);
        patch.tyreConfirmedFromSidewall = false;
      } else if (result.tyreSize) {
        patch.tyreLines = [
          tyreLineFromLookupSize(tyreLines[0]?.id || 'tyre-1', result.tyreSize, tyreLines[0]?.quantity || 1),
        ];
        patch.tyreConfirmedFromSidewall = false;
      }

      if (Object.keys(patch).length > Object.keys(quoteResetPatch).length) {
        update(patch);
      }

      if (options.length > 1) {
        const hasOem = options.some((o) => o.oem);
        setVehicleLookupMessage(
          hasOem
            ? 'Multiple wheel fitments found for this model. The OEM (original) option is shown first — choose the one matching your vehicle\'s trim.'
            : 'Multiple fitments found for this model year. Choose the variant that matches your vehicle, then confirm against the tyre sidewall.',
        );
      } else if (patch.tyreLines) {
        setVehicleLookupMessage('Tyre size applied. Confirm this size against the tyre sidewall before booking.');
      } else {
        setVehicleLookupMessage(result.messages?.[0] ?? 'Vehicle found. Enter the tyre size from the sidewall before pricing.');
      }
    } catch (error) {
      if (!mountedRef.current || seq !== vehicleLookupSeq.current) return;
      if ((error as { name?: string }).name === 'AbortError') return;
      setVehicleLookupError(error instanceof Error ? error.message : 'Vehicle lookup failed. Check the registration and try again.');
    } finally {
      if (!mountedRef.current || seq !== vehicleLookupSeq.current) return;
      setVehicleLookupLoading(false);
      vehicleLookupAbort.current = null;
    }
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

  const helperText = serviceType === 'fit'
    ? 'Enter the first tyre size to continue. Suggestions appear as you type.'
    : 'Enter the affected tyre size so the job details are clear for the driver.';

  return (
    <SectionCard title="Tyre details">
      {isServiceOnly ? (
        <View style={styles.inspectNotice}>
          <Text style={styles.inspectNoticeTitle}>{serviceOnlyNotice.title}</Text>
          <Text style={styles.inspectNoticeText}>
            {serviceOnlyNotice.text}
          </Text>
        </View>
      ) : (
        <View style={styles.vehicleLookupBox}>
          <FieldLabel>Find vehicle / look up</FieldLabel>
          <View style={styles.lookupRow}>
            <TextInput
              value={displayedVehicleReg}
              onChangeText={(value) => {
                setVehicleRegTouched(true);
                setVehicleRegInput(value.toUpperCase());
                setVehicleLookupError(null);
                setVehicleLookupMessage(null);
                if (!value.trim()) {
                  setFitmentOptions([]);
                }
              }}
              onSubmitEditing={lookupVehicleFitment}
              returnKeyType="search"
              placeholder="e.g. AB12 CDE"
              placeholderTextColor={colors.subtle}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, styles.lookupInput]}
            />
            <AppButton
              label={vehicleLookupLoading ? 'Looking up...' : 'Lookup'}
              variant="secondary"
              onPress={lookupVehicleFitment}
              disabled={vehicleLookupLoading}
              style={styles.lookupButton}
            />
          </View>
          {vehicleLookupError ? (
            <Text style={styles.lookupError}>{vehicleLookupError}</Text>
          ) : null}
          {draft.vehicle && !vehicleLookupLoading ? (
            <View style={styles.vehicleInfoCard}>
              <Text style={styles.vehicleInfoTitle}>
                {draft.vehicle.make} {draft.vehicle.model}
              </Text>
              <Text style={styles.vehicleInfoMeta}>
                {[
                  draft.vehicle.yearOfManufacture,
                  draft.vehicle.fuelType
                    ? draft.vehicle.fuelType.charAt(0) + draft.vehicle.fuelType.slice(1).toLowerCase()
                    : null,
                  draft.vehicle.colour
                    ? draft.vehicle.colour.charAt(0) + draft.vehicle.colour.slice(1).toLowerCase()
                    : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          {vehicleLookupMessage ? (
            <Text style={styles.lookupMessage}>{vehicleLookupMessage}</Text>
          ) : null}
          {fitmentOptions.length > 0 ? (
            <View style={styles.fitmentOptionStack}>
              {fitmentOptions.length > 1 ? (
                <Text style={styles.fitmentPickLabel}>
                  {fitmentOptions.length} sizes found — tap the correct one:
                </Text>
              ) : null}
              {fitmentOptions.map((option, idx) => {
                const isRecommended = idx === 0 && (option.oem || option.confidence === 'high');
                const sizeStr = (s: AssistedChatTyreSize) =>
                  s.sizeDisplay ?? `${s.width}/${s.aspect}R${s.rim}`;
                const frontStr = sizeStr(option.front);
                const rearStr = option.staggered ? sizeStr(option.rear) : null;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => applyFitmentOption(option)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${frontStr}`}
                    style={({ pressed }) => [
                      styles.fitmentOption,
                      isRecommended && styles.fitmentOptionRecommended,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.fitmentRow}>
                      <View style={styles.fitmentSizeGroup}>
                        {rearStr ? (
                          <>
                            <View style={styles.fitmentSizeBlock}>
                              <Text style={styles.fitmentSizeLabel}>Front</Text>
                              <Text style={styles.fitmentSizeValue}>{frontStr}</Text>
                            </View>
                            <Text style={styles.fitmentSlash}>/</Text>
                            <View style={styles.fitmentSizeBlock}>
                              <Text style={styles.fitmentSizeLabel}>Rear</Text>
                              <Text style={styles.fitmentSizeValue}>{rearStr}</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.fitmentSizeSingle}>{frontStr}</Text>
                        )}
                      </View>
                      <View style={styles.fitmentBadges}>
                        {isRecommended ? (
                          <View style={styles.fitmentBadgeRec}>
                            <Text style={styles.fitmentBadgeText}>✓ Best match</Text>
                          </View>
                        ) : null}
                        {option.oem && !isRecommended ? (
                          <View style={styles.fitmentBadgeOem}>
                            <Text style={styles.fitmentBadgeText}>OEM</Text>
                          </View>
                        ) : null}
                        {option.staggered ? (
                          <View style={styles.fitmentBadgeStaggered}>
                            <Text style={styles.fitmentBadgeText}>Staggered</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      )}

      {!isServiceOnly && !tyreLines[0]?.size.trim() ? (
        <Text style={styles.empty}>{helperText}</Text>
      ) : null}

      {!isServiceOnly ? (
        <>
          {tyreLines.some((line) => line.size.trim()) ? (
            <View style={[
              styles.sidewallNotice,
              draft.tyreConfirmedFromSidewall && styles.sidewallNoticeConfirmed,
            ]}>
              <View style={styles.sidewallCopy}>
                <Text style={styles.sidewallNoticeTitle}>
                  {draft.tyreConfirmedFromSidewall ? 'Sidewall confirmed' : 'Sidewall confirmation required'}
                </Text>
                <Text style={styles.sidewallNoticeText}>
                  Confirm this size against the tyre sidewall before booking.
                </Text>
              </View>
              <AppButton
                label={draft.tyreConfirmedFromSidewall ? 'Confirmed' : 'Confirm'}
                variant={draft.tyreConfirmedFromSidewall ? 'secondary' : 'primary'}
                disabled={draft.tyreConfirmedFromSidewall}
                onPress={() => update({
                  tyreConfirmedFromSidewall: true,
                  ...quoteResetPatch,
                })}
                style={styles.sidewallButton}
              />
            </View>
          ) : null}

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
        </>
      ) : null}

      <Text style={styles.serviceHeading}>Service and tyre details</Text>
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

      {summary.length > 0 || isServiceOnly ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Booking summary</Text>
          <Text style={styles.summaryLine}>Service: {ASSISTED_CHAT_SERVICE_LABELS[serviceType]}</Text>
          {isServiceOnly ? (
            <Text style={styles.summaryLine}>{serviceOnlyNotice.summary}</Text>
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
  serviceHeading: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    marginTop: 2,
  },
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
  vehicleLookupBox: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    padding: space.md,
    gap: space.sm,
    ...tyreCardShadow,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  lookupInput: {
    flex: 1,
  },
  lookupButton: {
    minWidth: 104,
  },
  lookupMessage: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  lookupError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 18,
  },
  fitmentOptionStack: {
    gap: 8,
  },
  fitmentPickLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginBottom: 2,
  },
  fitmentOption: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  fitmentOptionTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  fitmentOptionMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
  },
  fitmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  fitmentSizeGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flex: 1,
  },
  fitmentSizeSingle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  fitmentSlash: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: '300',
  },
  fitmentBadgeRec: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  vehicleInfoCard: {
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
  vehicleInfoTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleInfoMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  fitmentOptionRecommended: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  fitmentSizeBlock: {
    gap: 1,
  },
  fitmentSizeLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fitmentSizeValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  fitmentBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  fitmentBadgeOem: {
    backgroundColor: '#16A34A22',
    borderColor: '#16A34A55',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fitmentBadgeStaggered: {
    backgroundColor: '#7C3AED22',
    borderColor: '#7C3AED55',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fitmentBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sidewallNotice: {
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    padding: space.md,
    gap: space.sm,
  },
  sidewallNoticeConfirmed: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
  },
  sidewallCopy: {
    gap: 3,
  },
  sidewallNoticeTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  sidewallNoticeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: '700',
  },
  sidewallButton: {
    width: '100%',
  },
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
  suggestionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionText: { color: colors.text, flex: 1, minWidth: 0, fontSize: fontSize.sm, fontWeight: '600' },
  suggestionCount: { color: colors.subtle, fontSize: fontSize.xs, fontWeight: '400', marginTop: 2 },
  suggestionPrice: { color: colors.accent, flexShrink: 0, fontSize: fontSize.sm, fontWeight: '800' },
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
