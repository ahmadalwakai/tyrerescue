'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { PHONE_DISPLAY, PHONE_TEL } from '@/lib/seo-data';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

type BookingType = 'emergency' | 'scheduled';
type ServiceChoice = 'replacement' | 'locking_nut' | 'repair';
type FittingLocation = 'mobile' | 'shop';

type LocationChoice = {
  lat: number;
  lng: number;
  addressLine: string;
};

type MapboxFeature = {
  id: string;
  place_name: string;
  center: [number, number];
};

type PopularSize = {
  size: string;
  count?: number;
};

type TyreResult = {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  priceNew?: number | null;
  unitPrice?: number | null;
};

type PricingLine = {
  label: string;
  amount: number;
  type?: string;
};

type PricingBreakdown = {
  lineItems?: PricingLine[];
  totalTyreCost?: number;
  tyrePrice?: number;
  tyreSubtotal?: number;
  totalServiceFee?: number;
  fittingPrice?: number;
  serviceSubtotal?: number;
  calloutFee?: number;
  vatAmount?: number;
  total?: number;
  totalPrice?: number;
};

type QuoteResponse = {
  quoteId: string;
  expiresAt?: string;
  breakdown?: PricingBreakdown;
  error?: string;
  message?: string;
};

type PaymentData = {
  stripeClientSecret: string | null;
  bookingId: string;
  refNumber: string;
  total: number;
};

type CustomerDetails = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleReg: string;
  notes: string;
};

const serviceOptions: Array<{
  id: ServiceChoice;
  title: string;
  text: string;
}> = [
  { id: 'replacement', title: 'TYRE REPLACEMENT', text: 'New tyre fitted at your location' },
  { id: 'locking_nut', title: 'LOCKING WHEEL NUT REMOVAL', text: 'Specialist removal service - no key needed' },
  { id: 'repair', title: 'TYRE REPAIR', text: 'We assess and repair on-the-spot' },
];

const tyreSizePattern = /^(\d{3})\s*[/]\s*(\d{2})\s*[Rr]?\s*(\d{2})$/;

function formatPrice(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '£0';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
}

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const maybe = data as { error?: unknown; message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
    if (typeof maybe.error === 'string') return maybe.error;
  }
  return fallback;
}

function readNumber(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function getQuoteNumbers(quote: QuoteResponse | null) {
  const breakdown = quote?.breakdown;
  const fittingFee = readNumber(breakdown?.fittingPrice, breakdown?.totalServiceFee, breakdown?.serviceSubtotal, breakdown?.calloutFee);
  const tyreCost = readNumber(breakdown?.tyrePrice, breakdown?.totalTyreCost, breakdown?.tyreSubtotal);
  const vat = readNumber(breakdown?.vatAmount);
  const total = readNumber(breakdown?.totalPrice, breakdown?.total);

  return { fittingFee, tyreCost, vat, total };
}

function useCountdown(expiresAt: string | undefined, active: boolean) {
  const [seconds, setSeconds] = useState(600);

  useEffect(() => {
    if (!active) return;
    const expiry = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 10 * 60 * 1000;

    function tick() {
      setSeconds(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, expiresAt]);

  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function getNextSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const value = date.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'Europe/London',
    }).format(date);

    return { value, label };
  });
}

function getLondonOffsetMinutes(utcDate: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(utcDate);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

function londonDateTimeToIso(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getLondonOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000).toISOString();
}

function isPastLondonSlot(dateValue: string, timeValue: string) {
  return new Date(londonDateTimeToIso(dateValue, timeValue)).getTime() <= Date.now();
}

function mapboxStaticUrl(location: LocationChoice) {
  const marker = `pin-l+f97316(${location.lng},${location.lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${marker}/${location.lng},${location.lat},13,0/600x300@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
}

function Progress({ step }: { step: number }) {
  return (
    <div className="wizard-progress" aria-label={`Step ${step} of 6`}>
      <span style={{ width: `${(step / 6) * 100}%` }} />
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  className,
  icon,
  title,
  text,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  icon: ReactNode;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <motion.button
      type="button"
      className={`wizard-choice ${selected ? 'wizard-choice-selected' : ''} ${className ?? ''}`}
      whileHover={{ scale: 1.02, boxShadow: '0 0 28px rgba(249,115,22,0.45)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {selected && <span className="wizard-check">✓</span>}
      <span className="wizard-choice-icon">{icon}</span>
      <strong>{title}</strong>
      <span>{text}</span>
      {badge && <em>{badge}</em>}
    </motion.button>
  );
}

function Spinner() {
  return <span className="wizard-spinner" aria-label="Loading" />;
}

function StripePaymentPanel({
  refNumber,
  onSuccess,
}: {
  refNumber: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function confirmPayment() {
    if (!stripe || !elements) return;
    setConfirming(true);
    setError('');

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success/${encodeURIComponent(refNumber)}`,
      },
      redirect: 'if_required',
    });

    setConfirming(false);

    if (result.error) {
      setError(result.error.message ?? 'Payment failed. Please check your card details.');
      return;
    }

    onSuccess();
  }

  return (
    <div className="stripe-panel">
      <PaymentElement />
      {error && <p className="wizard-error">{error}</p>}
      <button className="wizard-pay-button" type="button" disabled={!stripe || confirming} onClick={confirmPayment}>
        {confirming ? 'CONFIRMING...' : 'CONFIRM PAYMENT'}
      </button>
    </div>
  );
}

export function BookingWizard({ initialBookingType }: { initialBookingType?: BookingType }) {
  const [step, setStep] = useState(initialBookingType ? 2 : 1);
  const [bookingType, setBookingType] = useState<BookingType | null>(initialBookingType ?? null);
  const [location, setLocation] = useState<LocationChoice | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<MapboxFeature[]>([]);
  const [locating, setLocating] = useState(false);
  const [serviceChoice, setServiceChoice] = useState<ServiceChoice>('replacement');
  const [tyreSize, setTyreSize] = useState('');
  const [popularSizes, setPopularSizes] = useState<PopularSize[]>([]);
  const [showTyreHelp, setShowTyreHelp] = useState(false);
  const [tyres, setTyres] = useState<TyreResult[]>([]);
  const [selectedTyre, setSelectedTyre] = useState<TyreResult | null>(null);
  const [tyresLoading, setTyresLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string | undefined>();
  const [fittingLocation, setFittingLocation] = useState<FittingLocation | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehicleReg: '',
    notes: '',
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const countdown = useCountdown(quote?.expiresAt, Boolean(quote));
  const days = useMemo(getNextSevenDays, []);
  const parsedSize = useMemo(() => tyreSize.match(tyreSizePattern), [tyreSize]);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (step !== 2 || addressQuery.trim().length < 3 || !mapboxToken) {
      setAddressResults([]);
      return;
    }

    const id = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressQuery)}.json?access_token=${mapboxToken}&country=GB&proximity=-4.2518,55.8642&types=address,postcode&limit=5`,
        );
        const data = (await response.json()) as { features?: MapboxFeature[] };
        setAddressResults(data.features ?? []);
      } catch {
        setAddressResults([]);
      }
    }, 300);

    return () => window.clearTimeout(id);
  }, [addressQuery, mapboxToken, step]);

  useEffect(() => {
    if (step !== 3 || serviceChoice !== 'replacement') return;

    fetch('/api/proxy/tyre-sizes')
      .then((response) => response.json())
      .then((data: PopularSize[]) => setPopularSizes(Array.isArray(data) ? data : []))
      .catch(() => setPopularSizes([]));
  }, [serviceChoice, step]);

  useEffect(() => {
    if (step !== 3 || serviceChoice !== 'replacement' || !parsedSize) {
      setTyres([]);
      return;
    }

    const [, width, aspect, rim] = parsedSize;
    const id = window.setTimeout(async () => {
      setTyresLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/proxy/tyres?width=${width}&aspect=${aspect}&rim=${rim}&limit=6`);
        const data = (await response.json()) as { tyres?: TyreResult[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Could not load tyres');
        setTyres(data.tyres ?? []);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load tyres');
      } finally {
        setTyresLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [parsedSize, serviceChoice, step]);

  function chooseBookingType(type: BookingType) {
    setBookingType(type);
    setStep(2);
    setError('');
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location sharing. Enter your address instead.');
      return;
    }

    if (!mapboxToken) {
      setError('Mapbox is not configured. Enter your address manually or call us.');
      return;
    }

    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxToken}&limit=1`,
          );
          const data = (await response.json()) as { features?: MapboxFeature[] };
          const place = data.features?.[0]?.place_name ?? 'Current location';
          setLocation({ lat: latitude, lng: longitude, addressLine: place });
          setAddressQuery(place);
        } catch {
          setLocation({ lat: latitude, lng: longitude, addressLine: 'Current location' });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError('Location permission was blocked. Enter your Glasgow address instead.');
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  function selectAddress(feature: MapboxFeature) {
    setLocation({ lat: feature.center[1], lng: feature.center[0], addressLine: feature.place_name });
    setAddressQuery(feature.place_name);
    setAddressResults([]);
    setError('');
  }

  function confirmLocation() {
    if (!location) {
      setError('Choose a current location or select an address first.');
      return;
    }
    setStep(3);
    setError('');
  }

  function confirmService() {
    if (!bookingType) {
      setStep(1);
      return;
    }

    if (serviceChoice === 'replacement' && !selectedTyre) {
      setError('Select a tyre before continuing.');
      return;
    }

    setError('');
    setStep(bookingType === 'emergency' ? 5 : 4);
  }

  function confirmTime() {
    if (!selectedDate || !selectedTime) {
      setError('Choose a date and time slot.');
      return;
    }

    setScheduledAt(londonDateTimeToIso(selectedDate, selectedTime));
    setStep(5);
    setError('');
  }

  async function requestQuote(nextFittingLocation: FittingLocation) {
    if (!location || !bookingType) {
      setError('Complete location and booking type first.');
      return;
    }

    const serviceType = serviceChoice === 'replacement' ? 'fit' : 'repair';
    const tyreSelections =
      serviceChoice === 'replacement' && selectedTyre
        ? [{ tyreId: selectedTyre.id, quantity: 1, service: 'fit' }]
        : [];

    setFittingLocation(nextFittingLocation);
    setQuote(null);
    setPaymentData(null);
    setQuoteLoading(true);
    setError('');

    try {
      const response = await fetch('/api/proxy/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          addressLine: location.addressLine,
          bookingType,
          serviceType,
          tyreSelections,
          scheduledAt: bookingType === 'scheduled' ? scheduledAt : undefined,
          fittingLocation: nextFittingLocation,
        }),
      });
      const data = (await response.json()) as QuoteResponse;

      if (!response.ok || !data.quoteId) {
        throw new Error(getErrorMessage(data, 'Could not create quote'));
      }

      setQuote(data);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Could not create quote');
    } finally {
      setQuoteLoading(false);
    }
  }

  function updateCustomer(field: keyof CustomerDetails, value: string) {
    setCustomerDetails((current) => ({ ...current, [field]: value }));
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quote?.quoteId) {
      setError('Create a quote before payment.');
      return;
    }

    if (!/^(\+44|0)\d{9,10}$/.test(customerDetails.customerPhone.replace(/\s+/g, ''))) {
      setError('Enter a valid UK phone number.');
      return;
    }

    setError('');
    setQuoteLoading(true);

    try {
      const response = await fetch('/api/proxy/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          customerName: customerDetails.customerName,
          customerEmail: customerDetails.customerEmail,
          customerPhone: customerDetails.customerPhone,
          vehicleReg: customerDetails.vehicleReg || undefined,
          notes: customerDetails.notes || undefined,
          paymentFlow: 'payment_intent',
        }),
      });
      const data = (await response.json()) as PaymentData | { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(getErrorMessage(data, 'Could not start payment'));
      }

      const nextPayment = data as PaymentData;
      setPaymentData(nextPayment);
      if (!nextPayment.stripeClientSecret) setSuccess(true);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Could not start payment');
    } finally {
      setQuoteLoading(false);
    }
  }

  if (success) {
    return (
      <motion.div className="wizard-success" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="wizard-success-mark" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
          ✓
        </motion.div>
        <h1>BOOKING CONFIRMED</h1>
        <p>Reference: {paymentData?.refNumber ?? 'TR-XXXXXX'}</p>
        <p>We&apos;ll call you shortly to confirm arrival time.</p>
        <a href={`tel:${PHONE_TEL}`}>Call us: {PHONE_DISPLAY}</a>
      </motion.div>
    );
  }

  const quoteNumbers = getQuoteNumbers(quote);

  return (
    <section className="booking-wizard-card" aria-label="Booking wizard">
      <Progress step={step} />
      <div className="wizard-head">
        <span>Step {step} of 6</span>
        <h1>Book 247 Mo Glasgow</h1>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step-1" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <ChoiceCard
              selected={bookingType === 'emergency'}
              onClick={() => chooseBookingType('emergency')}
              className="wizard-choice-hot"
              icon={<span>⚡</span>}
              title="EMERGENCY CALLOUT"
              text="Fitter dispatched immediately"
              badge="~35 MIN"
            />
            <ChoiceCard
              selected={bookingType === 'scheduled'}
              onClick={() => chooseBookingType('scheduled')}
              icon={
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 2h2v3h6V2h2v3h4v17H3V5h4V2Zm12 8H5v10h14V10Z" />
                </svg>
              }
              title="SCHEDULE A FITTING"
              text="Choose your date and time"
            />
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step-2" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <button className="wizard-location-button" type="button" onClick={useCurrentLocation}>
              {locating ? <span className="locating-dot" /> : <span className="gps-icon">⌖</span>}
              {locating ? 'LOCATING...' : 'USE MY CURRENT LOCATION'}
            </button>
            <div className="address-search">
              <input
                value={addressQuery}
                onChange={(event) => setAddressQuery(event.target.value)}
                placeholder="Enter your Glasgow address..."
              />
              {addressResults.length > 0 && (
                <div className="address-results">
                  {addressResults.map((feature) => (
                    <button key={feature.id} type="button" onClick={() => selectAddress(feature)}>
                      {feature.place_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {location && (
              <div className="map-preview">
                <Image src={mapboxStaticUrl(location)} alt="Confirmed fitting location map preview" width={600} height={300} />
                <p>{location.addressLine}</p>
              </div>
            )}
            <button className="wizard-next" type="button" onClick={confirmLocation}>
              CONFIRM LOCATION
            </button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step-3" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <div className="service-radio-list">
              {serviceOptions.map((option) => (
                <button
                  key={option.id}
                  className={`service-radio-card ${serviceChoice === option.id ? 'service-radio-selected' : ''}`}
                  type="button"
                  onClick={() => {
                    setServiceChoice(option.id);
                    setError('');
                  }}
                >
                  <span>{serviceChoice === option.id ? '✓' : '□'}</span>
                  <strong>{option.title}</strong>
                  <small>{option.text}</small>
                </button>
              ))}
            </div>

            {serviceChoice === 'replacement' && (
              <div className="tyre-size-panel">
                <label>
                  Tyre size
                  <input
                    value={tyreSize}
                    onChange={(event) => {
                      setTyreSize(event.target.value);
                      setSelectedTyre(null);
                    }}
                    placeholder="Enter tyre size e.g. 205/55 R16"
                  />
                </label>
                {popularSizes.length > 0 && (
                  <div className="size-suggestions">
                    {popularSizes.map((size) => (
                      <button key={size.size} type="button" onClick={() => setTyreSize(size.size)}>
                        {size.size}
                      </button>
                    ))}
                  </div>
                )}
                <button className="tyre-help-link" type="button" onClick={() => setShowTyreHelp((value) => !value)}>
                  Don&apos;t know your size?
                </button>
                <AnimatePresence>
                  {showTyreHelp && (
                    <motion.p className="tyre-help" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      Look on the tyre sidewall for a code like 205/55 R16. It is usually printed near the brand name.
                    </motion.p>
                  )}
                </AnimatePresence>
                {tyresLoading && <p className="wizard-muted">Loading matching tyres...</p>}
                {tyres.length > 0 && (
                  <div className="tyre-results">
                    {tyres.map((tyre) => {
                      const price = readNumber(tyre.priceNew, tyre.unitPrice);
                      return (
                        <button
                          key={tyre.id}
                          className={`tyre-card ${selectedTyre?.id === tyre.id ? 'tyre-card-selected' : ''}`}
                          type="button"
                          onClick={() => setSelectedTyre(tyre)}
                        >
                          <strong>{tyre.brand}</strong>
                          <span>{tyre.pattern}</span>
                          <small>{tyre.sizeDisplay}</small>
                          <em>{formatPrice(price)}</em>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <button className="wizard-next" type="button" onClick={confirmService}>
              NEXT
            </button>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div key="step-4" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <div className="day-pills">
              {days.map((day) => (
                <button
                  key={day.value}
                  className={selectedDate === day.value ? 'selected' : ''}
                  type="button"
                  onClick={() => {
                    setSelectedDate(day.value);
                    setSelectedTime('');
                  }}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <div className="slot-groups">
              {[
                { label: 'Morning', start: 8, end: 12 },
                { label: 'Afternoon', start: 12, end: 17 },
                { label: 'Evening', start: 17, end: 21 },
              ].map((group) => (
                <div key={group.label}>
                  <h3>{group.label}</h3>
                  <div className="slot-grid">
                    {Array.from({ length: group.end - group.start }, (_, index) => {
                      const hour = group.start + index;
                      const value = `${String(hour).padStart(2, '0')}:00`;
                      const disabled = !selectedDate || isPastLondonSlot(selectedDate, value);
                      return (
                        <button
                          key={value}
                          className={selectedTime === value ? 'selected' : ''}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedTime(value)}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button className="wizard-next" type="button" onClick={confirmTime}>
              CONFIRM TIME
            </button>
          </motion.div>
        )}

        {step === 5 && (
          <motion.div key="step-5" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            {!quote && !quoteLoading && (
              <div className="fitting-options">
                <ChoiceCard
                  selected={fittingLocation === 'mobile'}
                  onClick={() => requestQuote('mobile')}
                  icon={<span>↗</span>}
                  title="AT YOUR LOCATION"
                  text={`Mobile fitting - ${location?.addressLine ?? 'we come to you'}`}
                />
                <ChoiceCard
                  selected={fittingLocation === 'shop'}
                  onClick={() => requestQuote('shop')}
                  icon={<span>⌂</span>}
                  title="AT THE GARAGE"
                  text="3 Gateside Street, Parkhead G31 1PD"
                />
              </div>
            )}
            {quoteLoading && (
              <div className="quote-loading">
                <Spinner />
                <p>Fetching your live quote...</p>
              </div>
            )}
            {quote && (
              <div className="quote-card">
                <h2>YOUR PRICE</h2>
                <div>
                  <span>Fitting fee</span>
                  <strong>{formatPrice(quoteNumbers.fittingFee)}</strong>
                </div>
                {quoteNumbers.tyreCost > 0 && (
                  <div>
                    <span>Tyre cost</span>
                    <strong>{formatPrice(quoteNumbers.tyreCost)}</strong>
                  </div>
                )}
                <div>
                  <span>VAT</span>
                  <strong>{formatPrice(quoteNumbers.vat)}</strong>
                </div>
                <div className="quote-total">
                  <span>TOTAL</span>
                  <strong>{formatPrice(quoteNumbers.total)}</strong>
                </div>
                <p>Quote expires in: {countdown}</p>
                <button className="wizard-pay-button" type="button" onClick={() => setStep(6)}>
                  PROCEED TO PAYMENT
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === 6 && (
          <motion.div key="step-6" className="wizard-step" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <form className="customer-payment-form" onSubmit={createPayment}>
              <label>
                Full name
                <input required value={customerDetails.customerName} onChange={(event) => updateCustomer('customerName', event.target.value)} />
              </label>
              <label>
                Phone number
                <input required value={customerDetails.customerPhone} onChange={(event) => updateCustomer('customerPhone', event.target.value)} placeholder="07123 456789" />
              </label>
              <label>
                Email address
                <input required type="email" value={customerDetails.customerEmail} onChange={(event) => updateCustomer('customerEmail', event.target.value)} />
              </label>
              <label>
                Vehicle registration
                <input value={customerDetails.vehicleReg} onChange={(event) => updateCustomer('vehicleReg', event.target.value.toUpperCase())} />
              </label>
              <label>
                Notes
                <textarea rows={4} value={customerDetails.notes} onChange={(event) => updateCustomer('notes', event.target.value)} />
              </label>
              {!paymentData && (
                <button className="wizard-pay-button" type="submit" disabled={quoteLoading}>
                  {quoteLoading ? 'STARTING PAYMENT...' : 'PAY NOW'}
                </button>
              )}
            </form>
            {paymentData?.stripeClientSecret && stripePromise && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: paymentData.stripeClientSecret,
                  appearance: {
                    theme: 'night',
                    variables: { colorPrimary: '#f97316', borderRadius: '0px' },
                  },
                }}
              >
                <StripePaymentPanel refNumber={paymentData.refNumber} onSuccess={() => setSuccess(true)} />
              </Elements>
            )}
            {paymentData?.stripeClientSecret && !stripePromise && (
              <p className="wizard-error">Stripe publishable key is not configured.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="wizard-error">{error}</p>}
      {step > 1 && !success && (
        <button
          className="wizard-back"
          type="button"
          onClick={() => {
            setError('');
            setStep((current) => (current === 5 && bookingType === 'emergency' ? 3 : Math.max(1, current - 1)));
          }}
        >
          Back
        </button>
      )}
    </section>
  );
}
