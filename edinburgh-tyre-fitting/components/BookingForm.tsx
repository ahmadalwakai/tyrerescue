'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronLeft, LoaderCircle, LocateFixed, MapPin } from 'lucide-react';
import { serviceOptions, getServiceOption, formatCurrency, serviceNeedsTyreSize } from '@/lib/pricing';
import type { BookingRequest } from '@/lib/booking-schema';

type FormState = BookingRequest;

interface Coordinates {
  lat: number;
  lng: number;
}

interface AddressSuggestion {
  id: string;
  label: string;
  name: string;
  context: string;
  lat?: number;
  lng?: number;
  distanceMiles: number;
  inServiceArea: boolean;
}

interface LocationPreview {
  label: string;
  distanceMiles: number;
  distanceBand?: string;
  source: string;
  confidence: string;
  inServiceArea: boolean;
  serviceRadiusMiles: number;
  coordinates?: Coordinates;
}

interface LiveQuote {
  quoteId: string;
  expiresAt: string;
  service: {
    value: string;
    label: string;
  };
  location: LocationPreview & {
    distanceBand: string;
    coordinates: Coordinates;
  };
  price: {
    basePrice: number;
    perTyrePrice: number;
    distanceSurcharge: number;
    subtotal: number;
    vatAmount: number;
    totalAmount: number;
  };
  availability?: {
    driversOnline?: number;
    etaLabel?: string;
    message?: string;
  } | null;
  tyre?: {
    brand: string;
    pattern: string;
    sizeDisplay: string;
    availableStock: number;
    isPreOrder: boolean;
  } | null;
  warning: string | null;
}

interface TyreSizeSuggestion {
  size: string;
  count?: number;
}

const initialForm: FormState = {
  service: 'mobile_fitting',
  location: '',
  tyreSize: '',
  quantity: 1,
  vehicleReg: '',
  vehicleMake: '',
  vehicleModel: '',
  preferredDate: '',
  preferredTime: '',
  urgency: 'asap',
  accessType: 'street',
  lockingNutStatus: 'unknown',
  parkingNotes: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  notes: '',
  gclid: '',
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const stepItems = [
  { title: 'Location', hint: 'Service and address' },
  { title: 'Vehicle', hint: 'Tyre and access' },
  { title: 'Contact', hint: 'Confirm request' },
];

const quoteSensitiveFields: Array<keyof FormState> = [
  'service',
  'location',
  'tyreSize',
  'quantity',
  'urgency',
  'preferredDate',
  'preferredTime',
];

function hasUsableTyreSize(value?: string): boolean {
  const tyreSize = value?.trim() || '';
  return tyreSize.length > 0 && !/^not\s*sure$/i.test(tyreSize);
}

function buildMapFrameSrc(coordinates: Coordinates): string {
  const lat = Number(coordinates.lat.toFixed(6));
  const lng = Number(coordinates.lng.toFixed(6));
  const spread = 0.018;
  const params = new URLSearchParams({
    bbox: `${lng - spread},${lat - spread},${lng + spread},${lat + spread}`,
    layer: 'mapnik',
    marker: `${lat},${lng}`,
  });

  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

function buildMapLink(coordinates: Coordinates): string {
  const lat = Number(coordinates.lat.toFixed(6));
  const lng = Number(coordinates.lng.toFixed(6));
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function BookingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressMessage, setAddressMessage] = useState('');
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [locationPreview, setLocationPreview] = useState<LocationPreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState('');
  const [tyreSuggestions, setTyreSuggestions] = useState<TyreSizeSuggestion[]>([]);
  const [tyreLoading, setTyreLoading] = useState(false);
  const [tyreOpen, setTyreOpen] = useState(false);
  const [tyreMessage, setTyreMessage] = useState('');
  const [selectedTyreSize, setSelectedTyreSize] = useState<string | null>(null);

  const service = useMemo(() => getServiceOption(form.service), [form.service]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (quoteSensitiveFields.includes(key)) {
      setLiveQuote(null);
      setQuoteMessage('');
      if (key === 'location') setLocationPreview(null);
    }
  }

  useEffect(() => {
    if (step !== 1) return;

    const query = form.location.trim();
    if (query.length < 3 || selectedAddressId) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressMessage('');

      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              suggestions?: AddressSuggestion[];
              tokenConfigured?: boolean;
              message?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(payload?.message || 'Address autocomplete is unavailable.');
        }

        setAddressSuggestions(payload?.suggestions || []);
        setAddressOpen(true);

        if (payload?.tokenConfigured === false) {
          setAddressMessage(
            (payload?.suggestions || []).length > 0
              ? payload?.message || ''
              : payload?.message || 'Start with a full UK postcode, or type the address manually.',
          );
        } else if ((payload?.suggestions || []).length === 0) {
          setAddressMessage('No matches yet. Keep typing or use the address as entered.');
        }
      } catch (autocompleteError) {
        if (controller.signal.aborted) return;
        setAddressSuggestions([]);
        setAddressMessage(
          autocompleteError instanceof Error
            ? autocompleteError.message
            : 'Address autocomplete is unavailable. You can still type the address manually.',
        );
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.location, selectedAddressId, step]);

  useEffect(() => {
    const query = form.location.trim();
    if (query.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteMessage('');

      try {
        const response = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            service: form.service,
            quantity: form.quantity,
            location: query,
            tyreSize: form.tyreSize,
            urgency: form.urgency,
            preferredDate: form.preferredDate,
            preferredTime: form.preferredTime,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | (LiveQuote & { error?: string; needsTyreSize?: boolean; location?: LocationPreview })
          | null;

        if (!payload?.price) {
          setLiveQuote(null);
          if (payload?.location) setLocationPreview(payload.location);
          setQuoteMessage(payload?.error || 'Could not verify this address yet.');
          return;
        }

        setLiveQuote(payload);
        setLocationPreview(payload.location);
        setQuoteMessage(payload.warning || '');
      } catch (quoteError) {
        if (controller.signal.aborted) return;
        setLiveQuote(null);
        setQuoteMessage(
          quoteError instanceof Error
            ? quoteError.message
            : 'Could not verify this address yet.',
        );
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 420);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    form.location,
    form.quantity,
    form.service,
    form.tyreSize,
    form.urgency,
    form.preferredDate,
    form.preferredTime,
  ]);

  useEffect(() => {
    if (step !== 2) return;

    const query = form.tyreSize?.trim() || '';
    if (query.length < 2 || query.toLowerCase() === 'not sure') {
      return;
    }

    if (selectedTyreSize === query) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setTyreLoading(true);
      setTyreMessage('');

      try {
        const response = await fetch(`/api/tyres/sizes?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { sizes?: TyreSizeSuggestion[]; fallback?: boolean }
          | null;

        if (!response.ok) {
          throw new Error('Tyre size search is unavailable.');
        }

        const sizes = payload?.sizes || [];
        setTyreSuggestions(sizes);
        setTyreOpen(true);
        setTyreMessage(
          sizes.length === 0
            ? 'No matching sizes yet. You can still type the size manually.'
            : payload?.fallback
              ? 'Showing common tyre size formats while live stock is checked.'
              : '',
        );
      } catch (tyreError) {
        if (controller.signal.aborted) return;
        setTyreSuggestions([]);
        setTyreMessage(
          tyreError instanceof Error
            ? tyreError.message
            : 'Tyre size search is unavailable. You can still type the size manually.',
        );
      } finally {
        if (!controller.signal.aborted) setTyreLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.tyreSize, selectedTyreSize, step]);

  function chooseAddress(suggestion: AddressSuggestion) {
    if (!suggestion.inServiceArea) {
      setError('That address looks outside the 50-mile Edinburgh booking area.');
      return;
    }

    update('location', suggestion.label);
    setSelectedAddressId(suggestion.id);
    setAddressOpen(false);
    setAddressMessage(`${suggestion.distanceMiles} miles from Edinburgh center.`);
    setLocationPreview({
      label: suggestion.label,
      distanceMiles: suggestion.distanceMiles,
      source: 'postcode',
      confidence: 'verified',
      inServiceArea: suggestion.inServiceArea,
      serviceRadiusMiles: 50,
      coordinates:
        typeof suggestion.lat === 'number' && typeof suggestion.lng === 'number'
          ? { lat: suggestion.lat, lng: suggestion.lng }
          : undefined,
    });
    setLiveQuote(null);
    setQuoteMessage('');
    setError('');
  }

  function currentLocationErrorMessage(error: GeolocationPositionError): string {
    if (error.code === error.PERMISSION_DENIED) {
      return 'Location permission was blocked. Allow location access or type the postcode.';
    }

    if (error.code === error.TIMEOUT) {
      return 'Current location took too long. Try again or type the postcode.';
    }

    return 'Current location could not be detected. Type the postcode instead.';
  }

  async function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setAddressMessage('Current location is not available in this browser.');
      return;
    }

    setCurrentLocationLoading(true);
    setAddressLoading(false);
    setAddressOpen(false);
    setAddressSuggestions([]);
    setAddressMessage('Finding your current location...');
    setQuoteMessage('');
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch('/api/places/current', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          });
          const payload = (await response.json().catch(() => null)) as
            | (LocationPreview & { error?: string; accuracyMeters?: number | null })
            | null;

          if (!response.ok || !payload?.label || !payload.coordinates) {
            throw new Error(payload?.error || 'Current location could not be checked.');
          }

          update('location', payload.label);
          setSelectedAddressId('current-location');
          setAddressOpen(false);
          setAddressSuggestions([]);
          setLocationPreview(payload);
          setLiveQuote(null);
          setQuoteMessage('');

          if (!payload.inServiceArea) {
            setError(`Your current location is ${Math.round(payload.distanceMiles)} miles from Edinburgh. The booking area is ${payload.serviceRadiusMiles} miles.`);
            setAddressMessage('Current location is outside the booking area.');
            return;
          }

          setAddressMessage(`${payload.distanceMiles} miles from Edinburgh centre.`);
        } catch (locationError) {
          setAddressMessage(
            locationError instanceof Error
              ? locationError.message
              : 'Current location could not be checked. Type the postcode instead.',
          );
        } finally {
          setCurrentLocationLoading(false);
        }
      },
      (locationError) => {
        setAddressMessage(currentLocationErrorMessage(locationError));
        setCurrentLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 12000,
      },
    );
  }

  function chooseTyreSize(suggestion: TyreSizeSuggestion) {
    update('tyreSize', suggestion.size);
    setSelectedTyreSize(suggestion.size);
    setTyreOpen(false);
    setTyreMessage(suggestion.count ? `${suggestion.count} available match${suggestion.count === 1 ? '' : 'es'}.` : '');
    setError('');
  }

  function collectTrackingFields(): Partial<FormState> {
    if (typeof window === 'undefined') return {};

    const params = new URLSearchParams(window.location.search);
    return {
      gclid: form.gclid || params.get('gclid') || '',
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      utmTerm: params.get('utm_term') || '',
      utmContent: params.get('utm_content') || '',
      landingPage: window.location.href,
      referrer: document.referrer,
    };
  }

  function next() {
    setError('');

    if (step === 1 && !form.location.trim()) {
      setError('Enter the fitting address, postcode or roadside location.');
      return;
    }

    const checkedLocation = liveQuote?.location ?? locationPreview;
    if (step === 1 && checkedLocation && !checkedLocation.inServiceArea) {
      setError(`This address is outside the ${checkedLocation.serviceRadiusMiles}-mile Edinburgh booking area.`);
      return;
    }

    if (step === 2 && serviceNeedsTyreSize(form.service) && !hasUsableTyreSize(form.tyreSize)) {
      setError('Add the tyre size to confirm live stock and pricing before secure checkout.');
      return;
    }

    setStep((value) => Math.min(3, value + 1));
  }

  async function submit() {
    setError('');

    if (!form.customerName.trim()) {
      setError('Enter your name so we know who to contact.');
      return;
    }

    if (!form.customerPhone.trim()) {
      setError('Enter a phone number so we can confirm the visit.');
      return;
    }

    if (!form.customerEmail.trim()) {
      setError('Enter an email address for the booking confirmation.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...collectTrackingFields(),
          quoteId: liveQuote?.quoteId,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { refNumber?: string; externalReference?: string; totalAmount?: number; checkoutUrl?: string; error?: string }
        | null;

      if (!response.ok || !data?.refNumber) {
        throw new Error(data?.error || 'Could not create the booking. Please try again.');
      }

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      const finalParams = new URLSearchParams({
        ref: data.refNumber,
        requestRef: data.externalReference || '',
        total: String(data.totalAmount ?? ''),
        payment: 'pending',
      });
      router.push(`/final?${finalParams.toString()}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the booking.');
    } finally {
      setLoading(false);
    }
  }

  const checkedLocation = liveQuote?.location ?? locationPreview;
  const mapCoordinates = checkedLocation?.coordinates;
  const mapFrameSrc = mapCoordinates ? buildMapFrameSrc(mapCoordinates) : '';
  const mapLink = mapCoordinates ? buildMapLink(mapCoordinates) : '';

  return (
    <section className="booking-panel" id="book">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Live booking</span>
          <h2>Book Edinburgh tyre help</h2>
          <p>Takes about a minute. We confirm before the visit.</p>
        </div>
        <span className="step-count">Step {step} of 3</span>
      </div>

      <div className="booking-progress" aria-label="Booking progress">
        {stepItems.map((item, index) => (
          <span key={item.title} data-active={index + 1 <= step}>
            <i>{index + 1}</i>
            <strong>{item.title}</strong>
            <em>{item.hint}</em>
          </span>
        ))}
      </div>

      <div className="field-stack">
        {step === 1 && (
          <>
            <div className="service-grid" aria-label="Choose service">
              {serviceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="service-choice"
                  aria-pressed={form.service === option.value}
                  onClick={() => update('service', option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                  <em>Live quote</em>
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="location">Fitting location</label>
              <span className="field-hint">Use a postcode, street, workplace, hotel or safe roadside location.</span>
              <div className="autocomplete-wrap">
                <input
                  id="location"
                  className="input"
                  placeholder="Street, postcode, hotel, workplace or roadside location"
                  value={form.location}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={addressOpen}
                  aria-controls="location-suggestions"
                  onBlur={() => window.setTimeout(() => setAddressOpen(false), 140)}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) setAddressOpen(true);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    update('location', value);
                    setSelectedAddressId(null);
                    setAddressOpen(true);
                    setLiveQuote(null);
                    setQuoteMessage('');
                    if (value.trim().length < 3) {
                      setAddressSuggestions([]);
                      setAddressLoading(false);
                      setAddressMessage('');
                    }
                  }}
                />
                {(addressOpen || addressLoading) && (
                  <div className="suggestion-list" id="location-suggestions" role="listbox">
                    {addressLoading && <div className="suggestion-status">Searching Edinburgh addresses...</div>}
                    {!addressLoading &&
                      addressSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="suggestion-option"
                          role="option"
                          aria-selected={selectedAddressId === suggestion.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => chooseAddress(suggestion)}
                        >
                          <strong>{suggestion.name}</strong>
                          <span>{suggestion.context || suggestion.label}</span>
                          <em>{suggestion.inServiceArea ? `${suggestion.distanceMiles} mi` : 'Outside 50 mi'}</em>
                        </button>
                      ))}
                    {!addressLoading && addressSuggestions.length === 0 && addressMessage && (
                      <div className="suggestion-status">{addressMessage}</div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="current-location-button"
                onClick={useCurrentLocation}
                disabled={currentLocationLoading}
              >
                {currentLocationLoading ? (
                  <LoaderCircle size={18} aria-hidden="true" className="spin" />
                ) : (
                  <LocateFixed size={18} aria-hidden="true" />
                )}
                {currentLocationLoading ? 'Finding location...' : 'Use my current location'}
              </button>
              {addressMessage && !addressOpen && <span className="location-status">{addressMessage}</span>}
            </div>

            {mapCoordinates && checkedLocation && (
              <div className="location-map">
                <div className="location-map-frame">
                  <iframe
                    title="Fitting location map"
                    src={mapFrameSrc}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="location-map-meta">
                  <span>
                    <MapPin size={16} aria-hidden="true" />
                    {checkedLocation.label}
                  </span>
                  <strong>
                    {checkedLocation.inServiceArea
                      ? `${checkedLocation.distanceMiles} miles from Edinburgh`
                      : 'Outside service area'}
                  </strong>
                  <a href={mapLink} target="_blank" rel="noreferrer">
                    Open map
                  </a>
                </div>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="urgency">Urgency</label>
                <select
                  id="urgency"
                  className="select"
                  value={form.urgency}
                  onChange={(event) => update('urgency', event.target.value as FormState['urgency'])}
                >
                  <option value="asap">ASAP</option>
                  <option value="today">Today</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="accessType">Access</label>
                <select
                  id="accessType"
                  className="select"
                  value={form.accessType}
                  onChange={(event) => update('accessType', event.target.value as FormState['accessType'])}
                >
                  <option value="street">Street</option>
                  <option value="driveway">Driveway</option>
                  <option value="car_park">Car park</option>
                  <option value="roadside">Roadside</option>
                  <option value="workplace">Workplace</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="summary-box">
              <div className="summary-line">
                <span>{liveQuote ? 'Live Tyre Rescue quote' : 'Price check'}</span>
                <strong>
                  {quoteLoading
                    ? 'Checking...'
                    : liveQuote
                      ? formatCurrency(liveQuote.price.totalAmount)
                      : 'After tyre details'}
                </strong>
              </div>
              <div className="summary-line">
                <span>{liveQuote ? liveQuote.location.distanceBand : 'Coverage'}</span>
                <strong>
                  {quoteLoading
                    ? 'Checking...'
                    : liveQuote
                      ? `${liveQuote.location.distanceMiles} miles`
                      : '50 miles from Edinburgh'}
                </strong>
              </div>
              {liveQuote && (
                <div className="summary-line">
                  <span>Travel</span>
                  <strong>{formatCurrency(liveQuote.price.distanceSurcharge)}</strong>
                </div>
              )}
              {liveQuote?.availability?.driversOnline != null && (
                <div className="summary-line">
                  <span>Driver availability</span>
                  <strong>{liveQuote.availability.driversOnline} online</strong>
                </div>
              )}
              {quoteMessage && (
                <div className={liveQuote?.location.inServiceArea === false ? 'quote-warning' : 'quote-note'}>
                  {quoteMessage}
                </div>
              )}
              {!quoteMessage && liveQuote?.location.confidence === 'verified' && (
                <div className="quote-note">Address checked before booking.</div>
              )}
            </div>
            {liveQuote && (
              <div className="price-breakdown">
                <span>Service {formatCurrency(liveQuote.price.basePrice)}</span>
                <span>Tyres {formatCurrency(liveQuote.price.perTyrePrice)}</span>
                <span>Travel {formatCurrency(liveQuote.price.distanceSurcharge)}</span>
              </div>
            )}
            <div className="booking-assurance">
              <span>Fast confirmation</span>
              <span>50-mile Edinburgh cover</span>
              <span>Clear price before booking</span>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="step-helper">
              <strong>Tyre details help us prepare properly.</strong>
              <span>Use the size printed on the tyre sidewall. If you are not sure, call us before checkout.</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="quantity">Tyres</label>
                <select
                  id="quantity"
                  className="select"
                  value={form.quantity}
                  onChange={(event) => update('quantity', Number(event.target.value))}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="tyreSize">Tyre size</label>
                <div className="autocomplete-wrap">
                  <input
                    id="tyreSize"
                    className="input"
                    placeholder="225/45/R17"
                    value={form.tyreSize}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={tyreOpen}
                    aria-controls="tyre-size-suggestions"
                    onBlur={() => window.setTimeout(() => setTyreOpen(false), 140)}
                    onFocus={() => {
                      if (tyreSuggestions.length > 0) setTyreOpen(true);
                    }}
                    onChange={(event) => {
                      const value = event.target.value;
                      update('tyreSize', value);
                      setSelectedTyreSize(null);
                      if (value.trim().length < 2 || value.trim().toLowerCase() === 'not sure') {
                        setTyreSuggestions([]);
                        setTyreMessage('');
                        setTyreOpen(false);
                      } else {
                        setTyreOpen(true);
                      }
                    }}
                  />
                  {(tyreOpen || tyreLoading) && (
                    <div className="suggestion-list tyre-suggestion-list" id="tyre-size-suggestions" role="listbox">
                      {tyreLoading && <div className="suggestion-status">Searching tyre sizes...</div>}
                      {!tyreLoading &&
                        tyreSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.size}
                            type="button"
                            className="suggestion-option tyre-suggestion-option"
                            role="option"
                            aria-selected={selectedTyreSize === suggestion.size}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseTyreSize(suggestion)}
                          >
                            <strong>{suggestion.size}</strong>
                            <span>Tap to use this tyre size</span>
                            {suggestion.count != null && <em>{suggestion.count} match{suggestion.count === 1 ? '' : 'es'}</em>}
                          </button>
                        ))}
                      {!tyreLoading && tyreSuggestions.length === 0 && tyreMessage && (
                        <div className="suggestion-status">{tyreMessage}</div>
                      )}
                    </div>
                  )}
                </div>
                {tyreMessage && !tyreOpen && <span className="location-status">{tyreMessage}</span>}
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="lockingNutStatus">Locking wheel nut</label>
                <select
                  id="lockingNutStatus"
                  className="select"
                  value={form.lockingNutStatus}
                  onChange={(event) => update('lockingNutStatus', event.target.value as FormState['lockingNutStatus'])}
                >
                  <option value="unknown">Not sure</option>
                  <option value="has_key">I have the key</option>
                  <option value="no_key">No key / lost key</option>
                  <option value="standard">Standard nuts</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="parkingNotes">Parking / access notes</label>
                <input
                  id="parkingNotes"
                  className="input"
                  placeholder="Bay number, car park level, safe pull-in..."
                  value={form.parkingNotes}
                  onChange={(event) => update('parkingNotes', event.target.value)}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="vehicleReg">Registration</label>
                <input
                  id="vehicleReg"
                  className="input"
                  placeholder="AB12 CDE"
                  value={form.vehicleReg}
                  onChange={(event) => update('vehicleReg', event.target.value.toUpperCase())}
                />
              </div>
              <div className="field">
                <label htmlFor="vehicleMake">Make / model</label>
                <input
                  id="vehicleMake"
                  className="input"
                  placeholder="BMW 3 Series"
                  value={[form.vehicleMake, form.vehicleModel].filter(Boolean).join(' ')}
                  onChange={(event) => {
                    update('vehicleMake', event.target.value);
                    update('vehicleModel', '');
                  }}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="preferredDate">Preferred date</label>
                <input
                  id="preferredDate"
                  className="input"
                  type="date"
                  min={todayDate()}
                  value={form.preferredDate}
                  onChange={(event) => update('preferredDate', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="preferredTime">Preferred time</label>
                <select
                  id="preferredTime"
                  className="select"
                  value={form.preferredTime}
                  onChange={(event) => update('preferredTime', event.target.value)}
                >
                  <option value="">ASAP / confirm by phone</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="step-helper">
              <strong>Last step.</strong>
              <span>We use these details only to confirm the booking and contact you about the visit.</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="customerName">Name</label>
                <input
                  id="customerName"
                  className="input"
                  autoComplete="name"
                  value={form.customerName}
                  onChange={(event) => update('customerName', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="customerPhone">Phone</label>
                <input
                  id="customerPhone"
                  className="input"
                  autoComplete="tel"
                  value={form.customerPhone}
                  onChange={(event) => update('customerPhone', event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="customerEmail">Email</label>
              <input
                id="customerEmail"
                className="input"
                type="email"
                autoComplete="email"
                value={form.customerEmail}
                onChange={(event) => update('customerEmail', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                className="textarea"
                placeholder="Wheel lock issue, tyre sidewall damage, car park level, roadside safety notes..."
                value={form.notes}
                onChange={(event) => update('notes', event.target.value)}
              />
            </div>
            <div className="summary-box">
              <div className="summary-line">
                <span>Selected service</span>
                <strong>{service.label}</strong>
              </div>
              <div className="summary-line">
                <span>Location</span>
                <strong>{form.location || 'Not added'}</strong>
              </div>
              <div className="summary-line">
                <span>Live price</span>
                <strong>{liveQuote ? formatCurrency(liveQuote.price.totalAmount) : 'Calculated before checkout'}</strong>
              </div>
              <div className="summary-line">
                <span>Payment</span>
                <strong>Secure card checkout</strong>
              </div>
              <div className="summary-line">
                <span>Next step</span>
                <strong>Pay securely to confirm</strong>
              </div>
            </div>
            <div className="secure-payment-note">Card payment opens in Stripe Checkout. We never store card details.</div>
          </>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="button-row">
          {step > 1 && (
            <button className="secondary-button" type="button" onClick={() => setStep((value) => value - 1)}>
              <ChevronLeft size={18} aria-hidden="true" />
              Back
            </button>
          )}
          {step < 3 ? (
            <button className="primary-button" type="button" onClick={next}>
              Continue
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={submit} disabled={loading}>
              {loading ? <LoaderCircle size={18} aria-hidden="true" className="spin" /> : <Check size={18} aria-hidden="true" />}
              {loading ? 'Preparing payment...' : 'Continue to secure payment'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
