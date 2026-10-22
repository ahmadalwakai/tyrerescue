import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { InlineNotice, LoadingState, PrimaryButton } from './ui';
import { extractPaymentIntentId, useCustomerPayment } from './use-customer-payment';
import { confirmCustomerPayment } from './booking-safety';

interface CustomerPaymentControlProps {
  amountLabel: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  refNumber?: string;
  onPaymentAttempt: (paymentIntentId: string) => Promise<void>;
  onPaymentCancelled: () => Promise<void>;
  onPaymentActivity: (active: boolean) => void;
  disabled?: boolean;
}

export function CustomerPaymentControl({ amountLabel, clientSecret, onPaid, onPaymentAttempt, onPaymentCancelled, onPaymentActivity, disabled }: CustomerPaymentControlProps) {
  const { prepare, pay } = useCustomerPayment();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPaymentIntentId, setPendingPaymentIntentId] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      setReady(false);
      setError(null);
      try {
        await prepare(clientSecret);
        if (mounted) setReady(true);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to prepare Stripe payment.');
        }
      }
    }

    setup();

    return () => {
      mounted = false;
    };
  }, [clientSecret, prepare]);

  const handlePay = useCallback(async () => {
    if (busy.current || disabled) return;
    busy.current = true;
    onPaymentActivity(true);
    setLoading(true);
    setError(null);
    try {
      await confirmCustomerPayment({
        pendingPaymentIntentId,
        pay: async () => {
          const id = extractPaymentIntentId(clientSecret);
          await onPaymentAttempt(id);
          try { await pay(); }
          catch (err) {
            if (err instanceof Error && err.name === 'PaymentCancelled') { await onPaymentCancelled(); throw err; }
            // The server decides whether this attempt was charged when SDK/network results are unclear.
          }
          return id;
        },
        remember: setPendingPaymentIntentId,
        confirm: onPaid,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment was not completed.');
    } finally {
      busy.current = false;
      onPaymentActivity(false);
      setLoading(false);
    }
  }, [clientSecret, onPaid, pay, pendingPaymentIntentId, onPaymentAttempt, onPaymentCancelled, onPaymentActivity, disabled]);

  return (
    <View>
      {!ready && !error ? <LoadingState label="Preparing Stripe..." /> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {pendingPaymentIntentId ? <InlineNotice>Your payment is being verified. This button checks the same payment and will not charge you again.</InlineNotice> : null}
      <PrimaryButton icon="lock" loading={loading} disabled={disabled || !ready} onPress={handlePay}>
        {pendingPaymentIntentId ? 'Check booking confirmation' : `Pay ${amountLabel}`}
      </PrimaryButton>
    </View>
  );
}
