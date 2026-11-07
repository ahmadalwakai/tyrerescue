export interface BookingConversionPaymentRecord {
  amount: string | number | null;
  currency?: string | null;
  status?: string | null;
  stripePiId?: string | null;
}

export interface BookingConversionPayload {
  transactionId: string;
  value: number;
  currency: 'GBP';
  email?: string;
  paymentIntentId?: string | null;
  /** Attribution from the stored booking, never from the return URL. */
  sourceApp?: string;
}

function normalizeAmount(value: string | number | null): number | null {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function buildBookingConversionPayload({
  refNumber,
  customerEmail,
  payment,
  sourceApp,
}: {
  refNumber: string;
  customerEmail?: string | null;
  payment: BookingConversionPaymentRecord | null | undefined;
  sourceApp?: string | null;
}): BookingConversionPayload | null {
  const transactionId = refNumber.trim();
  if (!transactionId || payment?.status !== 'succeeded') return null;

  const currency = (payment.currency ?? 'gbp').trim().toLowerCase();
  if (currency !== 'gbp') return null;

  const value = normalizeAmount(payment.amount);
  if (value === null) return null;

  const email = customerEmail?.trim().toLowerCase() || undefined;
  return {
    transactionId,
    value,
    currency: 'GBP',
    email,
    paymentIntentId: payment.stripePiId ?? null,
    ...(sourceApp ? { sourceApp } : {}),
  };
}
