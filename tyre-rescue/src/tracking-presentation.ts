import { isTrackingLocationFresh, isTrackingStatusActive } from './tracking-state';

interface TrackingPresentationInput {
  status: string;
  driverName: string | null;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  etaMinutes: number | null;
  estimatedArrivalAt?: string | null;
  scheduledAt: string | null;
}

export function trackingClock(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
}

export function trackingPresentation(input: TrackingPresentationInput, options: { now: number; receivedAt: number; refreshFailed: boolean }) {
  const { now, receivedAt, refreshFailed } = options;
  const active = isTrackingStatusActive(input.status);
  const assigned = ['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(input.status);
  const coordinatesValid = typeof input.driverLat === 'number' && Number.isFinite(input.driverLat) && Math.abs(input.driverLat) <= 90 &&
    typeof input.driverLng === 'number' && Number.isFinite(input.driverLng) && Math.abs(input.driverLng) <= 180;
  const showDriver = active && assigned && !refreshFailed && coordinatesValid && isTrackingLocationFresh(input.driverLocationAt, now);
  let title = 'Finding your fitter';
  let detail = 'We will update your arrival time when your fitter is on the way.';
  let label = 'BOOKING CONFIRMED';
  let etaMinutes: number | null = null;
  let arrivalTime: string | null = null;

  if (!active) return { title: 'Journey ended', detail: 'Driver tracking has ended.', label: 'BOOKING CLOSED', showDriver: false, etaMinutes, arrivalTime };
  if (refreshFailed) return { title: 'Reconnecting to your rescue', detail: 'Your last booking update is saved below. Refresh to reconnect.', label: 'UPDATES PAUSED', showDriver: false, etaMinutes, arrivalTime };
  if (input.status === 'arrived' || input.status === 'in_progress') {
    title = input.status === 'arrived' ? 'Your fitter has arrived' : 'Getting you moving';
    detail = input.status === 'arrived' ? 'Your fitter is at your service location.' : 'Your tyre service is underway. We will update you when it is complete.';
    label = input.status === 'arrived' ? 'AT YOUR LOCATION' : 'WORK IN PROGRESS';
  } else if (input.status === 'driver_assigned') {
    title = 'Your fitter is getting ready';
    detail = 'We will show an arrival estimate when your fitter starts the journey.';
    label = 'FITTER ASSIGNED';
  } else if (input.status === 'en_route') {
    title = showDriver ? 'Your fitter is on the way' : 'Updating your arrival';
    detail = showDriver ? 'Follow your fitter on the map below.' : 'Waiting for a fresh location from your fitter. Your arrival estimate will return with the next update.';
    label = showDriver ? 'ON THE WAY' : 'LOCATION UPDATE PAUSED';
    if (showDriver && typeof input.etaMinutes === 'number' && Number.isFinite(input.etaMinutes) && input.etaMinutes >= 0 && input.etaMinutes <= 1440) {
      const suppliedArrival = input.estimatedArrivalAt ? Date.parse(input.estimatedArrivalAt) : NaN;
      const arrivalAt = Number.isFinite(suppliedArrival) ? suppliedArrival : receivedAt + input.etaMinutes * 60_000;
      const remaining = arrivalAt - Math.max(now, receivedAt);
      if (remaining >= 0 && remaining <= 24 * 60 * 60_000) {
        etaMinutes = Math.max(1, Math.ceil(remaining / 60_000));
        arrivalTime = trackingClock(arrivalAt);
        detail = input.driverName ? `${input.driverName} is heading to your location.` : detail;
      } else detail = 'We are updating your arrival estimate.';
    }
  } else if (['draft', 'pricing_ready', 'awaiting_payment', 'payment_failed'].includes(input.status)) {
    title = 'Your booking is being prepared';
    detail = input.status === 'payment_failed' ? 'Your payment needs attention. Contact us if you need help.' : 'Complete your booking to arrange a fitter.';
    label = 'BOOKING IN PROGRESS';
  } else if (input.scheduledAt) {
    title = 'Your visit is booked';
    detail = 'Your scheduled appointment is saved in Booking details. We will update you when your fitter is on the way.';
  }
  return { title, detail, label, showDriver, etaMinutes, arrivalTime };
}

const JOURNEY_STEPS = [
  { label: 'Booked', statuses: ['paid', 'deposit_paid'] },
  { label: 'Assigned', statuses: ['driver_assigned'] },
  { label: 'On way', statuses: ['en_route'] },
  { label: 'Arrived', statuses: ['arrived', 'in_progress'] },
  { label: 'Complete', statuses: ['completed'] },
] as const;

export function trackingJourneySteps(status: string, history: { status: string; timestamp: string }[] = []) {
  if (!isTrackingStatusActive(status) && status !== 'completed') return [];
  const currentIndex = JOURNEY_STEPS.findIndex(step => (step.statuses as readonly string[]).includes(status));
  return JOURNEY_STEPS.map((step, index) => {
    const event = history.find(item => item.status === step.statuses[0] && Number.isFinite(Date.parse(item.timestamp))) ??
      history.find(item => (step.statuses as readonly string[]).includes(item.status) && Number.isFinite(Date.parse(item.timestamp)));
    return {
      label: step.label,
      state: currentIndex === -1 ? 'upcoming' : index < currentIndex || status === 'completed' ? 'complete' : index === currentIndex ? 'current' : 'upcoming',
      time: event ? trackingClock(event.timestamp) : null,
    };
  });
}
