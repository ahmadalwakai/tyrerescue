import type { ReactElement } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PUBLISHABLE_KEY } from './config';

const stripePublishableKey = STRIPE_PUBLISHABLE_KEY.trim();
const isProductionBuild = typeof __DEV__ !== 'undefined' && !__DEV__;
const canInitializeStripe =
  /^pk_(test|live)_/.test(stripePublishableKey) &&
  !(isProductionBuild && stripePublishableKey.startsWith('pk_test_'));

export function CustomerStripeProvider({ children }: { children: ReactElement | ReactElement[] }) {
  if (!canInitializeStripe) {
    return <>{children}</>;
  }

  return (
    <StripeProvider
      publishableKey={stripePublishableKey}
      urlScheme="tyrerescue"
    >
      {children}
    </StripeProvider>
  );
}
