import { useCallback, useMemo, useState } from 'react';
import { PaymentElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, STRIPE_PUBLISHABLE_KEY } from './config';
import { colors, radii, typography } from './theme';
import { InlineNotice, PrimaryButton } from './ui';

const stripePromise =
  STRIPE_PUBLISHABLE_KEY && typeof window !== 'undefined'
    ? loadStripe(STRIPE_PUBLISHABLE_KEY)
    : null;

interface CustomerPaymentControlProps {
  amountLabel: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  refNumber: string;
}

export function CustomerPaymentControl({
  amountLabel,
  clientSecret,
  onPaid,
  refNumber,
}: CustomerPaymentControlProps) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: colors.accent,
          colorBackground: colors.surface,
          colorText: colors.text,
          colorDanger: colors.danger,
          fontFamily: 'system-ui, sans-serif',
          spacingUnit: '4px',
          borderRadius: `${radii.md}px`,
        },
      },
    }),
    [clientSecret],
  );

  if (!STRIPE_PUBLISHABLE_KEY || !stripePromise) {
    return <InlineNotice tone="danger">Stripe is not ready in this browser session.</InlineNotice>;
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <WebCheckout
        amountLabel={amountLabel}
        onPaid={onPaid}
        refNumber={refNumber}
      />
    </Elements>
  );
}

function WebCheckout({
  amountLabel,
  onPaid,
  refNumber,
}: Pick<CustomerPaymentControlProps, 'amountLabel' | 'onPaid' | 'refNumber'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = useCallback(async () => {
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    try {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        throw new Error(submitResult.error.message || 'Check your payment details and try again.');
      }

      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${API_BASE_URL}/success/${encodeURIComponent(refNumber)}`,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        throw new Error(stripeError.message || 'Payment failed. Please try again.');
      }

      if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        await onPaid(paymentIntent.id);
        return;
      }

      throw new Error(
        paymentIntent?.status
          ? `Payment not completed (${paymentIntent.status}). Please try again.`
          : 'Payment was not completed. Please try again.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment was not completed.');
    } finally {
      setLoading(false);
    }
  }, [elements, onPaid, refNumber, stripe]);

  return (
    <View style={styles.container}>
      <View style={styles.elementBox}>
        <PaymentElement
          options={{
            layout: 'accordion',
            wallets: {
              applePay: 'auto',
              googlePay: 'auto',
            },
          }}
        />
      </View>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton icon="lock" loading={loading} disabled={!stripe || !elements} onPress={handlePay}>
        Pay {amountLabel}
      </PrimaryButton>
      <Text style={styles.secureText}>Your payment is secured by Stripe. We never store your card details.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  elementBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 14,
  },
  secureText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
