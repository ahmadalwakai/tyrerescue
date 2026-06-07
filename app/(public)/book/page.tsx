import { Metadata } from 'next';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { normalizePostcode, validateUkPostcode } from '@/lib/postcode';
import { normalizeVrm } from '@/lib/vrm';
import type {
  BookingType,
  ServiceType,
  TyreSize,
  WizardState,
} from '@/components/booking/types';
import type { QuoteServiceKey } from '@/types/vehicle';

export const metadata: Metadata = {
  title: 'Book Mobile Tyre Fitting Glasgow | Tyre Shop Near Me | Tyre Rescue',
  description:
    'Book a mobile tyre fitter in Glasgow and Edinburgh. New tyres near me, fitted at your home or workplace. Tyre shop that comes to you. Budget and premium brands available.',
};

interface BookSearchParams {
  postcode?: string;
  vrm?: string;
  size?: string;            // "205/55R16"
  service?: QuoteServiceKey;
  qty?: string;             // "1" | "2" | "4"
}

const SIZE_REGEX = /^(\d{3})\/(\d{2,3})R(\d{2})$/i;

function parseSize(raw: string | undefined): TyreSize | null {
  if (!raw) return null;
  const match = SIZE_REGEX.exec(raw);
  if (!match) return null;
  const [, width, aspect, rim] = match;
  return { width, aspect, rim };
}

function mapServiceToBooking(
  service: QuoteServiceKey | undefined
): { bookingType?: BookingType; serviceType?: ServiceType } {
  switch (service) {
    case 'emergency':
      return { bookingType: 'emergency', serviceType: 'fit' };
    case 'punctureRepair':
      return { bookingType: 'scheduled', serviceType: 'repair' };
    case 'fitting':
      return { bookingType: 'scheduled', serviceType: 'fit' };
    default:
      return {};
  }
}

function clampQty(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<BookSearchParams>;
}) {
  const params = await searchParams;
  const initialState: Partial<WizardState> = {};

  if (typeof params.postcode === 'string' && validateUkPostcode(params.postcode)) {
    initialState.address = normalizePostcode(params.postcode);
  }

  if (typeof params.vrm === 'string' && params.vrm.length > 0) {
    const vrm = normalizeVrm(params.vrm);
    if (vrm.length >= 2 && vrm.length <= 8) {
      initialState.vehicleReg = vrm;
    }
  }

  const tyreSize = parseSize(params.size);
  if (tyreSize) initialState.tyreSize = tyreSize;

  const { bookingType, serviceType } = mapServiceToBooking(params.service);
  if (bookingType) initialState.bookingType = bookingType;
  if (serviceType) initialState.serviceType = serviceType;

  const qty = clampQty(params.qty);
  if (qty != null) initialState.quantity = qty;

  const hasInitialState = Object.keys(initialState).length > 0;
  const initialStep = bookingType ? ('location' as const) : undefined;

  return (
    <BookingWizard
      initialState={hasInitialState ? initialState : undefined}
      initialStep={initialStep}
      resumeDraft={!hasInitialState}
    />
  );
}
