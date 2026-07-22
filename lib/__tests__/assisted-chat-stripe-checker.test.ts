import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  derivePaymentLinkLiveStatus,
  getStripeAutoCheckDelayMs,
  getPaymentLinkStatusLabel,
  getStripeCheckButtonLabel,
  isPaymentLinkEligibleForAutoCheck,
  isPaymentLinkTerminalStatus,
  shouldIgnoreStalePaymentLinkStatus,
  STRIPE_AUTO_CHECK_FAST_INTERVAL_MS,
  STRIPE_AUTO_CHECK_FIRST_MINUTE_MS,
  STRIPE_AUTO_CHECK_SLOW_INTERVAL_MS,
  STRIPE_AUTO_CHECK_STOP_AFTER_MS,
} from '../../assisted-chat-app/src/lib/payment-link-status';

const repoRoot = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(repoRoot, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');
const paymentHookPath = path.join(repoRoot, 'assisted-chat-app/src/hooks/useAdminPaymentLink.ts');

const assistedChatScreenSource = () => readFileSync(assistedChatScreenPath, 'utf8');
const paymentHookSource = () => readFileSync(paymentHookPath, 'utf8');

describe('Assisted Chat Stripe checker regression', () => {
  it('keeps Stripe Checker inside the payment link card used by the active workflow', () => {
    const source = assistedChatScreenSource();
    const inlineStart = source.indexOf('function PaymentLinkInline');
    const inlineEnd = source.indexOf('const SHEET_ACTION_ICONS', inlineStart);
    const inlineSource = source.slice(inlineStart, inlineEnd);
    const inlineCallSources = [...source.matchAll(/<PaymentLinkInline[\s\S]*?\/>/g)].map((match) => match[0]);

    expect(inlineSource).toContain('getStripeCheckButtonLabel');
    expect(inlineSource).toContain('onCheck');
    expect(inlineSource).toContain('loading={checking}');
    expect(inlineSource).toContain('autoCheckMessage');
    expect(inlineSource).toContain("liveStatus === 'paid'");
    expect(inlineCallSources.length).toBeGreaterThanOrEqual(4);
    expect(inlineCallSources.every((call) => call.includes('onCheck={paymentLinkActions.checkNow}'))).toBe(true);
    expect(inlineCallSources.every((call) => call.includes('liveStatus={paymentLinkActions.liveStatus}'))).toBe(true);
    expect(inlineCallSources.every((call) => call.includes('autoCheckMessage={paymentLinkActions.autoCheckMessage}'))).toBe(true);
  });

  it('guards Stripe checks against duplicate requests, timeouts, and abandoned screens', () => {
    const source = paymentHookSource();

    expect(source).toContain('checkInflight');
    expect(source).toContain('withStripeCheckTimeout');
    expect(source).toContain('STRIPE_CHECK_TIMEOUT_MS');
    expect(source).toContain('Stripe payment check timed out');
    expect(source).toContain('AbortController');
    expect(source).toContain('abortControllerRef.current?.abort()');
    expect(source).toContain("runStripeCheck('manual')");
    expect(source).toContain("runStripeCheck('auto')");
    expect(source).toContain('/payment-link/check');
    expect(source).not.toContain('setInterval');
  });

  it('runs automatic checks only when the payment surface is visible', () => {
    const screenSource = assistedChatScreenSource();
    const hookSource = paymentHookSource();

    expect(screenSource).toContain("const paymentAutoCheckActive = activeStage === 'PAYMENT' || activeStage === 'DISPATCHED'");
    expect(screenSource).toContain('autoCheckActive: paymentAutoCheckActive');
    expect(hookSource).toContain('AppState.addEventListener');
    expect(hookSource).toContain('visibilitychange');
    expect(hookSource).toContain('browserNetworkIsOnline');
    expect(hookSource).toContain('STRIPE_AUTO_CHECK_STOP_AFTER_MS');
  });

  it('maps Stripe and canonical payment states to operator-facing labels', () => {
    expect(derivePaymentLinkLiveStatus({
      status: 'pending',
      linkStatus: 'sent',
      amountToCollectPence: 12000,
    })).toBe('awaiting');
    expect(derivePaymentLinkLiveStatus({
      status: 'paid',
      amountToCollectPence: 0,
    })).toBe('paid');
    expect(derivePaymentLinkLiveStatus({
      status: 'failed',
      linkStatus: 'failed',
      amountToCollectPence: 12000,
    })).toBe('failed');
    expect(derivePaymentLinkLiveStatus({
      status: 'failed',
      checkStatus: 'failed',
      message: 'Stripe payment intent was canceled.',
      amountToCollectPence: 12000,
    })).toBe('cancelled');
    expect(derivePaymentLinkLiveStatus({
      status: 'needs_checking',
      checkStatus: 'expired',
      linkStatus: 'expired',
      amountToCollectPence: 12000,
    })).toBe('expired');
    expect(derivePaymentLinkLiveStatus({
      status: 'balance_due',
      state: 'balance_due',
      amountToCollectPence: 9600,
      totalPaidPence: 2400,
    })).toBe('partial');
    expect(derivePaymentLinkLiveStatus({
      status: 'needs_checking',
      amountToCollectPence: 12000,
    })).toBe('checking');
    expect(derivePaymentLinkLiveStatus({
      status: 'refunded',
      state: 'refunded',
      amountToCollectPence: 0,
    })).toBe('refunded');

    expect(getPaymentLinkStatusLabel('paid')).toBe('Payment received');
    expect(getPaymentLinkStatusLabel('failed')).toBe('Payment failed');
    expect(getPaymentLinkStatusLabel('cancelled')).toBe('Payment cancelled');
    expect(getPaymentLinkStatusLabel('refunded')).toBe('Payment refunded');
    expect(getPaymentLinkStatusLabel('expired')).toBe('Payment link expired');
    expect(getPaymentLinkStatusLabel('partial')).toBe('Partial payment received');
    expect(getStripeCheckButtonLabel('paid')).toBe('Payment confirmed');
    expect(getStripeCheckButtonLabel('failed')).toBe('Recheck Stripe payment');
    expect(getStripeCheckButtonLabel('cancelled')).toBe('Recheck cancelled payment');
    expect(getStripeCheckButtonLabel('refunded')).toBe('Payment refunded');
    expect(getStripeCheckButtonLabel('expired')).toBe('Check expired payment');
    expect(getStripeCheckButtonLabel('partial')).toBe('Check remaining balance');
  });

  it('uses the required bounded automatic checker cadence', () => {
    expect(STRIPE_AUTO_CHECK_STOP_AFTER_MS).toBe(5 * 60_000);
    expect(getStripeAutoCheckDelayMs(0)).toBe(0);
    expect(getStripeAutoCheckDelayMs(1)).toBe(STRIPE_AUTO_CHECK_FAST_INTERVAL_MS);
    expect(getStripeAutoCheckDelayMs(STRIPE_AUTO_CHECK_FIRST_MINUTE_MS - 1)).toBe(STRIPE_AUTO_CHECK_FAST_INTERVAL_MS);
    expect(getStripeAutoCheckDelayMs(STRIPE_AUTO_CHECK_FIRST_MINUTE_MS)).toBe(STRIPE_AUTO_CHECK_SLOW_INTERVAL_MS);
  });

  it('keeps paid and refunded Stripe states terminal and never downgrades them', () => {
    expect(isPaymentLinkTerminalStatus('paid')).toBe(true);
    expect(isPaymentLinkTerminalStatus('refunded')).toBe(true);
    expect(isPaymentLinkTerminalStatus('failed')).toBe(true);
    expect(isPaymentLinkTerminalStatus('cancelled')).toBe(true);
    expect(isPaymentLinkTerminalStatus('expired')).toBe(true);
    expect(isPaymentLinkTerminalStatus('awaiting')).toBe(false);
    expect(isPaymentLinkEligibleForAutoCheck('awaiting')).toBe(true);
    expect(isPaymentLinkEligibleForAutoCheck('checking')).toBe(true);
    expect(isPaymentLinkEligibleForAutoCheck('partial')).toBe(true);
    expect(isPaymentLinkEligibleForAutoCheck('paid')).toBe(false);

    expect(shouldIgnoreStalePaymentLinkStatus('paid', 'awaiting')).toBe(true);
    expect(shouldIgnoreStalePaymentLinkStatus('paid', 'failed')).toBe(true);
    expect(shouldIgnoreStalePaymentLinkStatus('refunded', 'paid')).toBe(true);
    expect(shouldIgnoreStalePaymentLinkStatus('failed', 'awaiting')).toBe(true);
    expect(shouldIgnoreStalePaymentLinkStatus('partial', 'awaiting')).toBe(true);
    expect(shouldIgnoreStalePaymentLinkStatus('awaiting', 'paid')).toBe(false);
  });
});
