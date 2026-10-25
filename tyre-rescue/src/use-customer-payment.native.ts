import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { APPLE_MERCHANT_ID, STRIPE_PUBLISHABLE_KEY } from './config';

export function extractPaymentIntentId(clientSecret: string) {
  return clientSecret.split('_secret_')[0];
}

export const PAYMENT_SHEET_TIMEOUT_MS = 120_000;
export const PAYMENT_SHEET_WATCHDOG_MS = 135_000;
// Stripe owns one native sheet. Keep the lock across route/control remounts until native settles.
let paymentSheetPresentation: Promise<unknown> | null = null;

function paymentError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function awaitPaymentSheet<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(paymentError('PaymentUnknown', 'The payment window did not return a result. Check this payment before trying again.')), PAYMENT_SHEET_WATCHDOG_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateStripePublishableKey() {
  const stripePublishableKey = STRIPE_PUBLISHABLE_KEY.trim();
  const isProductionBuild = typeof __DEV__ !== 'undefined' && !__DEV__;

  if (!/^pk_(test|live)_/.test(stripePublishableKey)) {
    throw new Error('Stripe publishable key is missing or invalid for this build.');
  }

  if (isProductionBuild && stripePublishableKey.startsWith('pk_test_')) {
    throw new Error('Stripe test publishable key is configured in this production build.');
  }
}

export function useCustomerPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const prepare = useCallback(async (clientSecret: string) => {
    validateStripePublishableKey();
    if (paymentSheetPresentation) throw paymentError('PaymentUnknown', 'The previous payment window is still open. Close it before retrying.');

    const { error } = await initPaymentSheet({
      merchantDisplayName: 'Tyre Rescue',
      paymentIntentClientSecret: clientSecret,
      returnURL: 'tyrerescue://stripe-redirect',
      allowsDelayedPaymentMethods: false,
      ...(Platform.OS === 'ios' && APPLE_MERCHANT_ID
        ? { applePay: { merchantCountryCode: 'GB' } }
        : {}),
      appearance: {
        colors: {
          primary: '#F97316',
          background: '#18181B',
          componentBackground: '#27272A',
          componentBorder: '#3F3F46',
          componentText: '#FAFAFA',
          primaryText: '#FAFAFA',
          secondaryText: '#A1A1AA',
          placeholderText: '#71717A',
          icon: '#F97316',
          error: '#EF4444',
        },
        shapes: {
          borderRadius: 6,
        },
      },
    });
    if (error) throw new Error(error.message);
  }, [initPaymentSheet]);

  const pay = useCallback(async () => {
    if (paymentSheetPresentation) throw paymentError('PaymentUnknown', 'The previous payment window is still open. Check the same payment before retrying.');
    try {
      // The native timeout dismisses the sheet. A JS-only timeout cannot close a native modal.
      const presentation = Promise.resolve().then(() => presentPaymentSheet({ timeout: PAYMENT_SHEET_TIMEOUT_MS }))
        .finally(() => { if (paymentSheetPresentation === presentation) paymentSheetPresentation = null; });
      paymentSheetPresentation = presentation;
      const { error } = await awaitPaymentSheet(presentation);
      if (error) {
        const name = error.code === 'Canceled' ? 'PaymentCancelled'
          : error.code === 'Failed' ? 'PaymentFailed'
            : error.code === 'Timeout' ? 'PaymentTimedOut' : 'PaymentUnknown';
        throw paymentError(name, error.message);
      }
    } catch (error) {
      if (error instanceof Error && error.name.startsWith('Payment')) throw error;
      throw paymentError('PaymentUnknown', error instanceof Error ? error.message : 'Stripe did not return a payment result.');
    }
  }, [presentPaymentSheet]);

  const isPresenting = useCallback(() => paymentSheetPresentation !== null, []);
  return { prepare, pay, isPresenting };
}
