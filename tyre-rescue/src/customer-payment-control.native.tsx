import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { InlineNotice, LoadingState, PrimaryButton } from './ui';
import { extractPaymentIntentId, useCustomerPayment } from './use-customer-payment';

interface CustomerPaymentControlProps {
  amountLabel: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  refNumber?: string;
}

export function CustomerPaymentControl({ amountLabel, clientSecret, onPaid }: CustomerPaymentControlProps) {
  const { prepare, pay } = useCustomerPayment();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    try {
      await pay();
      await onPaid(extractPaymentIntentId(clientSecret));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment was not completed.');
    } finally {
      setLoading(false);
    }
  }, [clientSecret, onPaid, pay]);

  return (
    <View>
      {!ready && !error ? <LoadingState label="Preparing Stripe..." /> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton icon="lock" loading={loading} disabled={!ready} onPress={handlePay}>
        Pay {amountLabel}
      </PrimaryButton>
    </View>
  );
}
