import { useEffect, type ReactElement } from 'react';
import { Linking } from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { APPLE_MERCHANT_ID, STRIPE_PUBLISHABLE_KEY } from './config';
import { isStripeRedirectUrl } from './customer-payment-redirect';

const stripePublishableKey = STRIPE_PUBLISHABLE_KEY.trim();
const isProductionBuild = typeof __DEV__ !== 'undefined' && !__DEV__;
const canInitializeStripe =
  /^pk_(test|live)_/.test(stripePublishableKey) &&
  !(isProductionBuild && stripePublishableKey.startsWith('pk_test_'));

/** Forward bank authentication returns to Stripe without treating URL parameters as payment proof. */
function CustomerStripeReturnHandler() {
  const { handleURLCallback } = useStripe();

  useEffect(() => {
    let active = true;
    const inFlight = new Set<string>();
    const handleReturn = async (url: string | null) => {
      if (!active || !url || !isStripeRedirectUrl(url) || inFlight.has(url)) return;
      inFlight.add(url);
      try {
        await handleURLCallback(url);
      } catch {
        // Checkout's timeout and authenticated status check handle an unsuccessful callback.
        // Never log the URL: bank returns can contain a Stripe client secret.
      } finally {
        inFlight.delete(url);
      }
    };
    const subscription = Linking.addEventListener('url', event => { void handleReturn(event.url); });
    void Linking.getInitialURL().then(handleReturn).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, [handleURLCallback]);

  return null;
}

export function CustomerStripeProvider({ children }: { children: ReactElement | ReactElement[] }) {
  if (!canInitializeStripe) {
    return <>{children}</>;
  }

  return (
    <StripeProvider
      publishableKey={stripePublishableKey}
      merchantIdentifier={APPLE_MERCHANT_ID}
      urlScheme="tyrerescue"
    >
      <>
        <CustomerStripeReturnHandler />
        {children}
      </>
    </StripeProvider>
  );
}
