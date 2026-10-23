import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { InlineNotice, LoadingState, PrimaryButton } from './ui';
import { extractPaymentIntentId, useCustomerPayment } from './use-customer-payment';
import { withDeadline } from './booking-safety';

interface CustomerPaymentControlProps {
  amountLabel: string;
  clientSecret: string;
  onPaid: (paymentIntentId: string) => Promise<void>;
  refNumber?: string;
  onPaymentAttempt: (paymentIntentId: string) => Promise<void>;
  onPaymentCancelled: () => Promise<void>;
  onPaymentActivity: (active: boolean) => void;
  onCheckPaymentStatus?: (paymentIntentId: string) => Promise<{
    paymentIntentId: string;
    status: string;
    canResume: boolean;
  }>;
  disabled?: boolean;
}

const SETUP_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 25_000;

export function CustomerPaymentControl({ amountLabel, clientSecret, onPaid, onPaymentAttempt, onPaymentCancelled, onPaymentActivity, onCheckPaymentStatus, disabled }: CustomerPaymentControlProps) {
  const { prepare, pay, isPresenting } = useCustomerPayment();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPaymentIntentId, setPendingPaymentIntentId] = useState<string | null>(null);
  const [retryPayment, setRetryPayment] = useState(false);
  const pending = useRef<string | null>(null);
  const busy = useRef(false);
  const settingUp = useRef(false);
  const mounted = useRef(true);
  const setupRevision = useRef(0);
  const operationRevision = useRef(0);
  const activity = useRef(false);
  const resumeCheck = useRef<(() => Promise<void>) | null>(null);

  const invalidateOperations = useCallback(() => {
    setupRevision.current++;
    operationRevision.current++;
    settingUp.current = false;
  }, []);

  const setActivity = useCallback((active: boolean) => {
    if (activity.current === active) return;
    activity.current = active;
    onPaymentActivity(active);
  }, [onPaymentActivity]);

  const setup = useCallback(async () => {
    if (settingUp.current) return false;
    if (isPresenting?.()) {
      setReady(false);
      setError('The previous payment window is still open. Close it and retry payment setup.');
      return false;
    }
    settingUp.current = true;
    const revision = ++setupRevision.current;
    const current = () => mounted.current && setupRevision.current === revision;
    setReady(false);
    setError(null);
    try {
      await withDeadline(prepare(clientSecret), SETUP_TIMEOUT_MS, 'Preparing payment timed out. Check your connection and retry payment setup.');
      if (!current()) return false;
      setReady(true);
      return true;
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : 'Unable to prepare Stripe payment.');
      return false;
    } finally {
      if (setupRevision.current === revision) settingUp.current = false;
    }
  }, [clientSecret, prepare, isPresenting]);

  useEffect(() => {
    mounted.current = true;
    void setup();
    return () => {
      mounted.current = false;
      invalidateOperations();
      if (activity.current) { activity.current = false; onPaymentActivity(false); }
    };
    // Account/payment changes mount a new control; callback identities do not restart checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, setup, invalidateOperations]);

  const handlePay = useCallback(async () => {
    if (busy.current || disabled || (!pending.current && !ready)) return;
    busy.current = true;
    const revision = ++operationRevision.current;
    const current = () => mounted.current && operationRevision.current === revision;
    setActivity(true);
    setLoading(true);
    setError(null);

    const remember = (id: string | null) => {
      pending.current = id;
      if (current()) setPendingPaymentIntentId(id);
    };
    const confirm = async (id: string) => {
      await withDeadline(onPaid(id), SETUP_TIMEOUT_MS, 'Confirmation is taking longer than expected. Check this same payment again; do not pay again.');
    };
    const checkExisting = async (id: string, sdkError?: Error) => {
      if (!onCheckPaymentStatus) {
        // Older callers can only retry confirmation, never start a fresh charge after an uncertain result.
        await confirm(id);
        return;
      }
      const result = await withDeadline(onCheckPaymentStatus(id), STATUS_TIMEOUT_MS, 'Payment status could not be checked yet. Check the same payment again; do not pay again.');
      if (!current()) return;
      if (result.paymentIntentId !== id) throw new Error('This payment needs review by our team. Do not make another payment.');
      if (result.status === 'succeeded') {
        await confirm(id);
        return;
      }
      if (result.canResume && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(result.status)) {
        if (isPresenting?.()) throw new Error('The previous payment window is still closing. Close it and check this payment again before retrying.');
        // Failed/unknown attempts retain their durable proof until payment confirmation. A bank
        // action still in progress must also survive app restarts, even if the sheet was cancelled.
        if (sdkError?.name === 'PaymentCancelled' && result.status !== 'requires_action') {
          await withDeadline(onPaymentCancelled(), SETUP_TIMEOUT_MS, 'Unable to save the payment status. Check this same payment again before retrying.');
        }
        if (!current()) return;
        remember(null);
        setRetryPayment(true);
        const prepared = await setup();
        if (current() && prepared) {
          setError(sdkError?.name === 'PaymentCancelled'
            ? 'Payment cancelled. No payment was completed. You can try this same payment again.'
            : sdkError
              ? `${sdkError.name === 'PaymentFailed' ? 'Payment failed. ' : sdkError.name === 'PaymentTimedOut' ? 'Payment timed out. ' : ''}${sdkError.message} Our server confirmed this payment can be retried.`
              : 'No payment was completed. You can retry this same payment.');
        }
        return;
      }
      if (result.status === 'processing' || result.status === 'requires_capture') {
        throw new Error('Your bank is still processing this payment. Check the same payment again; do not pay again.');
      }
      throw new Error('This payment needs help from our team. Please contact us before making another payment.');
    };

    try {
      if (pending.current) {
        await checkExisting(pending.current);
        return;
      }
      const id = extractPaymentIntentId(clientSecret);
      if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new Error('Unable to identify this payment. Please contact the team.');
      setRetryPayment(false);
      await withDeadline(onPaymentAttempt(id), SETUP_TIMEOUT_MS, 'Unable to save this payment attempt. Retry when your connection is available.');
      if (!current()) return;
      remember(id);
      let sdkError: Error | undefined;
      try { await pay(); }
      catch (err) { sdkError = err instanceof Error ? err : new Error('Stripe did not return a payment result.'); }
      if (!current()) return;
      if (sdkError) {
        try { await checkExisting(id, sdkError); }
        catch (checkError) {
          throw new Error(`${sdkError.message} ${checkError instanceof Error ? checkError.message : 'Check the same payment again before retrying.'}`);
        }
      } else await confirm(id);
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : 'Payment was not completed. Check this same payment before retrying.');
    } finally {
      if (operationRevision.current === revision) {
        busy.current = false;
        setActivity(false);
        if (mounted.current) setLoading(false);
      }
    }
  }, [clientSecret, onPaid, pay, onPaymentAttempt, onPaymentCancelled, onCheckPaymentStatus, disabled, ready, setActivity, setup, isPresenting]);

  resumeCheck.current = handlePay;
  useEffect(() => {
    let previous = AppState?.currentState;
    const subscription = AppState?.addEventListener?.('change', (next) => {
      const returned = previous === 'background' && next === 'active';
      previous = next;
      // Never reopen checkout on return from a bank app. Only check the already recorded payment.
      if (returned && pending.current && !busy.current) void resumeCheck.current?.();
    });
    return () => subscription?.remove();
  }, []);

  return (
    <View>
      {!ready && !error ? <LoadingState label="Preparing Stripe..." /> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {pendingPaymentIntentId ? <InlineNotice>Your payment is being verified. This button checks the same payment and will not charge you again.</InlineNotice> : null}
      {!ready && error && !pendingPaymentIntentId ? <PrimaryButton icon="refresh-cw" disabled={disabled || loading} onPress={() => { if (!busy.current) void setup(); }}>Retry payment setup</PrimaryButton> : null}
      <PrimaryButton icon="lock" loading={loading} disabled={disabled || (!pendingPaymentIntentId && !ready)} onPress={handlePay}>
        {pendingPaymentIntentId ? 'Check booking confirmation' : retryPayment ? 'Retry payment' : `Pay ${amountLabel}`}
      </PrimaryButton>
    </View>
  );
}
