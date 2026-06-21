import { useCallback } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from './config';

export function extractPaymentIntentId(clientSecret: string) {
  return clientSecret.split('_secret_')[0];
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

    const { error } = await initPaymentSheet({
      merchantDisplayName: 'Tyre Rescue',
      paymentIntentClientSecret: clientSecret,
      returnURL: 'tyrerescue://stripe-redirect',
      allowsDelayedPaymentMethods: false,
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
    const { error } = await presentPaymentSheet();
    if (error) throw new Error(error.message);
  }, [presentPaymentSheet]);

  return { prepare, pay };
}
