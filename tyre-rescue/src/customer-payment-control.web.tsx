import { useCallback, useMemo, useRef, useState } from 'react';
import { PaymentElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, STRIPE_PUBLISHABLE_KEY } from './config';
import { colors, radii, typography } from './theme';
import { InlineNotice, PrimaryButton } from './ui';
import { confirmCustomerPayment } from './booking-safety';

const stripePromise =
  STRIPE_PUBLISHABLE_KEY && typeof window !== 'undefined'
    ? loadStripe(STRIPE_PUBLISHABLE_KEY)
    : null;

interface CustomerPaymentControlProps {
  amountLabel: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  refNumber: string;
  onPaymentAttempt: (paymentIntentId: string) => Promise<void>;
  onPaymentCancelled: () => Promise<void>;
  onPaymentActivity: (active: boolean) => void;
  disabled?: boolean;
}

export function CustomerPaymentControl({
  amountLabel,
  clientSecret,
  onPaid,
  refNumber,
  onPaymentAttempt,
  onPaymentActivity,
  disabled,
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
    <Elements key={clientSecret} stripe={stripePromise} options={options}>
      <WebCheckout
        amountLabel={amountLabel}
        onPaid={onPaid}
        refNumber={refNumber}
        clientSecret={clientSecret}
        onPaymentAttempt={onPaymentAttempt}
        onPaymentActivity={onPaymentActivity}
        disabled={disabled}
      />
    </Elements>
  );
}

function WebCheckout({
  amountLabel,
  onPaid,
  refNumber,
  clientSecret,
  onPaymentAttempt,
  onPaymentActivity,
  disabled,
}: Pick<CustomerPaymentControlProps, 'amountLabel' | 'onPaid' | 'refNumber' | 'clientSecret' | 'onPaymentAttempt' | 'onPaymentActivity' | 'disabled'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPaymentIntentId, setPendingPaymentIntentId] = useState<string | null>(null);
  const busy = useRef(false);

  const handlePay = useCallback(async () => {
    if (!stripe || !elements || busy.current || disabled) return;
    busy.current = true;
    onPaymentActivity(true);

    setLoading(true);
    setError(null);

    try {
      await confirmCustomerPayment({ pendingPaymentIntentId, remember: setPendingPaymentIntentId, confirm: onPaid, pay: async () => {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        throw new Error(submitResult.error.message || 'Check your payment details and try again.');
      }

      await onPaymentAttempt(clientSecret.split('_secret_')[0]);
      const outcome = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${API_BASE_URL}/success/${encodeURIComponent(refNumber)}`,
        },
        redirect: 'if_required',
      }).catch(() => null);
      if (!outcome) return clientSecret.split('_secret_')[0];
      const { error: stripeError, paymentIntent } = outcome;

      if (stripeError) {
        if (stripeError.type === 'api_connection_error' || stripeError.type === 'api_error') return clientSecret.split('_secret_')[0];
        throw new Error(stripeError.message || 'Payment failed. Please try again.');
      }

      if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        return paymentIntent.id;
      }

      throw new Error(
        paymentIntent?.status
          ? `Payment not completed (${paymentIntent.status}). Please try again.`
          : 'Payment was not completed. Please try again.',
      );
      } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment was not completed.');
    } finally {
      busy.current = false;
      onPaymentActivity(false);
      setLoading(false);
    }
  }, [elements, onPaid, refNumber, stripe, pendingPaymentIntentId, clientSecret, onPaymentAttempt, onPaymentActivity, disabled]);

  return (
    <View style={styles.container}>
      {!pendingPaymentIntentId ? <View style={styles.elementBox}>
        <PaymentElement
          options={{
            layout: 'accordion',
            wallets: {
              applePay: 'auto',
              googlePay: 'auto',
            },
          }}
        />
      </View> : <InlineNotice>Your payment is being verified. Checking confirmation will not charge you again.</InlineNotice>}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton icon="lock" loading={loading} disabled={disabled || !stripe || !elements} onPress={handlePay}>
        {pendingPaymentIntentId ? 'Check booking confirmation' : `Pay ${amountLabel}`}
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
